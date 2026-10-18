import { Capacitor } from '@capacitor/core';

// src/platform/runtime.ts
// 统一回答“现在跑在哪种宿主里”：桌面版（Electron）、Android App（Capacitor）还是普通浏览器。

export type RuntimeEnvironment = 'web' | 'electron' | 'capacitor-android';

export const hasElectronBridge = (): boolean => (
    typeof window !== 'undefined'
    && Boolean((window as typeof window & { electron?: unknown }).electron)
);

export const isCapacitorAndroid = (): boolean => (
    typeof window !== 'undefined'
    && Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === 'android'
);

export const getRuntimeEnvironment = (): RuntimeEnvironment => {
    if (hasElectronBridge()) return 'electron';
    if (isCapacitorAndroid()) return 'capacitor-android';
    return 'web';
};
