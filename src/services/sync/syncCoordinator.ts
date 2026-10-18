import { getSyncConfig, isSyncConfigured, setSyncStatus } from './syncConfig';
import { getRemoteState, testSyncConnection } from './syncClient';
import type { SyncProviderConfig } from './syncTypes';
import { applySyncedVisualSettings, buildSyncedSettingsRecord, getSyncedSettingsSignature, readSyncableSettingsState } from './settingsSnapshot';
import {
    fetchRemoteSyncState,
    fetchRemoteSettingsIfNewer,
    listAllRemoteThemeRecords,
    mergeLocalThemesIntoRecords,
    pushMissingLocalThemesToRemote,
    pushRemoteSettings,
    pushSyncLibraryBundleToRemote,
    saveSyncLibraryBundleToLocalCache,
} from './syncRepository';
import { parseSyncLibraryExportBundle } from './syncSchema';
import type { SyncedSettingsRecord, SyncLibraryExportBundle, SyncRemoteState } from './syncTypes';
import { SYNC_SCHEMA_VERSION } from './syncTypes';

// src/services/sync/syncCoordinator.ts
// Coordinates startup theme sync and user-triggered manual sync commands.

const LOCAL_SETTINGS_UPDATED_AT_KEY = 'folia_sync_local_settings_updated_at_v1';
/**
 * 上一次与云端对齐时（拉取应用、推送成功、导入）本地视觉设置的签名。当前签名与它不同，
 * 就说明本地在那之后改过设置。只靠上面的时间戳分辨不出这一点：平常改设置不会更新它。
 */
const LOCAL_SETTINGS_SYNCED_SIGNATURE_KEY = 'folia_sync_local_settings_signature_v1';
let applyingRemoteSettings = false;
let isSyncingInProgress = false;

const isBrowser = () => typeof window !== 'undefined';

const getLocalSettingsUpdatedAt = () => (
    isBrowser() ? window.localStorage.getItem(LOCAL_SETTINGS_UPDATED_AT_KEY) : null
);

const setLocalSettingsUpdatedAt = (updatedAt: string) => {
    if (isBrowser()) {
        window.localStorage.setItem(LOCAL_SETTINGS_UPDATED_AT_KEY, updatedAt);
    }
};

const getSyncedSettingsBaseline = () => (
    isBrowser() ? window.localStorage.getItem(LOCAL_SETTINGS_SYNCED_SIGNATURE_KEY) : null
);

/**
 * 记下「本地与云端此刻一致」：时间戳是这份设置在云端的版本，签名是与云端一致的那份本地设置。
 * 推送时传入推送那一刻的签名，推送途中又改的设置仍算未同步。
 */
const markSettingsInSync = (updatedAt: string, signature = getSyncedSettingsSignature(readSyncableSettingsState())) => {
    setLocalSettingsUpdatedAt(updatedAt);
    if (isBrowser()) {
        window.localStorage.setItem(LOCAL_SETTINGS_SYNCED_SIGNATURE_KEY, signature);
    }
};

/**
 * 本地视觉设置在上一次同步后是否改过。没有基准（从没同步过，或来自没有签名的旧版本）时
 * 无法确定，按「改过」处理：宁可问一次，也不悄悄用云端覆盖本地。
 */
const hasLocalSettingsChangedSinceSync = () => {
    const baseline = getSyncedSettingsBaseline();
    return baseline === null || baseline !== getSyncedSettingsSignature(readSyncableSettingsState());
};

/** 推送本地设置；只有服务端确认写入之后才记为已同步，失败时本地仍算「有未上传的修改」。 */
const pushCurrentSettings = async () => {
    if (!isSyncConfigured()) {
        return false;
    }

    const updatedAt = new Date().toISOString();
    const state = readSyncableSettingsState();
    const record = buildSyncedSettingsRecord(state, updatedAt);
    const signature = getSyncedSettingsSignature(state);
    const pushed = await pushRemoteSettings(record);
    if (pushed) {
        markSettingsInSync(updatedAt, signature);
    }
    return pushed;
};

