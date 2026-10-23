import { beforeEach, describe, expect, it, vi } from 'vitest';

// test/unit/platform/nativeMediaSessionActions.test.ts
// Android 原生媒体会话的两条边界：切到没有封面（或封面读不到）的歌时要清掉上一首的封面；
// 系统面板拖动进度（seekto）要接到 App 的跳转流程，否则原生插件不会向系统声明能拖动。

const plugin = vi.hoisted(() => ({
    setMetadata: vi.fn(async (_options: unknown) => {}),
    setActionHandler: vi.fn(async (_options: unknown, _handler: unknown) => {}),
    setPlaybackState: vi.fn(async () => {}),
    setPositionState: vi.fn(async () => {}),
}));
const http = vi.hoisted(() => ({ get: vi.fn() }));
const device = vi.hoisted(() => ({
    setPlaybackState: vi.fn(async (_state: { playing: boolean }) => {}),
    addListener: vi.fn(async (_event: string, _callback: (event: { reason: string }) => void) => ({ remove: vi.fn(async () => {}) })),
}));

vi.mock('@capgo/capacitor-media-session', () => ({ MediaSession: plugin }));
vi.mock('@capacitor/core', () => ({
    CapacitorHttp: http,
    registerPlugin: () => device,
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));
// 没有渲染器，按挂载的样子把每个 effect 跑一次。
const cleanups: Array<() => void> = [];
vi.mock('react', () => ({
    useEffect: (effect: () => void | (() => void)) => {
        const cleanup = effect();
        if (cleanup) cleanups.push(cleanup);
    },
}));

const { getFoliaMediaSession, createFoliaMediaMetadata, CLEARED_ARTWORK_SRC } = await import('../../../src/platform/nativeMediaSession');
const { useMediaSessionBridge } = await import('../../../src/hooks/useMediaSessionBridge');
const { PlayerState } = await import('../../../src/types');
// isCapacitorAndroid 要看到 window 才认为在 App 里；放在导入之后，免得别的模块把它当成浏览器去读 localStorage。
(globalThis as unknown as { window: unknown }).window = {};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const artworkOf = (call: unknown[]) => (call[0] as { artwork: Array<{ src: string }> }).artwork;

beforeEach(() => {
    plugin.setMetadata.mockClear();
    plugin.setActionHandler.mockClear();
    http.get.mockReset();
    device.addListener.mockClear();
    device.setPlaybackState.mockClear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('native media session artwork', () => {
    it('clears the previous cover when the next track has none', async () => {
        const session = getFoliaMediaSession()!;
        session.metadata = createFoliaMediaMetadata({ title: 'A', artist: 'x', album: 'y', artwork: [{ src: 'data:image/png;base64,AAAA' }] });
        session.metadata = createFoliaMediaMetadata({ title: 'B', artist: 'x', album: 'y', artwork: [] });
        await flush();

        const lastCall = plugin.setMetadata.mock.calls.at(-1)!;
        expect((lastCall[0] as { title: string }).title).toBe('B');
        // 空数组会让插件保留旧图；必须是一个空 src 才会被解成 null 位图。
        expect(artworkOf(lastCall)).toEqual([{ src: CLEARED_ARTWORK_SRC }]);
    });

    it('leaves the cover cleared when the new artwork fails to load', async () => {
        http.get.mockResolvedValue({ status: 404, data: '', headers: {} });
        const session = getFoliaMediaSession()!;
        session.metadata = createFoliaMediaMetadata({ title: 'C', artist: 'x', album: 'y', artwork: [{ src: 'https://cdn.test/c.jpg' }] });
        await flush();

        expect(plugin.setMetadata).toHaveBeenCalledTimes(1);
        expect(artworkOf(plugin.setMetadata.mock.calls[0])).toEqual([{ src: CLEARED_ARTWORK_SRC }]);
    });
});

describe('Android headphone transport integration', () => {
    it('routes unplug to the existing pause action and respects control gating', async () => {
        const pause = vi.fn();
        const disabled = { current: false };
        const session = getFoliaMediaSession()!;
        session.playbackState = 'playing';
        useMediaSessionBridge({
            audioRef: { current: {} as HTMLAudioElement },
            audioSrc: null,
            currentSong: null,
            cachedCoverUrl: null,
            playerState: PlayerState.PLAYING,
            isNowPlayingStageActive: false,
            unknownArtistLabel: '',
            mediaSessionPlayRef: { current: async () => {} },
            mediaSessionPauseRef: { current: pause },
            mediaSessionPrevRef: { current: () => {} },
            mediaSessionNextRef: { current: () => {} },
            isNowPlayingControlDisabledRef: disabled,
        });
        await flush();
        // No song is mounted in this isolated fixture; emulate the active media session before unplug.
        session.playbackState = 'playing';
        expect(device.setPlaybackState).toHaveBeenCalledWith({ playing: true });
        const notify = device.addListener.mock.calls[0][1];
        notify({ reason: 'headphones-disconnected' });
        expect(pause).toHaveBeenCalledOnce();
        disabled.current = true;
        notify({ reason: 'headphones-disconnected' });
        disabled.current = false;
        session.playbackState = 'paused';
        notify({ reason: 'headphones-disconnected' });
        expect(pause).toHaveBeenCalledOnce();
        cleanups.splice(0).forEach(cleanup => cleanup());
    });
});

describe('media session seekto', () => {
    const ref = <T,>(current: T) => ({ current });

    it('registers seekto and routes the system seek to the app seek', () => {
        const seek = vi.fn();
        const disabled = ref(false);
        useMediaSessionBridge({
            audioRef: ref(null),
            audioSrc: null,
            currentSong: null,
            cachedCoverUrl: null,
            playerState: PlayerState.IDLE,
            isNowPlayingStageActive: false,
            unknownArtistLabel: '',
            mediaSessionPlayRef: ref(async () => {}),
            mediaSessionPauseRef: ref(() => {}),
            mediaSessionPrevRef: ref(() => {}),
            mediaSessionNextRef: ref(() => {}),
            mediaSessionSeekRef: ref(seek),
            isNowPlayingControlDisabledRef: disabled,
        });

        const seekCall = plugin.setActionHandler.mock.calls.find(call => (call[0] as { action: string }).action === 'seekto');
        expect(seekCall).toBeTruthy();
        const nativeHandler = seekCall![1] as (details: { action: string; seekTime?: number | null }) => void;

        nativeHandler({ action: 'seekto', seekTime: 42.5 });
        expect(seek).toHaveBeenCalledWith(42.5);

        nativeHandler({ action: 'seekto', seekTime: null });
        disabled.current = true;
        nativeHandler({ action: 'seekto', seekTime: 10 });
        expect(seek).toHaveBeenCalledTimes(1);

        cleanups.splice(0).forEach(cleanup => cleanup());
    });
});
