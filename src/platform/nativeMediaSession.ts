import { CapacitorHttp } from '@capacitor/core';
import { MediaSession as NativeMediaSessionPlugin, type MediaSessionAction as NativeMediaSessionAction } from '@capgo/capacitor-media-session';
import { isCapacitorAndroid } from './runtime';

// src/platform/nativeMediaSession.ts
// Android App 的系统媒体会话：WebView 里的 navigator.mediaSession 不会在通知栏、锁屏或灵动岛（小米「超级岛」等）
// 出现任何东西，这里给出一个形状相同的替身，把调用转给原生插件（前台服务 + MediaStyle 通知）。
// 其他环境直接用浏览器自己的 navigator.mediaSession。

/** useMediaSessionBridge 实际用到的那一部分 MediaSession。 */
export type FoliaMediaSession = Pick<MediaSession, 'setActionHandler' | 'setPositionState'> & {
    metadata: MediaMetadata | null;
    playbackState: MediaSessionPlaybackState;
};

/** 通知和锁屏的封面边长：系统只画这么大，原图（常常上千像素）经 Binder 传过去会超限。 */
const ARTWORK_EDGE_PX = 512;

/** 把远程封面缩成一张小 JPEG 的 data URL（原生插件认 base64）。读不到就返回空串，通知照样出现、只是没有封面。 */
const shrinkArtwork = async (src: string): Promise<string> => {
    let dataUrl = src;
    if (/^https?:/i.test(src)) {
        // 原生 HTTP：封面 CDN 多半不带 CORS 头，WebView 里画到 canvas 会被污染。
        const answer = await CapacitorHttp.get({ url: src, responseType: 'blob' });
        if (answer.status < 200 || answer.status >= 300 || typeof answer.data !== 'string') return '';
        const type = String(answer.headers?.['Content-Type'] ?? answer.headers?.['content-type'] ?? 'image/jpeg');
        dataUrl = `data:${type.split(';')[0]};base64,${answer.data}`;
    } else if (!src.startsWith('data:') && !src.startsWith('blob:')) {
        return '';
    }
    const image = new Image();
    image.decoding = 'async';
    image.src = dataUrl;
    await image.decode();
    const scale = Math.min(1, ARTWORK_EDGE_PX / Math.max(image.naturalWidth, image.naturalHeight, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
};

/** 转给原生插件的媒体会话替身。所有调用都不抛错：系统面板出不来不该打断播放。 */
class NativeMediaSessionShim implements FoliaMediaSession {
    private current: MediaMetadata | null = null;
    private state: MediaSessionPlaybackState = 'none';
    /** 上一次交给原生的曲目；同一首重复发布（暂停、拖动进度时会）不再重新下载封面。 */
    private publishedKey = '';
    private artworkJob = 0;

    get metadata(): MediaMetadata | null {
        return this.current;
    }

    set metadata(value: MediaMetadata | null) {
        this.current = value;
        if (!value) {
            this.publishedKey = '';
            return;
        }
        const artworkSrc = value.artwork?.[0]?.src ?? '';
        const key = [value.title, value.artist, value.album, artworkSrc].join('\u0000');
        if (key === this.publishedKey) return;
        this.publishedKey = key;
        const job = ++this.artworkJob;
        const text = { title: value.title, artist: value.artist, album: value.album };
        // 先发文字，通知立刻换成新歌；封面缩好再补上。
        void NativeMediaSessionPlugin.setMetadata({ ...text, artwork: [] })
            .catch(error => console.warn('[NativeMediaSession] Metadata failed', error));
        if (!artworkSrc) return;
        void shrinkArtwork(artworkSrc)
            .then(src => {
                if (!src || job !== this.artworkJob) return;
                return NativeMediaSessionPlugin.setMetadata({ ...text, artwork: [{ src }] });
            })
            .catch(error => console.warn('[NativeMediaSession] Artwork failed', error));
    }

    get playbackState(): MediaSessionPlaybackState {
        return this.state;
    }

    set playbackState(value: MediaSessionPlaybackState) {
        if (value === this.state) return;
        this.state = value;
        console.info('[NativeMediaSession] Playback state', value);
        void NativeMediaSessionPlugin.setPlaybackState({ playbackState: value })
            .catch(error => console.warn('[NativeMediaSession] Playback state failed', error));
    }

    setPositionState(state?: MediaPositionState): void {
        if (!state) return;
        void NativeMediaSessionPlugin.setPositionState({
            duration: state.duration,
            position: state.position,
            playbackRate: state.playbackRate,
        }).catch(error => console.warn('[NativeMediaSession] Position failed', error));
    }

    setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void {
        // 原生那边一个动作只记最后一个回调；解绑时留着旧的，下一次绑定会把它换掉。
        if (!handler) return;
        // 只有浏览器才有的动作（skipad 等）原生不认，传过去也只是被忽略。
        void NativeMediaSessionPlugin.setActionHandler({ action: action as NativeMediaSessionAction }, details => {
            handler({ action: details.action, seekTime: details.seekTime ?? undefined } as MediaSessionActionDetails);
        }).catch(error => console.warn(`[NativeMediaSession] Failed to bind ${action}`, error));
    }
}

/**
 * 给原生替身用的 MediaMetadata：Android WebView 没有开 Media Session 这组接口，`new MediaMetadata()`
 * 会直接抛 ReferenceError，歌名和封面就送不到通知栏、锁屏和超级岛。替身只读这几个字段，给个普通对象就够。
 */
export const createFoliaMediaMetadata = (init: MediaMetadataInit): MediaMetadata => {
    if (typeof MediaMetadata === 'function') return new MediaMetadata(init);
    return {
        title: init.title ?? '',
        artist: init.artist ?? '',
        album: init.album ?? '',
        artwork: [...(init.artwork ?? [])],
    } as MediaMetadata;
};

let nativeShim: NativeMediaSessionShim | null = null;

/** 这个环境的媒体会话：Android App 是原生替身，浏览器 / 桌面是 navigator.mediaSession，都没有就是 null。 */
export const getFoliaMediaSession = (): FoliaMediaSession | null => {
    if (isCapacitorAndroid()) {
        nativeShim ??= new NativeMediaSessionShim();
        return nativeShim;
    }
    return typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null;
};

/** 系统面板是不是原生画的：原生面板不会自己推算进度，暂停和拖动后要再报一次位置。 */
export const isNativeMediaSession = (): boolean => isCapacitorAndroid();