export const initializeSyncCoordinator = () => {
    void syncNow({ syncThemes: true, applyRemoteSettings: false, pushSettings: false });

    return () => {};
};

export const testSyncProviderConnection = async (config: SyncProviderConfig) => {
    const response = await testSyncConnection(config);
    if (!response.ok) {
        return false;
    }

    return Boolean(await getRemoteState(config));
};

const applyRemoteSettingsRecord = (remoteSettings: SyncedSettingsRecord) => {
    applyingRemoteSettings = true;
    try {
        applySyncedVisualSettings(readSyncableSettingsState(), remoteSettings.data);
        markSettingsInSync(remoteSettings.updatedAt);
    } finally {
        applyingRemoteSettings = false;
    }
};

/** 两边都改过时怎么办：不给就停下来报告冲突，'local' 用本地覆盖云端，'remote' 用云端覆盖本地。 */
export type SettingsConflictResolution = 'local' | 'remote';

type SettingsSyncOutcome = {
    appliedRemoteSettings: boolean;
    pushedLocalSettings: boolean;
    settingsConflict: boolean;
};

/**
 * 视觉设置的双向同步。
 * - 只有云端更新：应用云端，不再回推。
 * - 只有本地改过：推送本地。
 * - 两边都改过：没有指定 resolution 就什么都不动，报告冲突，由用户选择保留哪一边。
 */
const syncVisualSettings = async (
    remoteState: SyncRemoteState | null,
    options: { applyRemote: boolean; push: boolean; resolution?: SettingsConflictResolution },
): Promise<SettingsSyncOutcome> => {
    const outcome: SettingsSyncOutcome = { appliedRemoteSettings: false, pushedLocalSettings: false, settingsConflict: false };
    const remoteSettings = options.applyRemote
        ? await fetchRemoteSettingsIfNewer(getLocalSettingsUpdatedAt(), remoteState)
        : null;
    const localChanged = hasLocalSettingsChangedSinceSync();

    if (remoteSettings && localChanged) {
        if (!options.resolution) {
            console.info('[sync] Visual settings changed on both sides, waiting for a choice', {
                localSyncedAt: getLocalSettingsUpdatedAt(),
                remoteUpdatedAt: remoteSettings.updatedAt,
            });
            outcome.settingsConflict = true;
            return outcome;
        }
        console.info('[sync] Visual settings conflict resolved', { resolution: options.resolution });
        if (options.resolution === 'remote') {
            applyRemoteSettingsRecord(remoteSettings);
            outcome.appliedRemoteSettings = true;
            return outcome;
        }
        if (options.push) outcome.pushedLocalSettings = await pushCurrentSettings();
        return outcome;
    }

    if (remoteSettings) {
        applyRemoteSettingsRecord(remoteSettings);
        outcome.appliedRemoteSettings = true;
        return outcome;
    }

    // 云端没有更新的版本：本地改过，或者云端还没有任何设置，就推上去。
    if (options.push && (localChanged || !remoteState?.settingsUpdatedAt)) {
        outcome.pushedLocalSettings = await pushCurrentSettings();
    }
    return outcome;
};

export type SyncNowResult = {
    uploadedThemeCount: number;
    downloadedThemeCount: number;
    checkedLocalThemeCount: number;
    diffBucketCount: number;
    skippedRemoteThemeScan: boolean;
    appliedRemoteSettings: boolean;
    pushedLocalSettings: boolean;
    /** 本地和云端的视觉设置都在上次同步后改过，这一轮没有动任何一边，要由用户选择。 */
    settingsConflict: boolean;
};

