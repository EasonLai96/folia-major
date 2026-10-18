import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { unzipSync } from 'fflate';
import type { ModRuntimeInfo, ModSetEnabledResult, ModsListPayload } from '../types';
import { FOLIUM_HOST_VERSION } from '../folium/shared';
import { useDesktopSettingsStore } from '../../stores/useDesktopSettingsStore';
import { computeSignedDigest, verifyModSignature, type SignedFile } from './androidModSignature';

// src/mods/android/androidModHost.ts
// Android App 的模组宿主，顶替桌面版主进程那一半（electron/modSystem/），只做手机上做得到的：
//   - 只装只有 client 入口的模组；有 main（Node）入口的拒装，市场里标「仅电脑版」；
//   - zip 解到 App 私有目录 Data/mods/<id>/，client 从 WebView 的本地文件地址按 ES 模块导入；
//   - 安装时校验官方签名（androidModSignature.ts），状态与桌面版一样只是标签；
//   - 启用要用户在确认框里点，确认绑在文件摘要上：文件变了（升级）就回到未启用；
//   - folium.storage 存在 Data/mods-data/<id>.json；folium.net.fetch 走原生 HTTP（不受 CORS 限制）。
// ipc.ts 在 Android 上把 window.electron.mods 的那组调用转到这里；不往 window.electron 上挂东西，
// 否则整个应用会以为自己是桌面版。

const MODS_DIR = 'mods';
const DATA_DIR = 'mods-data';
const STATE_KEY = 'folia_android_mods_v1';
const MOD_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const LIMITS = { maxArchiveBytes: 64 * 1024 * 1024, maxEntries: 2000, maxTotalBytes: 64 * 1024 * 1024, maxFileBytes: 32 * 1024 * 1024 };
// Folium 1.5 的旧权限名，与 electron/modSystem/deprecated.cjs 的 OLD_PERMISSIONS 相同。
const OLD_PERMISSIONS: Record<string, string> = { 'runtime.playback': 'playback.read', 'ui.stage': 'stageLayers' };
const NET_FETCH_MAX_BYTES = 8 * 1024 * 1024;

type InstalledMod = {
    id: string;
    name: string;
    version: string;
    author: string | null;
    description: string | null;
    client: string;
    permissions: string[];
    experimental: string[];
    embedOrigins: string[];
    folia: string | null;
    signature: ModRuntimeInfo['signature'];
    /** 安装时文件树的签名摘要，启用确认绑在它上面。 */
    digest: string;
    /** 用户确认启用时的摘要；与 digest 不同就是未启用。 */
    approvedDigest: string | null;
    enabled: boolean;
    installedAt: number;
};

type HostState = { mods: Record<string, InstalledMod> };

const readState = (): HostState => {
    try {
        const raw = localStorage.getItem(STATE_KEY);
        const parsed = raw ? JSON.parse(raw) as HostState : null;
        return parsed && typeof parsed.mods === 'object' && parsed.mods ? parsed : { mods: {} };
    } catch {
        return { mods: {} };
    }
};

const writeState = (state: HostState) => localStorage.setItem(STATE_KEY, JSON.stringify(state));

const isModSystemEnabled = () => useDesktopSettingsStore.getState().modSystemEnabled;

const stateListeners = new Set<(mods: ModRuntimeInfo[]) => void>();
const baseUris = new Map<string, string>();

const modBaseUri = async (id: string): Promise<string> => {
    const cached = baseUris.get(id);
    if (cached) return cached;
    const { uri } = await Filesystem.getUri({ directory: Directory.Data, path: `${MODS_DIR}/${id}` });
    // file:///data/user/0/... → https://localhost/_capacitor_file_/data/user/0/...（WebView 能按模块导入的地址）
    const base = Capacitor.convertFileSrc(uri);
    baseUris.set(id, base);
    return base;
};

const shortDigest = (digest: string) => (digest.length > 19 ? digest.slice(7, 19) : 'unknown');

