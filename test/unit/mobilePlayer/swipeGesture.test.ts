import { describe, expect, it } from 'vitest';
import { resolveSwipeDirection } from '../../../src/components/app/mobile-player/swipeGesture';

// test/unit/mobilePlayer/swipeGesture.test.ts
// 播放页和迷你播放条的滑动门槛：够远或够快才算，斜着划不算。

describe('resolveSwipeDirection', () => {
    it('reads long horizontal and vertical swipes', () => {
        expect(resolveSwipeDirection(-120, 10)).toBe('left');
        expect(resolveSwipeDirection(120, -10)).toBe('right');
        expect(resolveSwipeDirection(5, 150)).toBe('down');
        expect(resolveSwipeDirection(5, -150)).toBe('up');
    });

    it('ignores short taps and diagonal drags', () => {
        expect(resolveSwipeDirection(20, 3)).toBeNull();
        expect(resolveSwipeDirection(100, 90)).toBeNull();
    });

    it('accepts a short but fast fling', () => {
        expect(resolveSwipeDirection(-40, 2, -900)).toBe('left');
        expect(resolveSwipeDirection(-40, 2, -100)).toBeNull();
    });
});
