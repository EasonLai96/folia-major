import { useEffect } from 'react';
import { SystemBars } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Style, StatusBar } from '@capacitor/status-bar';
import { isCapacitorAndroid } from '../platform/runtime';

// src/hooks/useCapacitorShell.ts
// Android App 的外壳：系统栏跟随明暗主题；返回键先当作 Esc 关掉面前的弹层，什么都没关掉时
// 再像系统应用一样退到后台（不结束播放）。播放页沉浸：收起状态栏和导航条，画面铺满整个屏幕，
// 从屏幕边缘往里滑可以临时叫出来。浏览器和桌面版什么都不做。

/** 返回键之后这么久里页面没有变化，就当作已经在最外层。 */
const BACK_SETTLE_MS = 120;

// 往当前焦点派发一次 Esc，返回是否有监听者处理了它。
const dispatchEscape = (): boolean => {
    const target = (document.activeElement as HTMLElement | null) ?? document.body;
    const event = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
};

/** 页面上有没有打开的弹层（对话框、菜单）。 */
const hasOpenLayer = (): boolean => Boolean(
    document.querySelector('[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"]'),
);

export const useCapacitorShell = (isDaylight: boolean, isImmersive = false): void => {
    useEffect(() => {
        if (!isCapacitorAndroid()) return;
        document.documentElement.dataset.runtime = 'capacitor-android';
        void StatusBar.setOverlaysWebView({ overlay: false }).catch(error => console.warn('[CapacitorShell] Status bar overlay failed', error));
        void StatusBar.setBackgroundColor({ color: isDaylight ? '#f4f4f5' : '#09090b' }).catch(error => console.warn('[CapacitorShell] Status bar color failed', error));
        void StatusBar.setStyle({ style: isDaylight ? Style.Light : Style.Dark }).catch(error => console.warn('[CapacitorShell] Status bar style failed', error));
    }, [isDaylight]);

    // 只在播放页收起系统栏；首页、设置这些页面仍要看得到时间和电量。
    useEffect(() => {
        if (!isCapacitorAndroid()) return;
        const request = isImmersive ? SystemBars.hide() : SystemBars.show();
        void request.catch(error => console.warn('[CapacitorShell] System bars visibility failed', error));
    }, [isImmersive]);

    useEffect(() => {
        if (!isCapacitorAndroid()) return;
        const listener = CapacitorApp.addListener('backButton', () => {
            const before = location.href;
            const hadLayer = hasOpenLayer();
            const handled = dispatchEscape();
            if (handled || hadLayer) return;
            window.setTimeout(() => {
                if (location.href !== before || hasOpenLayer()) return;
                console.info('[CapacitorShell] Back at top level, moving app to background');
                void CapacitorApp.minimizeApp();
            }, BACK_SETTLE_MS);
        });
        return () => {
            void listener.then(handle => handle.remove());
        };
    }, []);
};