const toRuntimeInfo = async (mod: InstalledMod): Promise<ModRuntimeInfo> => {
    const enabled = mod.enabled && mod.approvedDigest === mod.digest;
    return {
        id: mod.id,
        name: mod.name,
        version: mod.version,
        author: mod.author,
        description: mod.description,
        permissions: mod.permissions,
        status: enabled ? 'loaded' : 'disabled',
        error: null,
        enabled,
        trustStale: mod.enabled && mod.approvedDigest !== mod.digest,
        signature: mod.signature,
        devSource: false,
        experimental: mod.experimental,
        embedOrigins: mod.embedOrigins,
        folia: mod.folia,
        hasMain: false,
        clientUrl: enabled ? `${await modBaseUri(mod.id)}/${mod.client}?v=${shortDigest(mod.digest)}` : null,
        loadOrder: null,
        warnings: [],
    };
};

const listRuntime = async (): Promise<ModRuntimeInfo[]> => {
    if (!isModSystemEnabled()) return [];
    const mods = Object.values(readState().mods).sort((left, right) => left.id.localeCompare(right.id));
    const list = await Promise.all(mods.map(toRuntimeInfo));
    return list.map((mod, index) => ({ ...mod, loadOrder: mod.status === 'loaded' ? index : null }));
};

const notify = async () => {
    const mods = await listRuntime();
    stateListeners.forEach(listener => listener(mods));
    return mods;
};

/** 已装模组的 id 与版本（市场页标「已安装 / 可更新」用）；模组系统关着时也读得到。 */
export const readInstalledAndroidMods = (): Record<string, { version: string; enabled: boolean }> => Object.fromEntries(
    Object.values(readState().mods).map(mod => [mod.id, { version: mod.version, enabled: mod.enabled && mod.approvedDigest === mod.digest }]),
);

export const listAndroidMods = async (): Promise<ModsListPayload> => ({
    mods: await listRuntime(),
    ffmpeg: { available: false, path: null, version: null, candidates: [] },
    directories: [],
    startSkipped: false,
});

/** 启用前的确认：模组以应用的完整权限运行，签名只说明来源。 */
const confirmEnable = (mod: InstalledMod): boolean => {
    const signatureLine = mod.signature.status === 'verified'
        ? `签名：官方认证（${mod.signature.keyLabel ?? mod.signature.keyId ?? ''}）`
        : mod.signature.status === 'beta'
            ? '签名：先行测试（只通过了安全审查，功能可能不完整）'
            : mod.signature.status === 'unsigned'
                ? '签名：未验证（第三方模组，未经官方审查）'
                : `签名：校验失败（${mod.signature.reason ?? ''}）`;
    const permissionLine = mod.permissions.length > 0 ? `权限：${mod.permissions.join('、')}` : '权限：无';
    return window.confirm([
        `启用模组「${mod.name}」 v${mod.version}？`,
        ...(mod.author ? [`作者：${mod.author}`] : []),
        signatureLine,
        permissionLine,
        '',
        '启用后模组的界面代码会以应用的完整权限运行。请只启用你信任来源的模组。',
    ].join('\n'));
};

export const setAndroidModEnabled = async (modId: string, enabled: boolean): Promise<ModSetEnabledResult> => {
    if (!isModSystemEnabled()) return { ok: false, error: 'mod-system-disabled', mods: [] };
    const state = readState();
    const mod = state.mods[modId];
    if (!mod) return { ok: false, error: 'mod-not-found', mods: await listRuntime() };
    if (enabled && mod.approvedDigest !== mod.digest) {
        if (!confirmEnable(mod)) {
            console.info('[AndroidMods] Enable declined', { modId });
            return { ok: false, error: 'enable-declined', mods: await listRuntime() };
        }
        mod.approvedDigest = mod.digest;
    }
    mod.enabled = enabled;
    writeState(state);
    console.info('[AndroidMods] Mod enabled state changed', { modId, enabled });
    return { ok: true, mods: await notify() };
};

export const reloadAndroidMods = async () => ({ mods: await notify() });

/** 删掉一个已安装的模组（文件、存储与启用状态）。 */
export const uninstallAndroidMod = async (modId: string): Promise<{ ok: boolean; error?: string }> => {
    const state = readState();
    if (!state.mods[modId]) return { ok: false, error: 'mod-not-found' };
    delete state.mods[modId];
    writeState(state);
    baseUris.delete(modId);
    storageCache.delete(modId);
    await Filesystem.rmdir({ directory: Directory.Data, path: `${MODS_DIR}/${modId}`, recursive: true }).catch(() => undefined);
    await Filesystem.deleteFile({ directory: Directory.Data, path: `${DATA_DIR}/${modId}.json` }).catch(() => undefined);
    console.info('[AndroidMods] Mod uninstalled', { modId });
    await notify();
    return { ok: true };
};

