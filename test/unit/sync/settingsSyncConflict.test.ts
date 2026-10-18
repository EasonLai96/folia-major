import { beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/sync/settingsSyncConflict.test.ts
// 视觉设置同步不再用云端旧设置悄悄覆盖本地新改动：两边都改过时停下来报告冲突，
// 并且只有推送成功后才记为已同步。

const settings = vi.hoisted(() => ({ value: 'A' }));
const remote = vi.hoisted(() => ({
    record: null as null | { schemaVersion: number; updatedAt: string; data: { value: string } },
    pushFails: false,
    pushes: [] as Array<{ updatedAt: string; data: { value: string } }>,
}));

vi.mock('../../../src/services/sync/syncConfig', () => ({
    getSyncConfig: () => ({ provider: 'r2', enabled: true, workerBaseUrl: 'https://sync.test', authToken: 't' }),
    isSyncConfigured: () => true,
    setSyncStatus: vi.fn(),
}));
vi.mock('../../../src/services/sync/syncClient', () => ({ getRemoteState: vi.fn(), testSyncConnection: vi.fn() }));
vi.mock('../../../src/services/sync/settingsSnapshot', () => ({
    readSyncableSettingsState: () => ({ value: settings.value }),
    getSyncedSettingsSignature: (state: { value: string }) => JSON.stringify(state),
    buildSyncedSettingsRecord: (state: { value: string }, updatedAt: string) => ({ schemaVersion: 1, updatedAt, data: { value: state.value } }),
    applySyncedVisualSettings: (_state: unknown, data: { value: string }) => { settings.value = data.value; },
}));
vi.mock('../../../src/services/sync/syncRepository', () => ({
    fetchRemoteSyncState: async () => ({ schemaVersion: 1, settingsUpdatedAt: remote.record?.updatedAt ?? null, themesUpdatedAt: null, themeCount: 0 }),
    fetchRemoteSettingsIfNewer: async (localUpdatedAt: string | null) => {
        if (!remote.record) return null;
        return !localUpdatedAt || Date.parse(remote.record.updatedAt) > Date.parse(localUpdatedAt) ? remote.record : null;
    },
    pushRemoteSettings: async (record: { schemaVersion: number; updatedAt: string; data: { value: string } }) => {
        if (remote.pushFails) throw new Error('offline');
        remote.pushes.push(record);
        remote.record = record;
        return true;
    },
    listAllRemoteThemeRecords: vi.fn(),
    mergeLocalThemesIntoRecords: vi.fn(),
    pushMissingLocalThemesToRemote: vi.fn(),
    pushSyncLibraryBundleToRemote: vi.fn(),
    saveSyncLibraryBundleToLocalCache: vi.fn(),
}));

const storage = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value); },
        removeItem: (key: string) => { storage.delete(key); },
    },
    dispatchEvent: () => true,
};

const { syncNow } = await import('../../../src/services/sync/syncCoordinator');
const SETTINGS_SYNC = { syncThemes: false, applyRemoteSettings: true, pushSettings: true } as const;

/** 另一台设备在本机上次同步之后上传的设置。 */
const remoteUploadedLater = (value: string) => {
    remote.record = { schemaVersion: 1, updatedAt: new Date(Date.now() + 60_000).toISOString(), data: { value } };
};

beforeEach(async () => {
    storage.clear();
    remote.record = null;
    remote.pushFails = false;
    remote.pushes = [];
    settings.value = 'A';
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // 第一次同步：云端还空着，推送本地，两边对齐。
    await syncNow(SETTINGS_SYNC);
    remote.pushes = [];
});

describe('visual settings sync', () => {
    it('reports a conflict instead of overwriting newer local changes', async () => {
        remoteUploadedLater('B');
        settings.value = 'A-newer';

        const result = await syncNow(SETTINGS_SYNC);

        expect(result?.settingsConflict).toBe(true);
        expect(result?.appliedRemoteSettings).toBe(false);
        expect(settings.value).toBe('A-newer');
        expect(remote.pushes).toEqual([]);
    });

    it('keeps the local side when asked and uploads it', async () => {
        remoteUploadedLater('B');
        settings.value = 'A-newer';

        const result = await syncNow({ ...SETTINGS_SYNC, settingsConflictResolution: 'local' });

        expect(result?.pushedLocalSettings).toBe(true);
        expect(settings.value).toBe('A-newer');
        expect(remote.record?.data.value).toBe('A-newer');
    });

    it('takes the server side when asked and does not push it back', async () => {
        remoteUploadedLater('B');
        settings.value = 'A-newer';

        const result = await syncNow({ ...SETTINGS_SYNC, settingsConflictResolution: 'remote' });

        expect(result?.appliedRemoteSettings).toBe(true);
        expect(settings.value).toBe('B');
        expect(remote.pushes).toEqual([]);
    });

    it('applies remote changes when nothing changed locally', async () => {
        remoteUploadedLater('B');

        const result = await syncNow(SETTINGS_SYNC);

        expect(result).toMatchObject({ appliedRemoteSettings: true, pushedLocalSettings: false, settingsConflict: false });
        expect(settings.value).toBe('B');
        // 之后再同步一次，两边都没动，什么都不做。
        expect(await syncNow(SETTINGS_SYNC)).toMatchObject({ appliedRemoteSettings: false, pushedLocalSettings: false });
    });

    it('pushes local changes when the server has nothing newer', async () => {
        settings.value = 'A-newer';

        const result = await syncNow(SETTINGS_SYNC);

        expect(result?.pushedLocalSettings).toBe(true);
        expect(remote.record?.data.value).toBe('A-newer');
    });

    it('does not mark settings as synced when the upload fails', async () => {
        settings.value = 'A-newer';
        remote.pushFails = true;
        expect(await syncNow(SETTINGS_SYNC)).toBeNull();

        // 另一台设备随后上传：本地那次没传上去的改动仍算未同步，所以是冲突而不是被覆盖。
        remote.pushFails = false;
        remoteUploadedLater('B');
        const result = await syncNow(SETTINGS_SYNC);
        expect(result?.settingsConflict).toBe(true);
        expect(settings.value).toBe('A-newer');
    });
});
