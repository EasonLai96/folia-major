import { verifyAsync } from '@noble/ed25519';
import type { ModSignatureInfo, ModSignatureInvalidReason } from '../types';
import trustedKeysSource from './trustedKeys.json';

// src/mods/android/androidModSignature.ts
// Android 版的官方签名校验：与 electron/modSystem/modSignature.cjs 同一套算法（签名摘要、签名消息的固定行格式、
// 渠道到状态的对应），只是换成浏览器能跑的 WebCrypto SHA-256 与 @noble/ed25519。受信任公钥在 trustedKeys.json，
// 必须与 electron/modSystem/trustedKeys.cjs 一致（test/unit/mod-system/androidModSignature.test.ts 核对）。
// 结果只是标签：不会因为签名有效就自动启用，启用仍要用户在确认框里点。

export const SIGNATURE_FILE = 'folium.sig.json';
const SIGNATURE_FORMAT = 'folium-signature';
const SIGNATURE_VERSION = 1;
const SIGNATURE_FILE_MAX_BYTES = 16 * 1024;
const IGNORED_FILE_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const MOD_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

type TrustedKey = {
    keyId: string;
    label?: string;
    channel?: string;
    publicKey: { kty: string; crv: string; x: string };
    revoked: boolean;
};

const TRUSTED_KEYS = trustedKeysSource.keys as TrustedKey[];
const REVOKED_DIGESTS = trustedKeysSource.revokedModDigests as string[];
const CHANNEL_STATUS: Record<string, 'verified' | 'beta'> = { release: 'verified', beta: 'beta' };

export type SignedFile = { relative: string; bytes: Uint8Array };

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');

const sha256 = async (bytes: Uint8Array) => hex(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));

const compareCodeUnits = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

const base64ToBytes = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));

const base64UrlToBytes = (value: string) => base64ToBytes(
    value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='),
);

/** 签名覆盖的文件的摘要（与桌面版逐字节一致）：路径 NFC、按码元排序，跳过签名文件本身与系统杂项文件。 */
export const computeSignedDigest = async (files: SignedFile[]): Promise<string> => {
    const covered = files
        .map(file => ({ ...file, relative: file.relative.normalize('NFC') }))
        .filter(file => file.relative !== SIGNATURE_FILE && !IGNORED_FILE_NAMES.has(file.relative.split('/').pop() ?? ''))
        .sort((left, right) => compareCodeUnits(left.relative, right.relative));
    for (let index = 1; index < covered.length; index += 1) {
        if (covered[index].relative === covered[index - 1].relative) {
            throw new Error(`signed-tree-has-duplicate-path:${covered[index].relative}`);
        }
    }
    const lines: string[] = [];
    for (const file of covered) {
        lines.push(`${await sha256(file.bytes)} ${file.relative}\n`);
    }
    return `sha256:${await sha256(new TextEncoder().encode(lines.join('')))}`;
};

type SignatureRecord = { modId: string; modVersion: string; digest: string; keyId: string; signedAt: string; signature: string };

const isSingleLine = (value: unknown, maxLength: number): value is string => (
    typeof value === 'string' && value.length > 0 && value.length <= maxLength && !/[\r\n]/.test(value)
);

const parseSignatureRecord = (raw: unknown): SignatureRecord | null => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const { format, version, modId, modVersion, digest, keyId, signedAt, signature } = raw as Record<string, unknown>;
    if (format !== SIGNATURE_FORMAT || version !== SIGNATURE_VERSION) return null;
    if (!isSingleLine(modId, 64) || !MOD_ID_PATTERN.test(modId)) return null;
    if (!isSingleLine(modVersion, 64)) return null;
    if (!isSingleLine(digest, 80) || !DIGEST_PATTERN.test(digest)) return null;
    if (!isSingleLine(keyId, 64) || !KEY_ID_PATTERN.test(keyId)) return null;
    if (!isSingleLine(signedAt, 64) || Number.isNaN(Date.parse(signedAt))) return null;
    if (!isSingleLine(signature, 200)) return null;
    return { modId, modVersion, digest, keyId, signedAt, signature };
};

const buildSignedMessage = (record: SignatureRecord) => new TextEncoder().encode([
    `${SIGNATURE_FORMAT}/${SIGNATURE_VERSION}`,
    `modId=${record.modId}`,
    `modVersion=${record.modVersion}`,
    `digest=${record.digest}`,
    `keyId=${record.keyId}`,
    `signedAt=${record.signedAt}`,
    '',
].join('\n'));

const outcome = (
    status: ModSignatureInfo['status'],
    reason: ModSignatureInvalidReason | null = null,
    extra: Partial<ModSignatureInfo> = {},
): ModSignatureInfo => ({ status, reason, keyId: null, keyLabel: null, signedAt: null, ...extra });

/** 校验一个模组的文件树（相对模组根目录的路径）对它的 id 与版本的官方签名。 */
export const verifyModSignature = async (
    files: SignedFile[],
    manifest: { id: string; version: string },
): Promise<ModSignatureInfo> => {
    const signatureFile = files.find(file => file.relative === SIGNATURE_FILE);
    if (!signatureFile) return outcome('unsigned');
    if (signatureFile.bytes.byteLength > SIGNATURE_FILE_MAX_BYTES) return outcome('invalid', 'malformed');
    let record: SignatureRecord | null = null;
    try {
        record = parseSignatureRecord(JSON.parse(new TextDecoder().decode(signatureFile.bytes)));
    } catch {
        record = null;
    }
    if (!record) return outcome('invalid', 'malformed');
    const base = { keyId: record.keyId, signedAt: record.signedAt };
    const key = TRUSTED_KEYS.find(candidate => candidate.keyId === record.keyId);
    if (!key) return outcome('invalid', 'unknown-key', base);
    const channel = key.channel === undefined ? 'release' : key.channel;
    if (!Object.hasOwn(CHANNEL_STATUS, channel)) return outcome('invalid', 'unknown-key', base);
    const withKey = { ...base, keyLabel: key.label ?? null };
    if (key.revoked) return outcome('invalid', 'revoked-key', withKey);
    if (record.modId !== manifest.id || record.modVersion !== manifest.version) {
        return outcome('invalid', 'mod-mismatch', withKey);
    }
    let valid = false;
    try {
        valid = await verifyAsync(base64ToBytes(record.signature), buildSignedMessage(record), base64UrlToBytes(key.publicKey.x));
    } catch {
        valid = false;
    }
    if (!valid) return outcome('invalid', 'bad-signature', withKey);
    let actual: string;
    try {
        actual = await computeSignedDigest(files);
    } catch {
        return outcome('invalid', 'unverifiable', withKey);
    }
    if (actual !== record.digest) return outcome('invalid', 'digest-mismatch', withKey);
    if (REVOKED_DIGESTS.includes(actual)) return outcome('invalid', 'revoked-mod', withKey);
    return outcome(CHANNEL_STATUS[channel], null, withKey);
};
