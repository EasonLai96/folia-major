import type { OnlineRecommendationProvider, ProviderCollection } from '../../../types/onlineMusic';
import { getPersonalFmRequestOptions } from '../../../stores/usePersonalFmModeStore';
import type { QishuiFeedMode } from './qishuiTypes';
import { requestQishui } from './qishuiTransport';
import { createQishuiSceneCover } from './qishuiSceneCover';
import { normalizeQishuiSong, qishuiImage } from './qishuiNormalize';

// src/services/onlineMusic/qishui/qishuiRecommendations.ts
// The live car scene list supplies both radio cards and the personal-FM scene picker.

type Scene = { id: string; name: string; group: string; coverUrl?: unknown };

let scenesTask: Promise<Scene[]> | null = null;
let scenesAt = 0;
let scenes: Scene[] = [];
// Counts clears so a catalogue read under the previous account cannot refill the list.
let generation = 0;

export function clearQishuiRecommendations() {
    generation++;
    scenesTask = null;
    scenes = [];
    scenesAt = 0;
}

async function loadScenes(): Promise<Scene[]> {
    if (scenesTask && Date.now() - scenesAt <= 10 * 60_000) return scenesTask;
    const mine = generation;
    const task: Promise<Scene[]> = requestQishui<QishuiFeedMode[]>('feed_modes').then(rows => {
        const seen = new Set<string>();
        const read: Scene[] = [];
        for (const row of rows) {
            if (!/^\d+$/.test(row.id) || !row.name || seen.has(row.id)) continue;
            seen.add(row.id);
            read.push({ id: row.id, name: row.name, group: row.group, coverUrl: row.coverUrl });
        }
        if (mine === generation) {
            scenes = read;
            scenesAt = Date.now();
        }
        return read;
    }).catch(error => {
        if (scenesTask === task) scenesTask = null;
        throw error;
    });
    scenesTask = task;
    return task;
}

export const qishuiRecommendations: OnlineRecommendationProvider = {
    async dislikeSong(id) {
        await requestQishui('dislike_song', { id: String(id), disliked: true });
        console.info('[Qishui] Recommendation disliked');
        return {};
    },
    async getPersonalFm(options) {
        const selected = options || getPersonalFmRequestOptions();
        const data = await requestQishui<{ items: unknown[] }>('feed', {
            queue: 'fm',
            limit: 20,
            ...(selected.mode === 'SCENE_RCMD' ? { scene: selected.submode } : {}),
            ...(selected.mode === 'FAMILIAR'
                ? { preference: 'familiar' }
                : selected.mode === 'EXPLORE' ? { preference: 'fresh' } : {}),
        });
        return data.items.map(normalizeQishuiSong);
    },
    async getRecommendedCollections(limit): Promise<ProviderCollection[]> {
        const read = await loadScenes();
        const rows = limit > 0 ? read.slice(0, limit) : [];
        return Promise.all(rows.map(async scene => ({
            providerId: 'qishui',
            id: `scene-${scene.id}`,
            type: 'radio',
            name: scene.name,
            description: scene.group,
            coverUrl: await createQishuiSceneCover(scene.id, qishuiImage(scene.coverUrl)),
            providerData: { scene: scene.id, mode: 'SCENE_RCMD' },
        })));
    },
};
