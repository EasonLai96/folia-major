import React, { useState } from 'react';
import { motion, useTransform, type PanInfo } from 'framer-motion';
import { Music, Pause, Play, SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PlayerState } from '../../../types';
import { getSongArtistLabel } from '../../../services/onlineMusic/songMetadata';
import { selectDisplayCoverUrl, selectDisplaySong, usePlaybackStore } from '../../../stores/usePlaybackStore';
import type FloatingPlayerControls from '../../FloatingPlayerControls';
import { resolveSwipeDirection } from './swipeGesture';
// src/components/app/mobile-player/MobileMiniPlayer.tsx
// Android App 在首页和歌墙上用的迷你播放条：贴在屏幕最下面，左边封面、中间歌名歌手、右边播放和下一首，
// 顶边一条细进度线。点一下进播放页，左右滑切歌。取代桌面版那条浮在内容上的胶囊。

type FloatingControlsProps = React.ComponentProps<typeof FloatingPlayerControls>;

type MobileMiniPlayerProps = Pick<FloatingControlsProps,
    'playerState' | 'currentTime' | 'duration' | 'canTogglePlay' | 'controlsDisabled' | 'isDaylight'
    | 'onTogglePlay' | 'onNavigateToPlayer' | 'trackNavigation'>;

/** 按钮上按下时不让外层当成点按或拖动：按钮做自己的事，不顺带打开播放页。 */
const stopPointer = (event: React.PointerEvent) => event.stopPropagation();

const MobileMiniPlayer: React.FC<MobileMiniPlayerProps> = ({
    playerState,
    currentTime,
    duration,
    canTogglePlay = false,
    controlsDisabled = false,
    isDaylight,
    onTogglePlay,
    onNavigateToPlayer,
    trackNavigation,
}) => {
    const { t } = useTranslation();
    const song = usePlaybackStore(selectDisplaySong);
    const coverUrl = usePlaybackStore(selectDisplayCoverUrl);
    // 读不到的封面（缓存回收掉的 blob 等）退回占位图，不留一块空白。
    const [brokenCoverUrl, setBrokenCoverUrl] = useState<string | null>(null);
    // 进度线直接跟 MotionValue 走，不经过 React state。
    const progressWidth = useTransform(currentTime, time => (
        duration > 0 ? `${Math.min(100, Math.max(0, (time / duration) * 100))}%` : '0%'
    ));

    if (!song) return null;

    const isPlaying = playerState === PlayerState.PLAYING;
    const artist = getSongArtistLabel(song);
    const coverSrc = coverUrl && coverUrl !== brokenCoverUrl ? coverUrl : null;
    const canNext = Boolean(trackNavigation?.canNext) && !controlsDisabled;
    const surface = isDaylight
        ? 'bg-white/85 border-t border-black/5 text-zinc-900'
        : 'bg-zinc-950/85 border-t border-white/10 text-zinc-100';
    const iconButton = `flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-30 ${
        isDaylight ? 'active:bg-black/10' : 'active:bg-white/15'
    }`;

    const handleDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
        if (!trackNavigation || controlsDisabled) return;
        const direction = resolveSwipeDirection(info.offset.x, info.offset.y, info.velocity.x);
        if (direction === 'left' && trackNavigation.canNext) {
            console.info('[MobileMiniPlayer] Swipe to next track');
            trackNavigation.onNext();
        } else if (direction === 'right' && trackNavigation.canPrev) {
            console.info('[MobileMiniPlayer] Swipe to previous track');
            trackNavigation.onPrev();
        }
    };

    return (
        <div
            className={`fixed inset-x-0 bottom-0 z-60 backdrop-blur-xl ${surface}`}
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
            data-folium-part="mobile-mini-player"
        >
            <div className={`h-0.5 w-full ${isDaylight ? 'bg-black/5' : 'bg-white/10'}`}>
                <motion.div className="h-full" style={{ width: progressWidth, backgroundColor: 'var(--text-primary)' }} />
            </div>
            <div className="flex items-center gap-2 px-3 pt-2">
                <motion.div
                    role="button"
                    tabIndex={0}
                    aria-label={t('ui.stageTrackPillOpenPlayer')}
                    className="flex min-w-0 flex-1 touch-pan-y items-center gap-3"
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.35}
                    dragSnapToOrigin
                    onDragEnd={handleDragEnd}
                    onTap={onNavigateToPlayer}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') onNavigateToPlayer();
                    }}
                >
                    <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg ${
                        isDaylight ? 'bg-zinc-200' : 'bg-zinc-800'
                    }`}>
                        {coverSrc && (
                            <img
                                key={coverSrc}
                                src={coverSrc}
                                alt=""
                                aria-hidden
                                decoding="async"
                                draggable={false}
                                onError={() => setBrokenCoverUrl(coverSrc)}
                                className="absolute inset-0 h-full w-full object-cover"
                            />
                        )}
                        {!coverSrc && <Music size={18} className="opacity-40" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{song.name}</div>
                        {artist && <div className="truncate text-xs opacity-60">{artist}</div>}
                    </div>
                </motion.div>
                <button
                    type="button"
                    aria-label={isPlaying ? t('ui.pause') : t('ui.play')}
                    className={iconButton}
                    disabled={!canTogglePlay || controlsDisabled}
                    onPointerDown={stopPointer}
                    onClick={onTogglePlay}
                >
                    {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
                </button>
                <button
                    type="button"
                    aria-label={trackNavigation?.nextLabel ?? t('ui.nextTrack')}
                    className={iconButton}
                    disabled={!canNext}
                    onPointerDown={stopPointer}
                    onClick={() => trackNavigation?.onNext()}
                >
                    <SkipForward size={20} fill="currentColor" />
                </button>
            </div>
        </div>
    );
};

export default MobileMiniPlayer;
