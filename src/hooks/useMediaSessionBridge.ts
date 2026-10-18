import { useEffect } from 'react';
import type { RefObject } from 'react';
import { PlayerState } from '../types';
import type { SongResult } from '../types';
import { getSongAlbumLabel, getSongArtistLabel, getSongCoverUrl } from '../services/onlineMusic/songMetadata';
import {
    getSupportedMediaSessionArtworkUrl,
    isMediaSessionSourceReady,
    publishMediaSessionTrack,
} from '../utils/mediaSessionSync';
import { createFoliaMediaMetadata, getFoliaMediaSession, isNativeMediaSession } from '../platform/nativeMediaSession';

// Bridges Folia playback state to the browser Media Session API.
type UseMediaSessionBridgeOptions = {
    audioRef: RefObject<HTMLAudioElement | null>;
    /**
     * The deck the displayed track is playing on, or null when the picture is live.
     *
     * Metadata, clock and source have to describe the same deck. `currentSong` is already the
     * DISPLAYED track - the outgoing one for the length of a blend - while `audioRef` names the
     * active deck, which by then is the arriving track. Publishing the two together put the outgoing
     * track's title on the incoming track's duration and position, so the system panel showed one
     * song's name over another song's progress. `audioSrc` is passed to match this element.
     */
    getDisplayAudioElement?: () => HTMLAudioElement | null;
    audioSrc: string | null;
    currentSong: SongResult | null;
    cachedCoverUrl: string | null;
    playerState: PlayerState;
    isNowPlayingStageActive: boolean;
    unknownArtistLabel: string;
    mediaSessionPlayRef: RefObject<() => Promise<void>>;
    mediaSessionPauseRef: RefObject<() => void>;
    mediaSessionPrevRef: RefObject<() => void>;
    mediaSessionNextRef: RefObject<() => Promise<void> | void>;
    /** 系统面板（通知、锁屏）拖动进度时跳到的秒数；走 App 内进度条同一条跳转流程。 */
    mediaSessionSeekRef?: RefObject<(time: number) => void>;
    isNowPlayingControlDisabledRef: RefObject<boolean>;
};

