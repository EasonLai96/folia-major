import type {
    ModClearCacheResult,
    ModFfmpegStatus,
    ModLogEntry,
    ModMainCallStats,
    ModRuntimeInfo,
    ModRuntimeSnapshot,
    ModSetEnabledResult,
    ModStorageUsageResult,
    ModsListPayload,
    ModExportProgress,
} from './types';

// src/mods/ipc.ts
// Typed access to the preload bridge under window.electron.mods. Every call
// degrades to a safe fallback on the web build so the panel stays renderable
// even when no Electron bridge exists (the UI then shows a desktop-only hint).

const electronBridge = (): NonNullable<typeof window.electron>['mods'] => window.electron?.mods;

type ModsBridge = NonNullable<typeof window.electron>['mods'];

// Android App 没有主进程：同一组调用由 src/mods/android/androidModBridge.ts 在页面里做（只跑 client 入口），
// 由它在启动时注册进来。这里不 import 它，免得桌面版、浏览器和模组的 services 闭包带上 Capacitor 与设置 store。
let hostBridge: ModsBridge | undefined;

/** 注册非 Electron 的模组宿主（Android App）；桌面版的 preload 桥始终优先。 */
export const setModsHostBridge = (next: ModsBridge | undefined): void => {
    hostBridge = next;
    hostBridgeListeners.forEach(listener => listener());
};

// 读「桥在不在」的 store 可能比注册更早建立（import 顺序），注册时通知它们重读。
const hostBridgeListeners = new Set<() => void>();

/** 订阅宿主桥的注册；返回取消订阅。 */
export const onModsHostBridgeChange = (listener: () => void): (() => void) => {
    hostBridgeListeners.add(listener);
    return () => hostBridgeListeners.delete(listener);
};

const bridge = (): ModsBridge => electronBridge() ?? hostBridge;

export const isModsBridgeAvailable = (): boolean => Boolean(bridge());

/** 模组跑在 Android App 里（只有 client 入口、装市场的 zip，没有模组目录和 ffmpeg）。 */
export const isAndroidModHost = (): boolean => !electronBridge() && Boolean(hostBridge);

const EMPTY_PAYLOAD: ModsListPayload = {
    mods: [],
    ffmpeg: { available: false, path: null, version: null, candidates: [] },
    directories: [],
    startSkipped: false,
};

export const listMods = async (): Promise<ModsListPayload> => {
    const api = bridge();
    if (!api) {
        return EMPTY_PAYLOAD;
    }
    try {
        const payload = await api.listMods();
        return {
            mods: Array.isArray(payload?.mods) ? payload.mods : [],
            ffmpeg: payload?.ffmpeg ?? EMPTY_PAYLOAD.ffmpeg,
            directories: Array.isArray(payload?.directories) ? payload.directories : [],
            startSkipped: payload?.startSkipped === true,
        };
    } catch {
        return EMPTY_PAYLOAD;
    }
};

/** What the main-process gate counted for each mod's Node entry, by mod id; empty without the bridge. */
export const getModCallStats = async (): Promise<Record<string, ModMainCallStats>> => {
    try {
        const response = await bridge()?.getModCallStats?.();
        return response?.stats ?? {};
    } catch {
        return {};
    }
};

/**
 * Tells the main process that this window's start has ended: every client's start has returned
 * and the first screen is up. The start note is taken up on it (electron/modSystem/safeStart.cjs).
 */
export const reportModsStartSettled = async (): Promise<void> => {
    try {
        await bridge()?.reportModsStartSettled?.();
    } catch {
        // The note then stays, and the next start asks once: the safe side.
    }
};

/**
 * Tells the main process that this window's page is answering while its start is under way. If
 * the app is left the normal way before the start has ended, the start note is taken up only when
 * this was heard a moment before: a page stuck on a mod cannot say it.
 */
export const reportModsStartAlive = async (): Promise<void> => {
    try {
        await bridge()?.reportModsStartAlive?.();
    } catch {
        // Nothing to do here: the main process goes by what it heard last.
    }
};

export const setModEnabled = async (modId: string, enabled: boolean): Promise<ModSetEnabledResult> => {
    const api = bridge();
    if (!api) {
        return { ok: false, error: 'no-electron-bridge', mods: [] };
    }
    const response = await api.setModEnabled(modId, enabled);
    return {
        ok: Boolean(response?.ok),
        error: response?.error,
        mods: Array.isArray(response?.mods) ? response.mods : [],
    };
};

export const reloadMods = async (): Promise<ModRuntimeInfo[]> => {
    const api = bridge();
    if (!api) {
        return [];
    }
    const response = await api.reloadMods();
    return Array.isArray(response?.mods) ? response.mods : [];
};

