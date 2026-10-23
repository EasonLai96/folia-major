import type {
    AudioQualityPreference, OnlinePlaybackProvider, ProviderAudioSource, ProviderSongAvailability,
} from '../../../types/onlineMusic';
import type { QishuiAudioSource, QishuiTrackCheck } from './qishuiTypes';
import { normalizeQishuiSong } from './qishuiNormalize';
import { qishuiSongId } from './qishuiMutations';
import { QishuiRequestError, requestQishui } from './qishuiTransport';

// src/services/onlineMusic/qishui/qishuiPlayback.ts
// One song's detail by id, its plaintext audio address, and short-lived playability checks.

const checks = new Map<string, { at: number; availability: ProviderSongAvailability }>();
let revision = 0;
const AUDIO_LEVELS = new Set<AudioQualityPreference>(['standard', 'high', 'lossless', 'hires']);

export function clearQishuiPlayback() {
    revision++;
    checks.clear();
}

export async function readQishuiSongs(raw: unknown[]) {
    const songs = raw.map(normalizeQishuiSong);
    if (!songs.length) return songs;
    const mine = revision;
    try {
        const data = await requestQishui<{ statuses: QishuiTrackCheck[] }>('check_tracks', {
            ids: songs.map(song => String(song.id)),
        });
        if (mine !== revision) return songs;
        const wanted = new Set(songs.map(song => String(song.id)));
        for (const row of data.statuses) {
            if (!wanted.has(row.id) || !Number.isInteger(row.riskResult) || row.riskResult < 0) continue;
            checks.delete(row.id);
            checks.set(row.id, {
                at: Date.now(),
                availability: row.riskResult === 0
                    ? { state: 'playable' }
                    : { state: 'unknown', reason: 'restricted' },
            });
        }
        while (checks.size > 500) checks.delete(checks.keys().next().value!);
    } catch (error) {
        // A failed optional check must not hide otherwise readable songs or imply a takedown.
        console.warn('[Qishui] Track availability check failed', error);
    }
    return songs;
}

// The native sentence when the service answered a look-up without the track (QishuiCatalog.track).
const TRACK_NOT_RETURNED = 'Qishui did not return the track';

export const qishuiPlayback: OnlinePlaybackProvider = {
    audioQualityLevels: ['standard'],
    async getSongDetail(id) {
        let raw: unknown;
        try {
            raw = await requestQishui('song_detail', { id: String(id) });
        } catch (error) {
            if (error instanceof QishuiRequestError && error.code === 'not-playable'
                && error.message === TRACK_NOT_RETURNED) return null;
            throw error;
        }
        return (await readQishuiSongs([raw]))[0];
    },
    async getAudioSource(song, quality) {
        const audio = await requestQishui<QishuiAudioSource>('audio', { id: qishuiSongId(song), quality });
        const served = AUDIO_LEVELS.has(audio.quality as AudioQualityPreference)
            ? audio.quality as AudioQualityPreference : 'standard';
        return {
            url: audio.url,
            fetchedAt: audio.fetchedAt,
            quality: served,
            ...(audio.expiresAt == null ? {} : { expiresAt: audio.expiresAt }),
            ...(audio.preview ? { preview: true } : {}),
        } satisfies ProviderAudioSource;
    },
    getAvailability(song) {
        const check = checks.get(qishuiSongId(song));
        return check && Date.now() - check.at < 60_000 ? check.availability : { state: 'unknown' };
    },
};
