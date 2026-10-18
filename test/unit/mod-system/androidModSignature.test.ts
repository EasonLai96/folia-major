import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { computeSignedDigest, verifyModSignature, type SignedFile } from '../../../src/mods/android/androidModSignature';
import androidKeys from '../../../src/mods/android/trustedKeys.json';

// test/unit/mod-system/androidModSignature.test.ts
// The Android app's signature check (src/mods/android/androidModSignature.ts) must agree with the
// desktop one (electron/modSystem/modSignature.cjs) byte for byte: same digest, same status on the
// signed fixtures, and the same trusted keys.

const require = createRequire(import.meta.url);
const { computeSignedDigest: desktopDigest, verifyModSignature: desktopVerify } = require('../../../electron/modSystem/modSignature.cjs');
const { TRUSTED_SIGNING_KEYS, REVOKED_MOD_DIGESTS } = require('../../../electron/modSystem/trustedKeys.cjs');

const FIXTURES = path.resolve(__dirname, '../../fixtures/folium-signature');

const readTree = (dir: string, prefix = ''): SignedFile[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? readTree(absolute, relative) : [{ relative, bytes: new Uint8Array(fs.readFileSync(absolute)) }];
});

describe('Android mod signatures', () => {
    it('ships the same trusted keys and revocations as the desktop host', () => {
        expect(androidKeys.keys).toEqual(JSON.parse(JSON.stringify(TRUSTED_SIGNING_KEYS)));
        expect(androidKeys.revokedModDigests).toEqual([...REVOKED_MOD_DIGESTS]);
    });

    for (const name of ['official-fixture', 'beta-fixture']) {
        it(`agrees with the desktop verifier on ${name}`, async () => {
            const dir = path.join(FIXTURES, name);
            const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'mod.json'), 'utf8'));
            const files = readTree(dir);
            expect(await computeSignedDigest(files)).toBe(desktopDigest(dir));
            const desktop = desktopVerify(dir, manifest);
            const android = await verifyModSignature(files, manifest);
            expect(android.status).toBe(desktop.status);
            expect(android.status).toBe(name === 'official-fixture' ? 'verified' : 'beta');
            expect(android.keyId).toBe(desktop.keyId);
        });
    }

    it('reports a changed file as digest-mismatch and a renamed mod as mod-mismatch', async () => {
        const dir = path.join(FIXTURES, 'official-fixture');
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'mod.json'), 'utf8'));
        const files = readTree(dir);
        const tampered = files.map(file => (file.relative === 'client.mjs'
            ? { ...file, bytes: new Uint8Array([...file.bytes, 0x20]) }
            : file));
        expect((await verifyModSignature(tampered, manifest)).reason).toBe('digest-mismatch');
        expect((await verifyModSignature(files, { ...manifest, version: '9.9.9' })).reason).toBe('mod-mismatch');
        expect((await verifyModSignature(files.filter(file => file.relative !== 'folium.sig.json'), manifest)).status).toBe('unsigned');
    });
});
