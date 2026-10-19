import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import type { ProviderErrorCode } from '../../../../types/onlineMusic';
import type { YtmBridgeResult, YtmOperation, YtmParams, YtmWireCollection, YtmWireSong } from '../ytmTransport';
import {
    VIDEO_ID, albumFromCard, albumFromPage, artistFromPage, bitrateOf, lrcFromLyricsPage, lyricsBrowseId,
    pickAudioFormat, songFromListItem, songFromQueueItem,
} from './ytmAndroidCatalog';
import { createYtmSandbox } from './ytmAndroidSandbox';
import { mintYtmToken } from './ytmAndroidToken';
import { ytmNativeFetch } from './ytmNativeFetch';

// src/services/onlineMusic/ytm/android/ytmAndroidBridge.ts
// Android App 上的 YouTube Music：桌面版的这些操作在主进程（electron/ytm/ytmApiBridge.cjs）里跑，
// Android 没有主进程，改在 WebView 里用 youtubei.js 跑，请求走原生 HTTP（ytmNativeFetch.ts）。
// 只有访客能做的事：搜歌、歌曲详情、歌词、专辑、歌手、公开歌单、mix、播放。登录、账户的资料库、
// 探索页和改动账户的操作回答 `unsupported` / `auth-required`。
// 音频：YouTube 的音频服务器不给 https://localhost 回 CORS 头，<audio crossOrigin> 读不了，所以带上
// BotGuard 令牌整首下载到 App 的缓存目录，再交出那个文件的本地地址。

/* eslint-disable @typescript-eslint/no-explicit-any */

class YtmAndroidError extends Error {
    constructor(public readonly code: ProviderErrorCode, message: string) { super(message); }
}
const fail = (code: ProviderErrorCode, message: string): never => { throw new YtmAndroidError(code, message); };