export const syncNow = async (options: {
    syncThemes?: boolean;
    applyRemoteSettings?: boolean;
    pushSettings?: boolean;
    settingsConflictResolution?: SettingsConflictResolution;
} = {}): Promise<SyncNowResult | null> => {
    if (isSyncingInProgress) {
        return null;
    }

    const config = getSyncConfig();
    if (!isSyncConfigured(config)) {
        return null;
    }

    isSyncingInProgress = true;
    setSyncStatus({ state: 'syncing', lastError: null });
    try {
        const remoteState = await fetchRemoteSyncState();
        let themeSyncResult = {
            uploadedCount: 0,
            downloadedCount: 0,
            checkedLocalThemeCount: 0,
            diffBucketCount: 0,
            skippedRemoteThemeScan: true,
        };
        if (options.syncThemes ?? true) {
            themeSyncResult = await pushMissingLocalThemesToRemote(remoteState);
        }
        
        const settingsOutcome = (options.applyRemoteSettings || options.pushSettings)
            ? await syncVisualSettings(remoteState, {
                applyRemote: Boolean(options.applyRemoteSettings),
                push: Boolean(options.pushSettings),
                resolution: options.settingsConflictResolution,
            })
            : { appliedRemoteSettings: false, pushedLocalSettings: false, settingsConflict: false };
        setSyncStatus({ state: 'success', lastSyncAt: new Date().toISOString(), lastError: null });
        const summary = {
            uploadedThemeCount: themeSyncResult.uploadedCount,
            downloadedThemeCount: themeSyncResult.downloadedCount,
            checkedLocalThemeCount: themeSyncResult.checkedLocalThemeCount,
            diffBucketCount: themeSyncResult.diffBucketCount,
            skippedRemoteThemeScan: themeSyncResult.skippedRemoteThemeScan,
            ...settingsOutcome,
        };
        console.info('[sync] Sync completed', summary);
        if (summary.downloadedThemeCount > 0 && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('folia-themes-synced'));
        }
        return summary;
    } catch (error) {
        console.error('[sync] Sync failed:', error);
        setSyncStatus({ state: 'error', lastError: error instanceof Error ? error.message : String(error) });
        return null;
    } finally {
        isSyncingInProgress = false;
    }
};

export const exportSyncLibraryBundle = async (): Promise<SyncLibraryExportBundle> => {
    setSyncStatus({ state: 'syncing', lastError: null });
    try {
        const settings = buildSyncedSettingsRecord(readSyncableSettingsState(), new Date().toISOString());
        const themes = await mergeLocalThemesIntoRecords(await listAllRemoteThemeRecords());
        const bundle: SyncLibraryExportBundle = {
            kind: 'folia-sync-export',
            schemaVersion: SYNC_SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            settings,
            themes,
        };
        setSyncStatus({ state: 'success', lastSyncAt: bundle.exportedAt, lastError: null });
        console.info('[sync] Export completed', {
            themeCount: bundle.themes.length,
        });
        return bundle;
    } catch (error) {
        setSyncStatus({ state: 'error', lastError: error instanceof Error ? error.message : String(error) });
        throw error;
    }
};

export const isSyncLibraryExportBundle = (value: unknown): value is SyncLibraryExportBundle => (
    parseSyncLibraryExportBundle(value) !== null
);

export const importSyncLibraryBundle = async (
    bundle: unknown,
    options: { pushRemote?: boolean } = {},
) => {
    const validatedBundle = parseSyncLibraryExportBundle(bundle);
    if (!validatedBundle) {
        throw new Error('Invalid Folia sync export');
    }

    setSyncStatus({ state: 'syncing', lastError: null });
    try {
        await saveSyncLibraryBundleToLocalCache(validatedBundle);
        if (validatedBundle.settings) {
            applyingRemoteSettings = true;
            try {
                applySyncedVisualSettings(readSyncableSettingsState(), validatedBundle.settings.data);
                markSettingsInSync(validatedBundle.settings.updatedAt);
            } finally {
                applyingRemoteSettings = false;
            }
        }
        if (options.pushRemote ?? true) {
            await pushSyncLibraryBundleToRemote(validatedBundle);
        }
        setSyncStatus({ state: 'success', lastSyncAt: new Date().toISOString(), lastError: null });
        console.info('[sync] Import completed', {
            pushedRemote: options.pushRemote ?? true,
            themeCount: validatedBundle.themes.length,
            appliedSettings: Boolean(validatedBundle.settings),
        });
        return true;
    } catch (error) {
        setSyncStatus({ state: 'error', lastError: error instanceof Error ? error.message : String(error) });
        throw error;
    }
};
