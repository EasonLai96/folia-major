import { isCapacitorAndroid } from './runtime';

// src/platform/androidPowerProfile.ts
// Android App 的省电档：手机屏幕的像素密度约 3 倍，每个 canvas / WebGL 层都按它画，GPU 一直满载会发烫。
// 这里把渲染用的像素密度封顶，并给着色器背景一个更小的像素预算。浏览器和桌面版不受影响。

/** 渲染用像素密度的上限：2 倍在手机上仍然清晰，绘制量约为 3 倍时的一半。 */
const ANDROID_MAX_DEVICE_PIXEL_RATIO = 2;

/** 全屏着色器背景在手机上的像素预算（背景本来就是模糊的，放大看不出差别）。 */
const ANDROID_SHADER_PIXEL_BUDGET = 960 * 540;

/** 在入口最早调用一次：之后所有按 devicePixelRatio 定尺寸的 canvas 都会少画很多像素。 */
export const installAndroidPowerProfile = (): void => {
    if (!isCapacitorAndroid()) return;
    const nativeRatio = window.devicePixelRatio || 1;
    if (nativeRatio <= ANDROID_MAX_DEVICE_PIXEL_RATIO) return;
    try {
        Object.defineProperty(window, 'devicePixelRatio', {
            configurable: true,
            get: () => Math.min(ANDROID_MAX_DEVICE_PIXEL_RATIO, nativeRatio),
        });
        console.info('[AndroidPower] Render pixel ratio capped', { native: nativeRatio, used: ANDROID_MAX_DEVICE_PIXEL_RATIO });
    } catch (error) {
        console.warn('[AndroidPower] Could not cap the pixel ratio', error);
    }
};

/** 着色器背景的像素预算：Android App 里压到省电档，其他环境照传入的值。 */
export const shaderPixelBudget = (desktopBudget: number): number => (
    isCapacitorAndroid() ? Math.min(desktopBudget, ANDROID_SHADER_PIXEL_BUDGET) : desktopBudget
);