const isSafeRelativePath = (value: unknown): value is string => (
    typeof value === 'string' && value.trim().length > 0 && !value.includes('..') && !value.includes('\\')
    && !value.startsWith('/') && !/^[a-zA-Z]:/.test(value)
);

type ZipEntry = { segments: string[]; bytes: Uint8Array };

/** 在安装上限内解开 zip：先按声明的大小在解压前拦，再按实际字节复查（同 zipInstall.cjs）。 */
const readZip = (archive: Uint8Array): { ok: true; entries: ZipEntry[] } | { ok: false; error: string } => {
    if (archive.byteLength > LIMITS.maxArchiveBytes) return { ok: false, error: 'install-too-large' };
    let limitError: string | null = null;
    let count = 0;
    let declared = 0;
    let files: Record<string, Uint8Array>;
    try {
        files = unzipSync(archive, {
            filter: (file) => {
                if (limitError) return false;
                count += 1;
                if (count > LIMITS.maxEntries) limitError = 'install-too-many-files';
                else if (file.originalSize > LIMITS.maxFileBytes) limitError = 'install-too-large';
                else if ((declared += file.originalSize) > LIMITS.maxTotalBytes) limitError = 'install-too-large';
                return !limitError;
            },
        });
    } catch {
        return { ok: false, error: limitError ?? 'install-corrupt-zip' };
    }
    if (limitError) return { ok: false, error: limitError };
    const entries: ZipEntry[] = [];
    let total = 0;
    for (const [rawPath, bytes] of Object.entries(files)) {
        if (rawPath.endsWith('/')) continue;
        const segments = rawPath.split('/').filter(segment => segment !== '' && segment !== '.');
        if (segments.some(segment => segment === '..' || segment.includes('\\') || segment.includes(':'))) {
            return { ok: false, error: 'install-unsafe-path' };
        }
        total += bytes.byteLength;
        if (bytes.byteLength > LIMITS.maxFileBytes || total > LIMITS.maxTotalBytes) return { ok: false, error: 'install-too-large' };
        entries.push({ segments, bytes });
    }
    if (entries.length === 0) return { ok: false, error: 'install-empty-zip' };
    return { ok: true, entries };
};

const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
};

const base64ToBytes = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));