const MOBILE_BROWSE_URL = 'https://music.youtube.com/youtubei/v1/browse?prettyPrint=false';
const WATCH_URL = 'https://music.youtube.com/youtubei/v1/next?prettyPrint=false';
// 手机版 YouTube Music 的歌词页带逐行时间轴，网页版的没有。
const MOBILE_CLIENT = { clientName: 'ANDROID_MUSIC', clientVersion: '7.21.50' };
// App 的语言对应 YouTube 页面的语言。
const PAGE_LANGUAGES: Record<string, string> = { 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', en: 'en', in: 'id' };
// 一个会话用多久就重建（播放器脚本会更新）。
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const AUDIO_DIR = 'ytm-audio';
// 缓存目录里最多留几首；多出来的按时间先后删掉。
const KEPT_AUDIO_FILES = 6;

const boundedText = (value: unknown, max: number): string | null => (
    typeof value === 'string' && value.length > 0 && value.length <= max ? value : null
);
const entityId = (value: unknown): string | null => (typeof value === 'string' && /^[\w-]{2,128}$/.test(value) ? value : null);
const videoId = (value: unknown): string => (typeof value === 'string' && VIDEO_ID.test(value) ? value : fail('invalid-response', 'Invalid track id'));
const pageToken = (value: unknown): string | undefined => {
    if (value === undefined) return undefined;
    return boundedText(value, 8192) ?? fail('invalid-response', 'Invalid page token');
};

type Library = typeof import('youtubei.js');
let library: Promise<Library> | null = null;
const sandbox = createYtmSandbox();

// youtubei.js 只在第一次用到 YouTube Music 时加载（几百 KB）。播放器的解密脚本在沙盒 iframe 里跑。
const loadLibrary = (): Promise<Library> => {
    if (!library) {
        const loading = import('youtubei.js').then(loaded => {
            loaded.Platform.shim.eval = (data: { output: string }) => sandbox.evaluate(`(() => { ${data.output}\n })()`) as any;
            loaded.Parser.setParserErrorHandler(() => {});
            return loaded;
        });
        library = loading;
        loading.catch(() => { if (library === loading) library = null; });
    }
    return library;
};

const languageOf = (): string => {
    const lang = typeof document !== 'undefined' ? document.documentElement.lang : '';
    return PAGE_LANGUAGES[lang] ?? (lang.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en');
};

type Session = InstanceType<Library['Innertube']>;
const lazySession = (create: (lang: string | undefined) => Promise<Session>, pagesIn: () => string | undefined = () => undefined) => {
    let current: { promise: Promise<Session>; at: number; lang: string | undefined } | null = null;
    return () => {
        const lang = pagesIn();
        if (!current || current.lang !== lang || Date.now() - current.at > SESSION_MAX_AGE_MS) {
            const holder = { promise: create(lang), at: Date.now(), lang };
            holder.promise.catch(error => {
                if (current === holder) current = null;
                console.warn('[Ytm] A YouTube Music session could not be built', error);
            });
            current = holder;
        }
        return current.promise;
    };
};

const guestSession = lazySession(async lang => {
    const { Innertube } = await loadLibrary();
    return Innertube.create({ lang, retrieve_player: false, fetch: ytmNativeFetch });
}, languageOf);

const playerSession = lazySession(async () => {
    const { Innertube } = await loadLibrary();
    return Innertube.create({ retrieve_player: true, fetch: ytmNativeFetch });
});

const postJson = async (url: string, body: unknown): Promise<any> => {
    const response = await ytmNativeFetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) fail(response.status === 429 ? 'network' : 'unavailable', `YouTube Music answered status ${response.status}`);
    return await response.json();
};

const songOfWatchPage = (page: any, id: string, YTNodes: Library['YTNodes']): YtmWireSong | null => {
    const entries = page.contents_memo?.getType(YTNodes.PlaylistPanelVideo) ?? [];
    return songFromQueueItem(entries.find((entry: any) => entry.video_id === id)) ?? null;
};

const songInLanguage = async (params: YtmParams, hl: string): Promise<YtmWireSong | null> => {
    const id = videoId(params.id);
    const { Constants, Parser, YTNodes } = await loadLibrary();
    const { NAME: clientName, VERSION: clientVersion } = Constants.CLIENTS.YTMUSIC;
    const data = await postJson(WATCH_URL, { context: { client: { clientName, clientVersion, hl } }, videoId: id });
    return songOfWatchPage(Parser.parseResponse(data), id, YTNodes);
};

const playlistPageOf = (page: any, further: boolean, YTNodes: Library['YTNodes']) => {
    const shelf = further ? undefined : page.contents_memo?.getType(YTNodes.MusicPlaylistShelf)?.[0];
    const rows = [...(further
        ? page.on_response_received_actions?.find((action: any) => action?.type === 'AppendContinuationItemsAction')?.contents ?? []
        : shelf?.contents ?? [])];
    if (further && rows.length === 0) fail('invalid-response', 'YouTube Music playlist page has no rows');
    const next = rows.find((row: any) => row?.type === 'ContinuationItem')?.endpoint?.payload?.token ?? shelf?.continuation;
    return {
        items: rows.map((row: any) => songFromListItem(row)).filter(Boolean) as YtmWireSong[],
        ...(typeof next === 'string' && next ? { continuation: next } : {}),
    };
};

// ---- 音频 ----

const extensionOf = (mimeType: string): string => (/webm/i.test(mimeType) ? 'webm' : 'm4a');

// 缓存目录里只留最近几首；正在下载的那首不算在内。
const pruneAudio = async (keep: string): Promise<void> => {
    try {
        const { files } = await Filesystem.readdir({ directory: Directory.Cache, path: AUDIO_DIR });
        const old = files
            .filter(file => file.type === 'file' && file.name !== keep)
            .sort((left, right) => (right.mtime ?? 0) - (left.mtime ?? 0))
            .slice(KEPT_AUDIO_FILES - 1);
        await Promise.all(old.map(file => Filesystem.deleteFile({ directory: Directory.Cache, path: `${AUDIO_DIR}/${file.name}` }).catch(() => undefined)));
    } catch { /* 目录还不在 */ }
};

const audio = async (params: YtmParams) => {
    const id = videoId(params.id);
    const level = params.quality === 'standard' ? 'standard' : 'high';
    const [yt, poToken] = await Promise.all([playerSession(), mintYtmToken(id)]);
    let info: any;
    try {
        info = await yt.getBasicInfo(id, { client: 'YTMUSIC', po_token: poToken } as any);
    } catch (error) {
        console.warn(`[Ytm] The player request for ${id} failed`, error);
        fail('not-playable', 'YouTube Music cannot play this track');
    }
    if (info.playability_status?.status !== 'OK') {
        const status = String(info.playability_status?.status ?? '');
        fail('not-playable', `YouTube Music cannot play this track${/^[A-Z_]{2,40}$/.test(status) ? ` (${status})` : ''}`);
    }
    const format = pickAudioFormat(info.streaming_data?.adaptive_formats ?? [], level);
    if (!format) fail('not-playable', 'YouTube Music offered no audio for this track');
    const length = Number(format.content_length);
    const address = new URL(await format.decipher(yt.session.player));
    address.searchParams.set('pot', poToken);
    // 一次要整个文件：音频服务器对不写 range 的大请求只按播放速度给（桌面版实测）。
    address.searchParams.set('range', `0-${length - 1}`);
    const mimeType = String(format.mime_type).split(';')[0];
    const name = `${id}-${format.itag}.${extensionOf(mimeType)}`;
    const path = `${AUDIO_DIR}/${name}`;
    const startedAt = Date.now();
    let uri: string | null = null;
    try {
        const kept = await Filesystem.stat({ directory: Directory.Cache, path });
        if (Number(kept.size) === length) uri = kept.uri;
    } catch { /* 还没下过 */ }
    if (!uri) {
        await Filesystem.mkdir({ directory: Directory.Cache, path: AUDIO_DIR, recursive: true }).catch(() => undefined);
        const done = await Filesystem.downloadFile({
            url: address.href, directory: Directory.Cache, path, recursive: true,
            connectTimeout: 15000, readTimeout: 30000,
        } as any);
        const stat = await Filesystem.stat({ directory: Directory.Cache, path });
        if (Number(stat.size) !== length) {
            await Filesystem.deleteFile({ directory: Directory.Cache, path }).catch(() => undefined);
            console.warn(`[Ytm] The download of ${id} gave ${stat.size} of ${length} bytes`);
            fail('network', 'YouTube Music audio download was cut off');
        }
        uri = done.path ? `file://${done.path}` : stat.uri;
        console.log(`[Ytm] Downloaded ${id} (itag ${format.itag}, ${Math.round(length / 1024)} KB) in ${Date.now() - startedAt}ms`);
    }
    void pruneAudio(name);
    return { url: Capacitor.convertFileSrc(uri), route: 'android', itag: format.itag, bitrate: bitrateOf(format) };
};

// ---- 各个操作 ----

type Handler = (params: YtmParams) => Promise<unknown>;

const handlers: Partial<Record<YtmOperation, Handler>> = {
    // Android 没有登录：访客。
    login_status: async () => null,
    logout: async () => true,
    web_login_start: async () => fail('unsupported', 'YouTube Music sign-in is not available on Android'),
    web_login_check: async () => ({ state: 'expired' }),
    web_login_open: async () => ({}),
    web_login_cancel: async () => ({}),

    async search_songs(params) {
        const guest = await guestSession();
        let shelf: any;
        const continuation = pageToken(params.continuation);
        if (continuation !== undefined) {
            const page: any = await guest.actions.execute('/search', { continuation, client: 'YTMUSIC', parse: true });
            shelf = page.continuation_contents;
        } else {
            const query = boundedText(typeof params.query === 'string' ? params.query.trim() : null, 200)
                ?? fail('invalid-response', 'Search query is missing');
            const search: any = await guest.music.search(query, { type: 'song' });
            shelf = (search.contents ?? []).find((section: any) => section?.type === 'MusicShelf');
        }
        const items = (shelf?.contents ?? []).map((item: any) => songFromListItem(item)).filter(Boolean);
        return { items, ...(typeof shelf?.continuation === 'string' && shelf.continuation ? { continuation: shelf.continuation } : {}) };
    },

    async song_detail(params) {
        const id = videoId(params.id);
        const [guest, { YTNodes }] = await Promise.all([guestSession(), loadLibrary()]);
        return songOfWatchPage(await guest.actions.execute('/next', { videoId: id, client: 'YTMUSIC', parse: true }), id, YTNodes);
    },
    song_detail_en: params => songInLanguage(params, 'en'),
    song_detail_zh: params => songInLanguage(params, 'zh-CN'),

    async lyrics(params) {
        const id = videoId(params.id);
        const guest = await guestSession();
        const watch: any = await guest.actions.execute('/next', { videoId: id, client: 'YTMUSIC', parse: false });
        const browseId = lyricsBrowseId(watch.data);
        if (!browseId) return null;
        const mainText = lrcFromLyricsPage(await postJson(MOBILE_BROWSE_URL, { context: { client: MOBILE_CLIENT }, browseId }));
        return mainText ? { mainText } : null;
    },

    async album(params) {
        const id = entityId(params.id);
        if (!id?.startsWith('MPRE')) fail('invalid-response', 'Invalid album id');
        const guest = await guestSession();
        return albumFromPage(await guest.music.getAlbum(id!), id!);
    },

    async artist(params) {
        const id = entityId(params.id);
        if (!id?.startsWith('UC')) fail('invalid-response', 'Invalid artist id');
        const [guest, { YTNodes }] = await Promise.all([guestSession(), loadLibrary()]);
        const { albumShelves, ...artist } = artistFromPage(await guest.music.getArtist(id!), id!);
        const self = [{ id: id!, name: artist.collection.name }];
        const shelves = await Promise.all(albumShelves.map(async shelf => {
            if (!shelf.more) return shelf.items;
            try {
                const page: any = await shelf.more.call(guest.actions, { client: 'YTMUSIC', parse: true });
                const full = (page.contents_memo?.getType(YTNodes.MusicTwoRowItem) ?? [])
                    .map((item: any) => albumFromCard(item, self)).filter(Boolean) as YtmWireCollection[];
                return full.length > 0 ? full : shelf.items;
            } catch { return shelf.items; }
        }));
        const albums = [...new Map(shelves.flat().map(album => [album.id, album])).values()];
        return { ...artist, albums };
    },

    async public_playlist(params) {
        const id = entityId(params.id) ?? fail('invalid-response', 'Invalid playlist id');
        const continuation = pageToken(params.continuation);
        const [guest, { YTNodes }] = await Promise.all([guestSession(), loadLibrary()]);
        const page = await guest.actions.execute('/browse', {
            ...(continuation ? { continuation } : { browseId: `VL${id}` }), client: 'YTMUSIC', parse: true,
        });
        return playlistPageOf(page, Boolean(continuation), YTNodes);
    },

    async mix(params) {
        const id = entityId(params.id) ?? fail('invalid-response', 'Invalid mix id');
        const first = params.videoId === undefined ? undefined : videoId(params.videoId);
        const [guest, { YTNodes }] = await Promise.all([guestSession(), loadLibrary()]);
        const page: any = await guest.actions.execute('/next', {
            playlistId: id, ...(first ? { videoId: first } : {}), client: 'YTMUSIC', parse: true,
        });
        const entries = page.contents_memo?.getType(YTNodes.PlaylistPanelVideo) ?? [];
        return { items: entries.map((entry: any) => songFromQueueItem(entry)).filter(Boolean) };
    },

    audio,
};

// 库和网络抛出的错带着请求地址和响应正文，只交出一个码和一句固定的话。
const toErrorResult = (error: unknown): YtmBridgeResult => {
    if (error instanceof YtmAndroidError) return { ok: false, error: { code: error.code, message: error.message } };
    const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
    if (/status code 429\b|status 429\b/i.test(text)) {
        return { ok: false, error: { code: 'network', message: 'YouTube Music asked to wait before trying again' } };
    }
    if (/fetch|network|timeout|timed out|socket|unable to resolve|abort|status code 5\d\d\b|connect/i.test(text)) {
        return { ok: false, error: { code: 'network', message: 'YouTube Music could not be reached' } };
    }
    return { ok: false, error: { code: 'invalid-response', message: 'YouTube Music operation failed' } };
};

/** 和桌面版 window.electron.ytmRequest 一样的回答格式。 */
export const requestYtmOnAndroid = async (operation: YtmOperation, params: YtmParams): Promise<YtmBridgeResult> => {
    const handler = handlers[operation];
    if (!handler) {
        // 账户的资料库、探索页、改动：Android 上没有登录，就没有账户。
        return { ok: false, error: { code: 'auth-required', message: 'Sign in to YouTube Music' } };
    }
    try {
        return { ok: true, data: await handler(params) };
    } catch (error) {
        if (!(error instanceof YtmAndroidError)) console.warn(`[Ytm] ${operation} failed on Android`, error);
        return toErrorResult(error);
    }
};
