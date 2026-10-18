// src/components/app/mobile-player/swipeGesture.ts
// 判断一次手指滑动算不算「往某个方向滑」：迷你播放条和播放页的手势共用这一套门槛。

export type SwipeDirection = 'left' | 'right' | 'down' | 'up';

/** 至少滑这么远才算数，免得手指轻碰就切歌。 */
export const SWIPE_MIN_DISTANCE_PX = 70;
/** 滑得够快时，距离可以短一些。 */
export const SWIPE_FLING_VELOCITY = 500;
const SWIPE_FLING_MIN_DISTANCE_PX = 30;
/** 主方向要比另一方向长这么多倍，斜着划的不算。 */
const SWIPE_AXIS_RATIO = 1.5;

/** 位移（像素）和主方向速度（像素/秒）换成一个方向；不像一次明确的滑动就返回 null。 */
export const resolveSwipeDirection = (dx: number, dy: number, velocity = 0): SwipeDirection | null => {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const horizontal = ax >= ay * SWIPE_AXIS_RATIO;
    const vertical = ay >= ax * SWIPE_AXIS_RATIO;
    if (!horizontal && !vertical) return null;
    const distance = horizontal ? ax : ay;
    const fast = Math.abs(velocity) >= SWIPE_FLING_VELOCITY && distance >= SWIPE_FLING_MIN_DISTANCE_PX;
    if (distance < SWIPE_MIN_DISTANCE_PX && !fast) return null;
    if (horizontal) return dx < 0 ? 'left' : 'right';
    return dy > 0 ? 'down' : 'up';
};
