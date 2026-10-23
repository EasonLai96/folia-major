import type { ProviderCollection, ProviderPage, ProviderUser } from '../../../types/onlineMusic';

// src/services/onlineMusic/qishui/qishuiTypes.ts
// Shapes the native bridge answers with. They are protocol data, not the app's provider models.

export interface QishuiTrackCheck {
    id: string;
    riskResult: number;
    status: number;
}

export interface QishuiLyricsPayload {
    lyric_entity?: { content?: unknown; type?: unknown };
    lang_translations?: Record<string, { content?: unknown; type?: unknown }>;
}

export interface QishuiAudioSource {
    url: string;
    quality: string;
    fetchedAt: number;
    expiresAt?: number;
    preview?: boolean;
    clipStartMs?: number;
}

export interface QishuiFeedMode {
    id: string;
    name: string;
    group: string;
    coverUrl?: unknown;
}

export type QishuiWirePage<T> = ProviderPage<T>;
export type QishuiWireUser = ProviderUser;
export type QishuiWireCollection = ProviderCollection;