export const cancelExport = async (): Promise<void> => {
    await bridge()?.cancelExport();
};

/** client → main call to a handler the mod registered with `api.rpc.handle`. */
export const invokeModRpc = async (
    modId: string,
    name: string,
    args: unknown[],
): Promise<{ ok: boolean; result?: unknown; error?: string }> =>
    bridge()?.invokeModRpc(modId, name, args) ?? { ok: false, error: 'no-electron-bridge' };

/** folium.storage: the mod's data file in the main process (same one `api.storage.data` uses). */
export const invokeModStorage = async (
    modId: string,
    operation: 'get' | 'set' | 'has' | 'delete' | 'keys',
    key?: string,
    value?: unknown,
): Promise<{ ok: boolean; result?: unknown; error?: string }> =>
    bridge()?.invokeModStorage(modId, operation, key, value) ?? { ok: false, error: 'no-electron-bridge' };

/** folium.net.fetch: runs in the main process (permission `net.fetch`). */
export const invokeModNetFetch = async (
    modId: string,
    url: string,
    init: unknown,
): Promise<{ ok: boolean; result?: unknown; error?: string }> =>
    bridge()?.invokeModNetFetch(modId, url, init) ?? { ok: false, error: 'no-electron-bridge' };

/** folium.ui.pickFile: native open dialog; resolves to a session folia-mod:// URL or null. */
export const invokeModPickFile = async (
    modId: string,
    accept: string,
    persist: boolean,
): Promise<{ ok: boolean; result?: unknown; error?: string }> =>
    bridge()?.invokeModPickFile(modId, accept, persist) ?? { ok: false, error: 'no-electron-bridge' };

/** folium.ui.restoreFile: a persisted file grant back as a session URL, or null. */
export const invokeModRestoreFile = async (
    modId: string,
    grantId: string,
): Promise<{ ok: boolean; result?: unknown; error?: string }> =>
    bridge()?.invokeModRestoreFile(modId, grantId) ?? { ok: false, error: 'no-electron-bridge' };

/** folium.ui.releaseFile: forgets a persisted file grant. */
export const invokeModReleaseFile = async (
    modId: string,
    grantId: string,
): Promise<{ ok: boolean; result?: unknown; error?: string }> =>
    bridge()?.invokeModReleaseFile(modId, grantId) ?? { ok: false, error: 'no-electron-bridge' };

export const pushRuntimeSnapshot = async (snapshot: ModRuntimeSnapshot): Promise<void> => {
    await bridge()?.pushRuntimeSnapshot(snapshot);
};

export const getFfmpegStatus = async (): Promise<ModFfmpegStatus> => {
    const api = bridge();
    if (!api) {
        return EMPTY_PAYLOAD.ffmpeg;
    }
    try {
        const response = await api.getFfmpegStatus();
        return response?.ffmpeg ?? EMPTY_PAYLOAD.ffmpeg;
    } catch {
        return EMPTY_PAYLOAD.ffmpeg;
    }
};

/** Opens the per-user mods directory in the OS file manager. */
export const openModsDirectory = async (): Promise<{ ok: boolean; directory?: string; error?: string }> => {
    const response = await bridge()?.openModsDirectory();
    return response ?? { ok: false, error: 'no-electron-bridge' };
};

/**
 * Installs a mod from a local .zip path. The main process validates the
 * manifest, guards against path traversal, and reloads the loader on success.
 */
export const installModFromZip = async (
    zipPath: string,
): Promise<{ ok: boolean; id?: string; error?: string }> => {
    const response = await bridge()?.installModFromZip(zipPath);
    return response ?? { ok: false, error: 'no-electron-bridge' };
};

/** Bytes a mod keeps on disk (data and cache); disabled mods included, broken entries refused. */
export const getModStorageUsage = async (modId: string): Promise<ModStorageUsageResult> => {
    const response = await bridge()?.getModStorageUsage(modId);
    return response ?? { ok: false, error: 'no-electron-bridge' };
};

/** Empties a mod's cache directory (`api.storage.paths.cache`); the directory itself stays. */
export const clearModCache = async (modId: string): Promise<ModClearCacheResult> => {
    const response = await bridge()?.clearModCache(modId);
    return response ?? { ok: false, error: 'no-electron-bridge' };
};

export const subscribeModsState = (callback: (mods: ModRuntimeInfo[]) => void): (() => void) =>
    bridge()?.onModsStateChanged(callback) ?? (() => {});

export const subscribeExportProgress = (callback: (progress: ModExportProgress) => void): (() => void) =>
    bridge()?.onExportProgress(callback) ?? (() => {});

export const subscribeModLogs = (callback: (entry: ModLogEntry) => void): (() => void) =>
    bridge()?.onModLog(callback) ?? (() => {});

