import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isCapacitorAndroid } from './runtime';

// Android-only device safety and visible-player screen policy; never adjusts audio volume.
interface FoliaDevicePlugin {
    setPlaybackState(options: { playing: boolean }): Promise<void>;
    setKeepScreenOn(options: { enabled: boolean }): Promise<void>;
    addListener(event: 'pauseRequested', listener: (event: { reason: string }) => void): Promise<PluginListenerHandle>;
}

let device: FoliaDevicePlugin | undefined;
export const getAndroidDevice = (): FoliaDevicePlugin | null => {
    if (!isCapacitorAndroid()) return null;
    device ??= registerPlugin<FoliaDevicePlugin>('FoliaDevice');
    return device;
};

/** Playback screens stay awake only while visible and playing, not while browsing or paused. */
export const shouldKeepPlayerScreenOn = (view: string, playing: boolean, visible: boolean): boolean => (
    visible && playing && (view === 'player' || view === 'lattice')
);

/** Removes even a listener whose asynchronous registration finishes after its owner unmounts. */
export const bindHeadphonePause = (pause: () => void, isPlaying: () => boolean): (() => void) => {
    const plugin = getAndroidDevice();
    if (!plugin) return () => {};
    let disposed = false;
    let handle: PluginListenerHandle | undefined;
    void plugin.addListener('pauseRequested', event => {
        if (!disposed && event.reason === 'headphones-disconnected' && isPlaying()) pause();
    }).then(listener => {
        if (disposed) void listener.remove();
        else handle = listener;
    }).catch(error => console.warn('[AndroidDevice] Headphone listener failed', error));
    return () => {
        disposed = true;
        void handle?.remove();
    };
};
