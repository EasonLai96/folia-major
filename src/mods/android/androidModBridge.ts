import { setModsHostBridge } from '../ipc';
import type { ModsListPayload } from '../types';

// src/mods/android/androidModBridge.ts
// 在 Android App 上把模组桥接到 androidModHost.ts：形状与 preload 暴露的 window.electron.mods 相同，
// 手机上没有的能力（RPC、选文件、模组目录、ffmpeg、导出）返回 no-electron-bridge。
// bootstrap 在渲染前同步调用 installAndroidModBridge；宿主本身用到时才加载。

type ModsBridge = NonNullable<NonNullable<typeof window.electron>['mods']>;
type AndroidModHost = typeof import('./androidModHost');

let hostPromise: Promise<AndroidModHost> | null = null;
const loadHost = () => {
    hostPromise ??= import('./androidModHost');
    return hostPromise;
};

const EMPTY_FFMPEG: ModsListPayload['ffmpeg'] = { available: false, path: null, version: null, candidates: [] };

const createAndroidModBridge = (): ModsBridge => {
    const unsupported = async () => ({ ok: false, error: 'no-electron-bridge' });
    const noop = () => () => {};
    return {
        listMods: async () => (await loadHost()).listAndroidMods(),
        setModEnabled: async (modId, enabled) => (await loadHost()).setAndroidModEnabled(modId, enabled),
        reloadMods: async () => (await loadHost()).reloadAndroidMods(),
        cancelExport: async () => ({ ok: true }),
        invokeModRpc: unsupported,
        invokeModStorage: async (modId, operation, key, value) => (await loadHost()).invokeAndroidModStorage(modId, operation, key, value),
        invokeModNetFetch: async (modId, url, init) => (await loadHost()).invokeAndroidModNetFetch(modId, url, init),
        invokeModPickFile: unsupported,
        invokeModRestoreFile: unsupported,
        invokeModReleaseFile: unsupported,
        pushRuntimeSnapshot: async () => ({ ok: true }),
        getFfmpegStatus: async () => ({ ffmpeg: EMPTY_FFMPEG }),
        openModsDirectory: unsupported,
        installModFromZip: unsupported,
        getModStorageUsage: unsupported,
        clearModCache: unsupported,
        getModCallStats: async () => ({ stats: {} }),
        reportModsStartSettled: async () => ({ ok: true }),
        reportModsStartAlive: async () => ({ ok: true }),
        onModsStateChanged: (callback) => {
            let active = true;
            let unsubscribe: (() => void) | null = null;
            void loadHost().then((host) => {
                if (active) unsubscribe = host.subscribeAndroidModsState(callback);
            });
            return () => {
                active = false;
                unsubscribe?.();
            };
        },
        onExportProgress: noop,
        onModLog: noop,
    } as ModsBridge;
};

/** 在 Android App 上注册模组桥（只调一次，渲染之前）。 */
export const installAndroidModBridge = (): void => {
    setModsHostBridge(createAndroidModBridge());
    console.info('[AndroidMods] Mod bridge installed');
};
