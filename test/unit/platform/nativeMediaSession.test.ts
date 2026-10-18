import { describe, expect, it, vi } from 'vitest';

vi.mock('@capgo/capacitor-media-session', () => ({ MediaSession: {} }));
vi.mock('@capacitor/core', () => ({ CapacitorHttp: {}, Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }));

import { createFoliaMediaMetadata } from '../../../src/platform/nativeMediaSession';
import { publishMediaSessionTrack } from '../../../src/utils/mediaSessionSync';

// test/unit/platform/nativeMediaSession.test.ts
// Android WebView 没有 MediaMetadata 构造函数时，歌名和封面仍要送到原生媒体会话替身。

describe('createFoliaMediaMetadata', () => {
    it('builds plain metadata when the WebView has no MediaMetadata constructor', () => {
        const original = (globalThis as { MediaMetadata?: unknown }).MediaMetadata;
        delete (globalThis as { MediaMetadata?: unknown }).MediaMetadata;
        try {
            const session = { metadata: null as MediaMetadata | null, setPositionState: vi.fn() };
            const published = publishMediaSessionTrack(
                session as unknown as MediaSession,
                { currentTime: 10, duration: 200, playbackRate: 1 },
                { title: '辞九门回忆', artist: '冰幽', album: '辞', artworkUrl: 'https://example.com/a.jpg' },
                createFoliaMediaMetadata
            );
            expect(published).toBe(true);
            expect(session.metadata).toMatchObject({
                title: '辞九门回忆',
                artist: '冰幽',
                album: '辞',
                artwork: [{ src: 'https://example.com/a.jpg' }],
            });
        } finally {
            if (original !== undefined) (globalThis as { MediaMetadata?: unknown }).MediaMetadata = original;
        }
    });
});
