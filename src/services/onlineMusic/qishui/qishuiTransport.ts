import type { ProviderErrorCode } from '../../../types/onlineMusic';
import { OnlineProviderError } from '../../../types/onlineMusic';
import { isCapacitorAndroid } from '../../../platform/runtime';

// src/services/onlineMusic/qishui/qishuiTransport.ts
// Typed renderer boundary for the native car-protocol bridge. Sessions, tickets and guard keys stay in Java.

export type QishuiOperation =
    | 'login_status' | 'logout'
    | 'login_qr_key' | 'login_qr_create' | 'login_qr_check' | 'login_qr_cancel'
    | 'search' | 'search_playlists' | 'song_detail' | 'audio' | 'lyrics'
    | 'user_playlists' | 'playlist_detail' | 'playlist_tracks' | 'artist_detail' | 'artist_songs'
    | 'feed' | 'feed_modes' | 'liked_songs' | 'like_song'
    | 'playlist_add_tracks' | 'playlist_remove_tracks' | 'recent_played' | 'check_tracks' | 'dislike_song';

export type QishuiParams = Record<string, unknown>;
export type QishuiBridgeResult =
    | { ok: true; data: unknown }
    | { ok: false; error: { code: string; message: string; upstreamCode?: string; stage?: string } };

export const QISHUI_NEEDS_ANDROID = 'Qishui requires the Android app';
export const QISHUI_BRIDGE_FAILED = 'Qishui native request failed';

const STAGES = ['access-code', 'ticket', 'account'] as const;
export type QishuiLoginStage = typeof STAGES[number];

const ERROR_CODES = new Set<ProviderErrorCode>([
    'auth-required', 'unsupported', 'not-public', 'unavailable', 'not-playable', 'preview-only',
    'subscription-required', 'region-restricted', 'network', 'invalid-response',
]);

let lastFailure: { stage: QishuiLoginStage | null; code: ProviderErrorCode; upstreamCode?: string } | null = null;
export const getQishuiLastFailure = () => lastFailure;

const isLoginOperation = (operation: QishuiOperation) => operation.startsWith('login_');
const isProviderErrorCode = (value: string): value is ProviderErrorCode => ERROR_CODES.has(value as ProviderErrorCode);

export class QishuiRequestError extends OnlineProviderError {
    constructor(
        code: ProviderErrorCode,
        message: string,
        public readonly stage: QishuiLoginStage | null,
        public readonly upstreamCode?: string,
    ) {
        super(code, message, 'qishui');
    }
}

export const getQishuiAvailability = () => (
    isCapacitorAndroid()
        ? { configured: true } as const
        : { configured: false, reason: 'runtime-unavailable' } as const
);

export async function requestQishui<T = unknown>(operation: QishuiOperation, params: QishuiParams = {}): Promise<T> {
    if (operation === 'login_qr_key') lastFailure = null;
    if (!getQishuiAvailability().configured) {
        throw new OnlineProviderError('unavailable', QISHUI_NEEDS_ANDROID, 'qishui');
    }
    let result: QishuiBridgeResult;
    try {
        const { requestQishuiOnAndroid } = await import('./android/qishuiAndroid');
        result = await requestQishuiOnAndroid(operation, params);
    } catch (error) {
        throw new OnlineProviderError('network', QISHUI_BRIDGE_FAILED, 'qishui', error);
    }
    if (!result.ok) {
        const code = isProviderErrorCode(result.error.code) ? result.error.code : 'invalid-response';
        const stage = STAGES.find(value => value === result.error.stage) ?? null;
        const upstreamCode = typeof result.error.upstreamCode === 'string'
            && /^\d{1,12}$/.test(result.error.upstreamCode) ? result.error.upstreamCode : undefined;
        if (isLoginOperation(operation)) lastFailure = { stage, code, upstreamCode };
        throw new QishuiRequestError(code, result.error.message, stage, upstreamCode);
    }
    return result.data as T;
}
