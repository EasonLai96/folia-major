import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appDatabase } from '../../../src/services/appDatabase';
import { clearAllCaches, getFromCache, saveToCache } from '../../../src/services/db';

// test/unit/services/clearAllCaches.test.ts
// 存储页的「全部清空」只清能重建的缓存，本地曲库和手工整理过的歌手 / 专辑不能跟着消失。

describe('clearAllCaches', () => {
    beforeEach(async () => {
        await appDatabase.delete();
        await appDatabase.open();
    });

    afterEach(async () => {
        await appDatabase.delete();
    });

    it('clears every listed cache but keeps the local library and its manual organization', async () => {
        await saveToCache('lyric_1', { lrc: '' });
        await saveToCache('playlist_tracks_1', [1]);
        await saveToCache('audio_1', new Blob(['audio']));
        await saveToCache('cover_1', new Blob(['cover']));
        await saveToCache('automix_profile_1', { bpm: 120 });
        await saveToCache('theme_1', { name: 'theme' });
        await saveToCache('local_dir_handles', { Music: 'handle' });
        await appDatabase.local_music.put({ id: 'song-1', title: 'Song' } as never);
        await appDatabase.local_library_entities.put({ id: 'artist-1', kind: 'artist', normalizedAliases: ['a'], mergedInto: null, needsReview: 0, createdAt: 1 } as never);
        await appDatabase.local_library_assignments.put({ songId: 'song-1', artistEntityIds: ['artist-1'], albumEntityId: null, artistOrigin: 'manual', albumOrigin: 'manual' } as never);

        await clearAllCaches();

        for (const key of ['lyric_1', 'playlist_tracks_1', 'audio_1', 'cover_1', 'automix_profile_1']) {
            expect(await getFromCache(key)).toBeNull();
        }
        expect(await getFromCache('theme_1')).toEqual({ name: 'theme' });
        expect(await getFromCache('local_dir_handles')).toEqual({ Music: 'handle' });
        expect(await appDatabase.local_music.get('song-1')).toBeTruthy();
        expect(await appDatabase.local_library_entities.get('artist-1')).toBeTruthy();
        expect(await appDatabase.local_library_assignments.get('song-1')).toMatchObject({ artistOrigin: 'manual' });
    });
});