/** 从 zip 的字节装一个模组。有 main 入口的拒装（Android 上没有 Node）。 */
export const installAndroidModFromBytes = async (archive: Uint8Array): Promise<{ ok: boolean; id?: string; error?: string }> => {
    if (!isModSystemEnabled()) return { ok: false, error: 'mod-system-disabled' };
    const read = readZip(archive);
    if (!read.ok) return { ok: false, error: read.error };
    const manifests = read.entries.filter(entry => entry.segments[entry.segments.length - 1] === 'mod.json');
    let rootDepth = 0;
    if (!manifests.some(entry => entry.segments.length === 1)) {
        if (new Set(manifests.map(entry => entry.segments[0])).size !== 1) return { ok: false, error: 'install-no-manifest' };
        rootDepth = 1;
    }
    const manifestEntry = manifests.find(entry => entry.segments.length === rootDepth + 1);
    if (!manifestEntry) return { ok: false, error: 'install-no-manifest' };
    let raw: Record<string, unknown>;
    try {
        raw = JSON.parse(new TextDecoder().decode(manifestEntry.bytes)) as Record<string, unknown>;
    } catch {
        return { ok: false, error: 'install-invalid-manifest' };
    }
    if (raw.main) return { ok: false, error: 'android-main-entry' };
    const errors: string[] = [];
    if (raw.folium !== FOLIUM_HOST_VERSION.major) errors.push(`folium must be ${FOLIUM_HOST_VERSION.major}`);
    if (typeof raw.id !== 'string' || !MOD_ID_PATTERN.test(raw.id)) errors.push('invalid id');
    if (typeof raw.name !== 'string' || !raw.name.trim()) errors.push('missing name');
    if (typeof raw.version !== 'string' || !raw.version.trim()) errors.push('missing version');
    if (!isSafeRelativePath(raw.client) || !/\.m?js$/.test(raw.client)) errors.push('needs a client entry');
    if (Array.isArray(raw.depends) && raw.depends.length > 0) errors.push('depends is not supported on Android');
    if (errors.length > 0) return { ok: false, error: `install-invalid-manifest:${errors.join('; ')}` };

    const id = raw.id as string;
    const version = raw.version as string;
    const client = raw.client as string;
    const files: SignedFile[] = read.entries
        .filter(entry => entry.segments.length > rootDepth)
        .map(entry => ({ relative: entry.segments.slice(rootDepth).join('/'), bytes: entry.bytes }));
    if (!files.some(file => file.relative === client)) return { ok: false, error: 'install-client-missing' };

    const signature = await verifyModSignature(files, { id, version });
    let digest: string;
    try {
        digest = await computeSignedDigest(files);
    } catch {
        return { ok: false, error: 'mod-content-unverifiable' };
    }

    // 先写到暂存目录，写完再替换：装到一半失败不会留下半个模组，旧版本也还在。
    const staging = `${MODS_DIR}/.staging-${id}`;
    const target = `${MODS_DIR}/${id}`;
    await Filesystem.rmdir({ directory: Directory.Data, path: staging, recursive: true }).catch(() => undefined);
    try {
        for (const file of files) {
            await Filesystem.writeFile({
                directory: Directory.Data,
                path: `${staging}/${file.relative}`,
                data: bytesToBase64(file.bytes),
                recursive: true,
            });
        }
        await Filesystem.rmdir({ directory: Directory.Data, path: target, recursive: true }).catch(() => undefined);
        await Filesystem.rename({ directory: Directory.Data, from: staging, to: target, toDirectory: Directory.Data });
    } catch (error) {
        console.warn('[AndroidMods] Writing mod files failed', error);
        await Filesystem.rmdir({ directory: Directory.Data, path: staging, recursive: true }).catch(() => undefined);
        return { ok: false, error: `install-failed:${error instanceof Error ? error.message : String(error)}` };
    }

    const permissions = (Array.isArray(raw.permissions) ? raw.permissions : [])
        .filter((value): value is string => typeof value === 'string')
        .map(permission => OLD_PERMISSIONS[permission] ?? permission);
    const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
    const state = readState();
    const previous = state.mods[id];
    const sameFiles = previous?.approvedDigest === digest;
    state.mods[id] = {
        id,
        name: raw.name as string,
        version,
        author: typeof raw.author === 'string' ? raw.author : null,
        description: typeof raw.description === 'string' ? raw.description : null,
        client,
        permissions: Array.from(new Set(permissions)),
        experimental: strings(raw.experimental),
        embedOrigins: strings(raw.embedOrigins),
        folia: typeof raw.folia === 'string' ? raw.folia : null,
        signature,
        digest,
        // 同一份文件重装时保留确认；文件变了（升级）要重新确认。
        approvedDigest: sameFiles ? digest : null,
        enabled: sameFiles ? previous.enabled : false,
        installedAt: Date.now(),
    };
    writeState(state);
    baseUris.delete(id);
    console.info('[AndroidMods] Mod installed', { id, version, signature: signature.status, files: files.length });
    await notify();
    return { ok: true, id };
};

/** 用原生 HTTP 下载（市场的 zip 不带 CORS 头，WebView 的 fetch 读不到），返回字节。 */
export const downloadBytes = async (url: string): Promise<Uint8Array> => {
    const response = await CapacitorHttp.request({ url, method: 'GET', responseType: 'blob', connectTimeout: 15000, readTimeout: 120000 });
    if (response.status < 200 || response.status >= 300) throw new Error(`http-${response.status}`);
    if (typeof response.data !== 'string') throw new Error('download-unexpected-body');
    return base64ToBytes(response.data);
};

export const sha256Hex = async (bytes: Uint8Array) => Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)),
    byte => byte.toString(16).padStart(2, '0'),
).join('');

// folium.storage：每个模组一个 JSON 文件。

const storageCache = new Map<string, Record<string, unknown>>();

const readModData = async (modId: string): Promise<Record<string, unknown>> => {
    const cached = storageCache.get(modId);
    if (cached) return cached;
    let data: Record<string, unknown> = {};
    try {
        const file = await Filesystem.readFile({ directory: Directory.Data, path: `${DATA_DIR}/${modId}.json`, encoding: Encoding.UTF8 });
        const parsed = JSON.parse(typeof file.data === 'string' ? file.data : '{}') as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
    } catch {
        data = {};
    }
    storageCache.set(modId, data);
    return data;
};

