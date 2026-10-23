import { afterEach, describe, expect, it, vi } from 'vitest';

// Device safety is Android-only, never auto-resumes, and removes late async listeners.
const plugin = vi.hoisted(() => ({ addListener: vi.fn() }));
const native = vi.hoisted(() => ({ enabled: true }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => plugin }));
vi.mock('@/platform/runtime', () => ({ isCapacitorAndroid: () => native.enabled }));
import { bindHeadphonePause, getAndroidDevice, shouldKeepPlayerScreenOn } from '@/platform/androidDevice';

afterEach(() => { native.enabled = true; vi.clearAllMocks(); });

describe('Android device policy', () => {
    it.each([
        ['player', true, true, true], ['lattice', true, true, true],
        ['home', true, true, false], ['player', false, true, false],
        ['player', true, false, false], ['lattice', false, false, false],
    ])('keeps screen awake only for visible playing views: %s %s %s', (view, playing, visible, expected) => {
        expect(shouldKeepPlayerScreenOn(view as string, playing as boolean, visible as boolean)).toBe(expected);
    });

    it('does not register a native plugin outside Android', () => {
        native.enabled = false;
        expect(getAndroidDevice()).toBeNull();
        bindHeadphonePause(vi.fn(), () => true)();
        expect(plugin.addListener).not.toHaveBeenCalled();
    });

    it('pauses only for disconnected headphones while playing, never after cleanup', async () => {
        let notify!: (event: { reason: string }) => void;
        const remove = vi.fn(async () => {});
        plugin.addListener.mockImplementation(async (_event, callback) => { notify = callback; return { remove }; });
        const pause = vi.fn();
        let playing = true;
        const dispose = bindHeadphonePause(pause, () => playing);
        await Promise.resolve();
        notify({ reason: 'headphones-disconnected' });
        notify({ reason: 'headphones-connected' });
        playing = false;
        notify({ reason: 'headphones-disconnected' });
        playing = true;
        dispose();
        notify({ reason: 'headphones-disconnected' });
        expect(pause).toHaveBeenCalledTimes(1);
        expect(remove).toHaveBeenCalledOnce();
    });

    it('removes a registration that arrives after unmount', async () => {
        let finish!: (value: { remove: () => Promise<void> }) => void;
        plugin.addListener.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        const dispose = bindHeadphonePause(vi.fn(), () => true);
        dispose();
        const remove = vi.fn(async () => {});
        finish({ remove });
        await Promise.resolve();
        expect(remove).toHaveBeenCalledOnce();
    });
});
