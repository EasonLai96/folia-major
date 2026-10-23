import { useEffect } from 'react';
import { SystemBars } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Style, StatusBar } from '@capacitor/status-bar';
import { isCapacitorAndroid } from '../platform/runtime';
import { useAppViewStore } from '../stores/useAppViewStore';
import { useLibraryHomeSurfaceStore } from '../library/core/home/useLibraryHomeSurfaceStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { PlayerState } from '../types';
import { getAndroidDevice, shouldKeepPlayerScreenOn } from '../platform/androidDevice';

// src/hooks/useCapacitorShell.ts
// Android App 的外壳：系统栏跟随明暗主题；返回键先当作 Esc 关掉面前的弹层，什么都没关掉时
// 再像系统应用一样退到后台（不结束播放）。整个应用沉浸：收起状态栏和导航条，画面铺满整个屏幕，
// 从屏幕边缘往里滑可以临时叫出来。浏览器和桌面版什么都不做。

/** 返回键之后这么久里页面没有变化，就当作已经在最外层。 */
const BACK_SETTLE_MS = 120;
/** 换页之后等这么久（动画走完）再收一次系统栏。 */
const SYSTEM_BARS_SETTLE_MS = 900;

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

/**
 * 首页停在后面的页签（如「本地」）时，返回键先回到第一个页签，跟系统应用的分页习惯一致；
 * 已经在第一个页签、或不在首页时返回 false，交给下一步退到后台。
 */
const returnToFirstHomeTab = (): boolean => {
    if (useAppViewStore.getState().view !== 'home') return false;
    const handle = useLibraryHomeSurfaceStore.getState().tabs;
    if (!handle) return false;
    const { active, tabs } = handle.getState();
    const first = tabs.find(tab => !tab.disabledReason);
    if (!first || first.key === active) return false;
    console.info('[CapacitorShell] Back on a later home tab, returning to the first tab', { from: active, to: first.key });
    return handle.setTab(first.key);
};

export const useCapacitorShell = (isDaylight: boolean, viewKey = ''): void => {
    useEffect(() => {
        const device = getAndroidDevice();
        if (!device) return;
        let previous: boolean | undefined;
        const update = () => {
            const enabled = shouldKeepPlayerScreenOn(
                useAppViewStore.getState().view,
                usePlaybackStore.getState().playerState === PlayerState.PLAYING,
                document.visibilityState === 'visible',
            );
            if (previous === enabled) return;
            previous = enabled;
            void device.setKeepScreenOn({ enabled })
                .catch(error => console.warn('[AndroidDevice] Screen policy failed', error));
        };
        const stopPlayback = usePlaybackStore.subscribe(update);
        const stopView = useAppViewStore.subscribe(update);
        document.addEventListener('visibilitychange', update);
        update();
        return () => {
            stopPlayback();
            stopView();
            document.removeEventListener('visibilitychange', update);
            void device.setKeepScreenOn({ enabled: false })
                .catch(error => console.warn('[AndroidDevice] Screen release failed', error));
        };
    }, []);

    useEffect(() => {
        if (!isCapacitorAndroid()) return;
        document.documentElement.dataset.runtime = 'capacitor-android';
        void StatusBar.setOverlaysWebView({ overlay: false }).catch(error => console.warn('[CapacitorShell] Status bar overlay failed', error));
        void StatusBar.setBackgroundColor({ color: isDaylight ? '#f4f4f5' : '#09090b' }).catch(error => console.warn('[CapacitorShell] Status bar color failed', error));
        void StatusBar.setStyle({ style: isDaylight ? Style.Light : Style.Dark }).catch(error => console.warn('[CapacitorShell] Status bar style failed', error));
    }, [isDaylight]);

    // 整个应用都收起系统栏（MainActivity 启动和拿回焦点时也会收）；换页时再收一次，防止系统把它放回来。
    // 等换页动画走完再收：收系统栏会触发一次窗口重排，跟动画撞在一起就掉帧。
    useEffect(() => {
        if (!isCapacitorAndroid()) return undefined;
        const timer = window.setTimeout(() => {
            void SystemBars.hide().catch(error => console.warn('[CapacitorShell] System bars visibility failed', error));
        }, SYSTEM_BARS_SETTLE_MS);
        return () => window.clearTimeout(timer);
    }, [viewKey]);

    useEffect(() => {
        if (!isCapacitorAndroid()) return;
        const listener = CapacitorApp.addListener('backButton', () => {
            const before = location.href;
            const hadLayer = hasOpenLayer();
            const handled = dispatchEscape();
            if (handled || hadLayer) return;
            window.setTimeout(() => {
                if (location.href !== before || hasOpenLayer()) return;
                if (returnToFirstHomeTab()) return;
                console.info('[CapacitorShell] Back at top level, moving app to background');
                void CapacitorApp.minimizeApp();
            }, BACK_SETTLE_MS);
        });
        return () => {
            void listener.then(handle => handle.remove());
        };
    }, []);
};
