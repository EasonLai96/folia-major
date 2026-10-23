import { registerPlugin } from '@capacitor/core';
import { isCapacitorAndroid } from '../../../../platform/runtime';
import type { QishuiBridgeResult, QishuiOperation, QishuiParams } from '../qishuiTransport';

// src/services/onlineMusic/qishui/android/qishuiAndroid.ts
// The Capacitor bridge to FoliaQishuiPlugin. Every protocol request and its credentials stay in Java.

interface FoliaQishuiPlugin {
    request(options: { operation: QishuiOperation; params: QishuiParams }): Promise<QishuiBridgeResult>;
}

let qishui: FoliaQishuiPlugin | undefined;

const getQishuiPlugin = (): FoliaQishuiPlugin | null => {
    if (!isCapacitorAndroid()) return null;
    qishui ??= registerPlugin<FoliaQishuiPlugin>('FoliaQishui');
    return qishui;
};

export const requestQishuiOnAndroid = async (
    operation: QishuiOperation,
    params: QishuiParams,
): Promise<QishuiBridgeResult> => {
    const plugin = getQishuiPlugin();
    if (!plugin) return { ok: false, error: { code: 'unavailable', message: 'Qishui requires the Android app' } };
    return plugin.request({ operation, params });
};