export const useMediaSessionBridge = ({
    audioRef,
    getDisplayAudioElement,
    audioSrc,
    currentSong,
    cachedCoverUrl,
    playerState,
    isNowPlayingStageActive,
    unknownArtistLabel,
    mediaSessionPlayRef,
    mediaSessionPauseRef,
    mediaSessionPrevRef,
    mediaSessionNextRef,
    mediaSessionSeekRef,
    isNowPlayingControlDisabledRef,
}: UseMediaSessionBridgeOptions) => {
    useEffect(() => {
        // Android App 是原生替身（通知栏、锁屏、灵动岛），其他环境是 navigator.mediaSession。
        const mediaSession = getFoliaMediaSession();
        if (!mediaSession) {
            return;
        }

        const setActionHandlerSafely = (
            action: MediaSessionAction,
            handler: MediaSessionActionHandler | null
        ) => {
            try {
                mediaSession.setActionHandler(action, handler);
            } catch (e) {
                console.warn(`[MediaSession] Failed to bind ${action} handler`, e);
            }
        };

        setActionHandlerSafely('play', async () => {
            if (isNowPlayingControlDisabledRef.current || !audioRef.current) {
                return;
            }

            try {
                await mediaSessionPlayRef.current();
            } catch (e) {
                console.error('MediaSession play failed', e);
            }
        });
        setActionHandlerSafely('pause', () => {
            if (isNowPlayingControlDisabledRef.current || !audioRef.current) {
                return;
            }

            mediaSessionPauseRef.current();
        });
        setActionHandlerSafely('previoustrack', () => {
            if (isNowPlayingControlDisabledRef.current) {
                return;
            }
            mediaSessionPrevRef.current();
        });
        setActionHandlerSafely('nexttrack', () => {
            if (isNowPlayingControlDisabledRef.current) {
                return;
            }
            void mediaSessionNextRef.current();
        });
        // 不绑 seekto，Android 原生插件就不会向系统声明 ACTION_SEEK_TO，通知和锁屏的进度条拖不动。
        if (mediaSessionSeekRef) {
            setActionHandlerSafely('seekto', details => {
                if (isNowPlayingControlDisabledRef.current) {
                    return;
                }
                const seekTime = details.seekTime;
                if (typeof seekTime !== 'number' || !Number.isFinite(seekTime)) {
                    return;
                }
                mediaSessionSeekRef.current(Math.max(0, seekTime));
            });
        }

        return () => {
            setActionHandlerSafely('play', null);
            setActionHandlerSafely('pause', null);
            setActionHandlerSafely('previoustrack', null);
            setActionHandlerSafely('nexttrack', null);
            if (mediaSessionSeekRef) setActionHandlerSafely('seekto', null);
        };
    }, [audioRef, isNowPlayingControlDisabledRef, mediaSessionNextRef, mediaSessionPauseRef, mediaSessionPlayRef, mediaSessionPrevRef, mediaSessionSeekRef]);

    useEffect(() => {
        const mediaSession = getFoliaMediaSession();
        if (!mediaSession) {
            return;
        }

        if (!currentSong) {
            try {
                mediaSession.setPositionState();
                mediaSession.metadata = null;
            } catch (e) {
                console.warn('[MediaSession] Failed to clear metadata', e);
            }
            return;
        }

        // The displayed track's own deck, so the position published below belongs to the title
        // published beside it. Falls back to the active deck whenever no blend is holding a picture.
        const audio = getDisplayAudioElement?.() ?? audioRef.current;
        if (!audio || !audioSrc) {
            return;
        }

        let disposed = false;
        // 原生面板要自己下载封面：优先给远程地址，blob: 缓存地址在原生那边读不到。
        const nativePanel = isNativeMediaSession();
        const sourceArtworkUrl = (nativePanel
            ? getSongCoverUrl(currentSong) || cachedCoverUrl
            : cachedCoverUrl || getSongCoverUrl(currentSong)) || '';
        let artworkUrl = getSupportedMediaSessionArtworkUrl(sourceArtworkUrl, document.baseURI);
        let disposableArtworkUrl: string | null = null;
        const publish = () => {
            if (disposed || !isMediaSessionSourceReady(audio, audioSrc, document.baseURI)) {
                return;
            }

            try {
                publishMediaSessionTrack(mediaSession as MediaSession, audio, {
                    title: currentSong.name,
                    artist: getSongArtistLabel(currentSong) || unknownArtistLabel,
                    album: getSongAlbumLabel(currentSong),
                    artworkUrl,
                }, nativePanel ? createFoliaMediaMetadata : undefined);
            } catch (e) {
                console.warn('[MediaSession] Failed to update metadata', e);
            }
        };

        // MediaMetadata rejects Electron's custom protocol, so expose that image through a
        // short-lived blob URL while this track owns the platform media session.
        const prepareUnsupportedArtwork = async () => {
            if (!sourceArtworkUrl || artworkUrl || nativePanel) return;

            try {
                const response = await fetch(sourceArtworkUrl);
                if (!response.ok) throw new Error(`Artwork request failed: ${response.status}`);
                const artworkBlob = await response.blob();
                if (artworkBlob.size <= 0 || !artworkBlob.type.startsWith('image/')) {
                    throw new Error('Artwork response is not a valid image');
                }

                const objectUrl = URL.createObjectURL(artworkBlob);
                if (disposed) {
                    URL.revokeObjectURL(objectUrl);
                    return;
                }
                disposableArtworkUrl = objectUrl;
                artworkUrl = objectUrl;
                publish();
            } catch (e) {
                if (!disposed) console.warn('[MediaSession] Failed to prepare artwork', e);
            }
        };

        audio.addEventListener('loadedmetadata', publish);
        audio.addEventListener('durationchange', publish);
        // Re-publish after playback starts in case Chromium delivered a late clear from the old source.
        audio.addEventListener('playing', publish);
        // 原生面板不会自己跟进度：暂停、拖动后再报一次位置（同一首不会重复下载封面）。
        if (nativePanel) {
            audio.addEventListener('pause', publish);
            audio.addEventListener('seeked', publish);
        }
        publish();
        void prepareUnsupportedArtwork();

        return () => {
            disposed = true;
            audio.removeEventListener('loadedmetadata', publish);
            audio.removeEventListener('durationchange', publish);
            audio.removeEventListener('playing', publish);
            audio.removeEventListener('pause', publish);
            audio.removeEventListener('seeked', publish);
            if (disposableArtworkUrl) URL.revokeObjectURL(disposableArtworkUrl);
        };
    }, [audioRef, audioSrc, cachedCoverUrl, currentSong, getDisplayAudioElement, unknownArtistLabel]);

    useEffect(() => {
        const mediaSession = getFoliaMediaSession();
        if (!mediaSession) {
            return;
        }

        try {
            mediaSession.playbackState = isNowPlayingStageActive
                ? 'none'
                : currentSong
                    ? (playerState === PlayerState.PLAYING ? 'playing' : 'paused')
                    : 'none';
        } catch (e) {
            console.warn('[MediaSession] Failed to update playback state', e);
        }
    }, [currentSong, isNowPlayingStageActive, playerState]);
};
