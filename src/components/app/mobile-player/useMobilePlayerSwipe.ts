import { useEffect, useRef } from 'react';
import { isCapacitorAndroid } from '../../../platform/runtime';
import { resolveSwipeDirection } from './swipeGesture';
// src/components/app/mobile-player/useMobilePlayerSwipe.ts
// Android App 播放页的手势：左滑下一首、右滑上一首、下滑退出播放页。
// 只认从歌词画面本身开始的滑动；按钮、进度条、面板、对话框和会自己滚动的歌词栏上的滑动不管。

type MobilePlayerSwipeOptions = {
    active: boolean;
    canPrev: boolean;
    canNext: boolean;
    onPrev: () => void;
    onNext: () => void;
    /** 退出播放页；和返回键走同一条路（先关右侧面板，再回上一页）。 */
    onClose: () => void;
};

const SURFACE_SELECTOR = '[data-testid="player-visual-surface"]';
const IGNORED_SELECTOR = 'button, a, input, textarea, select, [role="slider"], [role="dialog"], [role="menu"], [data-folium-part^="progress"]';

/** 从触点往上到画面根部，有没有能自己竖向滚动的元素：那种地方的下滑是在滚内容。 */
const isInsideScroller = (target: Element, surface: Element): boolean => {
    for (let node: Element | null = target; node && node !== surface; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight + 1) {
            const overflowY = getComputedStyle(node).overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll') return true;
        }
    }
    return false;
};

export const useMobilePlayerSwipe = (options: MobilePlayerSwipeOptions): void => {
    // 回调和可用性每次渲染都会变，放进 ref，监听只在进出播放页时挂一次。
    const optionsRef = useRef(options);
    optionsRef.current = options;
    const { active } = options;

    useEffect(() => {
        if (!active || !isCapacitorAndroid()) return;
        let start: { x: number; y: number; time: number; allowDown: boolean; } | null = null;

        const handleStart = (event: TouchEvent) => {
            start = null;
            if (event.touches.length !== 1) return;
            const target = event.target instanceof Element ? event.target : null;
            const surface = target?.closest(SURFACE_SELECTOR);
            if (!target || !surface || target.closest(IGNORED_SELECTOR)) return;
            const touch = event.touches[0];
            start = { x: touch.clientX, y: touch.clientY, time: event.timeStamp, allowDown: !isInsideScroller(target, surface) };
        };

        const handleEnd = (event: TouchEvent) => {
            const origin = start;
            start = null;
            const touch = event.changedTouches[0];
            if (!origin || !touch) return;
            const dx = touch.clientX - origin.x;
            const dy = touch.clientY - origin.y;
            const seconds = Math.max((event.timeStamp - origin.time) / 1000, 0.016);
            const velocity = Math.abs(dx) > Math.abs(dy) ? dx / seconds : dy / seconds;
            const direction = resolveSwipeDirection(dx, dy, velocity);
            const current = optionsRef.current;
            if (direction === 'left' && current.canNext) {
                console.info('[MobilePlayerSwipe] Swipe to next track');
                current.onNext();
            } else if (direction === 'right' && current.canPrev) {
                console.info('[MobilePlayerSwipe] Swipe to previous track');
                current.onPrev();
            } else if (direction === 'down' && origin.allowDown) {
                console.info('[MobilePlayerSwipe] Swipe down, leaving player');
                current.onClose();
            }
        };

        const handleCancel = () => {
            start = null;
        };

        window.addEventListener('touchstart', handleStart, { passive: true });
        window.addEventListener('touchend', handleEnd, { passive: true });
        window.addEventListener('touchcancel', handleCancel, { passive: true });
        return () => {
            window.removeEventListener('touchstart', handleStart);
            window.removeEventListener('touchend', handleEnd);
            window.removeEventListener('touchcancel', handleCancel);
        };
    }, [active]);
};