const writeModData = async (modId: string, data: Record<string, unknown>) => {
    storageCache.set(modId, data);
    await Filesystem.writeFile({
        directory: Directory.Data,
        path: `${DATA_DIR}/${modId}.json`,
        data: JSON.stringify(data),
        encoding: Encoding.UTF8,
        recursive: true,
    });
};

const installedMod = (modId: string) => readState().mods[modId] ?? null;

export const invokeAndroidModStorage = async (
    modId: string,
    operation: string,
    key?: string,
    value?: unknown,
): Promise<{ ok: boolean; result?: unknown; error?: string }> => {
    const mod = installedMod(modId);
    if (!mod) return { ok: false, error: 'mod-not-found' };
    if (!mod.permissions.includes('filesystem.data')) return { ok: false, error: 'permission-denied:filesystem.data' };
    const data = await readModData(modId);
    switch (operation) {
        case 'get': return { ok: true, result: typeof key === 'string' && Object.hasOwn(data, key) ? data[key] : null };
        case 'has': return { ok: true, result: typeof key === 'string' && Object.hasOwn(data, key) };
        case 'keys': return { ok: true, result: Object.keys(data) };
        case 'set':
            if (typeof key !== 'string') return { ok: false, error: 'storage-invalid-key' };
            await writeModData(modId, { ...data, [key]: value === undefined ? null : JSON.parse(JSON.stringify(value)) });
            return { ok: true };
        case 'delete': {
            if (typeof key !== 'string') return { ok: false, error: 'storage-invalid-key' };
            const next = { ...data };
            delete next[key];
            await writeModData(modId, next);
            return { ok: true };
        }
        default: return { ok: false, error: `storage-unknown-operation:${operation}` };
    }
};

// folium.net.fetch：原生 HTTP，结果形状同桌面版 netFetch.cjs。

export const invokeAndroidModNetFetch = async (
    modId: string,
    url: string,
    init: unknown,
): Promise<{ ok: boolean; result?: unknown; error?: string }> => {
    const mod = installedMod(modId);
    if (!mod) return { ok: false, error: 'mod-not-found' };
    if (!mod.permissions.includes('net.fetch')) return { ok: false, error: 'permission-denied:net.fetch' };
    let target: URL;
    try {
        target = new URL(url);
    } catch {
        return { ok: false, error: 'net-invalid-url' };
    }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return { ok: false, error: 'net-unsupported-protocol' };
    const options = (init && typeof init === 'object' ? init : {}) as { method?: string; headers?: Record<string, unknown>; body?: unknown; timeoutMs?: number };
    const method = String(options.method ?? 'GET').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method)) return { ok: false, error: `net-unsupported-method:${method}` };
    const headers: Record<string, string> = {};
    Object.entries(options.headers ?? {}).forEach(([name, value]) => { if (typeof value === 'string') headers[name] = value; });
    const timeoutMs = Math.min(60000, Math.max(1000, Number(options.timeoutMs) || 15000));
    try {
        const response = await CapacitorHttp.request({
            url: target.toString(),
            method,
            headers,
            data: method === 'GET' || method === 'HEAD' || typeof options.body !== 'string' ? undefined : options.body,
            responseType: 'text',
            connectTimeout: timeoutMs,
            readTimeout: timeoutMs,
        });
        const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '');
        if (body.length > NET_FETCH_MAX_BYTES) return { ok: false, error: 'net-body-too-large' };
        const responseHeaders: Record<string, string> = {};
        Object.entries(response.headers ?? {}).forEach(([name, value]) => { responseHeaders[name.toLowerCase()] = String(value); });
        return { ok: true, result: { status: response.status, statusText: '', headers: responseHeaders, body } };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
};

export const subscribeAndroidModsState = (callback: (mods: ModRuntimeInfo[]) => void) => {
    stateListeners.add(callback);
    return () => { stateListeners.delete(callback); };
};

// 模组总开关拨动时重新推一次列表：关掉时清空（client 跟着卸下），打开时载入。
useDesktopSettingsStore.subscribe((state, previous) => {
    if (state.modSystemEnabled !== previous.modSystemEnabled) void notify();
});
