import React from 'react';
import FloatingPlayerControls from '../../FloatingPlayerControls';
import MobileMiniPlayer from './MobileMiniPlayer';
import { useMobilePlayerSwipe } from './useMobilePlayerSwipe';
import { useAppChromeStore } from '../../../stores/useAppChromeStore';
// src/components/app/mobile-player/MobilePlayerChrome.tsx
// Android App 的播放条：首页和歌墙换成贴底的迷你播放条；播放页保留原来的胶囊（进度、循环、槽位都在上面），
// 另外加上左右滑切歌、下滑退出；轻点画面把进度胶囊和右下按钮一起收起（纯画面，方便截图拍照），再点一下叫回来。

type FloatingControlsProps = React.ComponentProps<typeof FloatingPlayerControls>;

/** 下滑退出和返回键走同一条路：派发一次 Esc，播放页自己决定先关面板还是回上一页。 */
const leavePlayer = () => {
    const target = (document.activeElement as HTMLElement | null) ?? document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
};

const MobilePlayerChrome: React.FC<FloatingControlsProps> = (props) => {
    const { currentView, trackNavigation, controlsDisabled } = props;
    const isPlayer = currentView === 'player';

    useMobilePlayerSwipe({
        active: isPlayer && !controlsDisabled,
        canPrev: Boolean(trackNavigation?.canPrev),
        canNext: Boolean(trackNavigation?.canNext),
        onPrev: () => trackNavigation?.onPrev(),
        onNext: () => trackNavigation?.onNext(),
        onClose: leavePlayer,
        readHidden: () => useAppChromeStore.getState().isPlayerChromeHidden,
        onTap: (wasHidden) => useAppChromeStore.getState().setIsPlayerChromeHidden(!wasHidden),
    });

    if (isPlayer) return <FloatingPlayerControls {...props} />;
    return <MobileMiniPlayer {...props} />;
};

export default MobilePlayerChrome;
