import { afterEach, describe, expect, it, vi } from 'vitest';
import { omni } from '@/services/onlineMusic/omni';
import { registerOnlineMusicProvider, unregisterOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';
import { useOnlineProviderAccountStore } from '@/stores/useOnlineProviderAccountStore';
import type { UnifiedSong } from '@/types';
import type { OnlineMusicProvider, ProviderCapabilities } from '@/types/onlineMusic';

// test/unit/onlineMusic/omniListeningHistory.test.ts

const providerId = 'omni-history-test';
const song = (mediaId: string): UnifiedSong => ({
    id: mediaId,
    name: `${providerId}:${mediaId}`,
    artists: [],
    album: { id: '', name: '' },
    durationMs: 1,
    sourceRef: { kind: 'online', providerId, mediaId },
});
const capabilities = (listeningHistory: boolean): ProviderCapabilities => ({
    search: true, playback: true, lyrics: false, auth: false, userLibrary: false,
    playlists: false, albums: false, artists: false, recommendations: false,
    mutations: false, wordByWordLyrics: false, listeningHistory,
});
const provider = (withListeningHistory: boolean, getListeningHistory?: NonNullable<OnlineMusicProvider['library']>['getListeningHistory']): OnlineMusicProvider => ({
    id: providerId,
    displayName: providerId,
    capabilities: capabilities(withListeningHistory),
    normalizeSong: raw => song(String((raw as { id?: string }).id || '1')),
    search: { searchSongs: async () => ({ items: [], hasMore: false, nextOffset: 0 }) },
    playback: {
        getSongDetail: async mediaId => song(String(mediaId)),
        getAudioSource: async target => ({ url: `https://${providerId}/${target.sourceRef?.mediaId}`, fetchedAt: 1, quality: 'standard' }),
    },
    ...(getListeningHistory ? { library: {
        getUserPlaylists: async () => ({ items: [], hasMore: false, nextOffset: 0 }),
        getListeningHistory,
    } } : {}),
});

const activeProviderId = (): void => { useOnlineProviderAccountStore.getState().setActiveProviderId(providerId); };

afterEach(() => {
    unregisterOnlineMusicProvider(providerId);
    useOnlineProviderAccountStore.getState().setActiveProviderId('netease');
    omni.invalidateActiveRequests();
});

describe('omni listening history', () => {
    it('offers no history of a provider without the capability, and asks nothing of it', async () => {
        const getListeningHistory = vi.fn();
        registerOnlineMusicProvider(provider(false, getListeningHistory));
        activeProviderId();

        expect(omni.supportsListeningHistory(providerId)).toBe(false);
        await expect(omni.getListeningHistory('tok')).rejects.toMatchObject({ code: 'unsupported' });
        expect(getListeningHistory).not.toHaveBeenCalled();
    });

    it('offers no history of a capability claimed where no library method stands behind it', async () => {
        registerOnlineMusicProvider(provider(true, undefined));
        activeProviderId();

        expect(omni.supportsListeningHistory(providerId)).toBe(false);
        await expect(omni.getListeningHistory()).rejects.toMatchObject({ code: 'unsupported' });
    });

    it('routes the history through the active provider, and its songs keep their owner', async () => {
        const getListeningHistory = vi.fn(async (cursor?: string) => ({
            items: [song('7'), song('8')],
            ...(cursor === 'tok-2' ? { nextCursor: 'tok-3' } : { nextCursor: 'tok-2' }),
        }));
        registerOnlineMusicProvider(provider(true, getListeningHistory));
        activeProviderId();

        expect(omni.supportsListeningHistory(providerId)).toBe(true);
        await expect(omni.getListeningHistory()).resolves.toEqual({
            items: [
                { ...song('7'), sourceRef: { kind: 'online', providerId, mediaId: '7' } },
                { ...song('8'), sourceRef: { kind: 'online', providerId, mediaId: '8' } },
            ],
            nextCursor: 'tok-2',
        });
        await expect(omni.getListeningHistory('tok-2')).resolves.toMatchObject({ nextCursor: 'tok-3' });
        expect(getListeningHistory).toHaveBeenNthCalledWith(1, undefined);
        expect(getListeningHistory).toHaveBeenNthCalledWith(2, 'tok-2');
    });

    it("lets an error of the provider's history read through as it is", async () => {
        const getListeningHistory = vi.fn(async () => { throw new Error('no such page'); });
        registerOnlineMusicProvider(provider(true, getListeningHistory));
        activeProviderId();

        await expect(omni.getListeningHistory()).rejects.toThrow('no such page');
    });
});
