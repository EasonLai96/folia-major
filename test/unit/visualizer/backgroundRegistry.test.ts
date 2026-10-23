import React from 'react';
import { motionValue } from 'framer-motion';
import { describe, expect, it, vi } from 'vitest';
import FluidBackground from '@/components/visualizer/backgrounds/common/FluidBackground';
import UrlBackgroundLayer from '@/components/visualizer/backgrounds/url/UrlBackgroundLayer';
import type { VisualizerBackgroundRenderProps } from '@/components/visualizer/backgrounds/definition';
import {
    DEFAULT_VISUALIZER_BACKGROUND_MODE,
    VISUALIZER_BACKGROUND_REGISTRY,
    getVisualizerBackgroundModeLabel,
    getVisualizerBackgroundRegistryEntry,
    hasVisualizerBackgroundMode,
} from '@/components/visualizer/backgrounds/registry';

// test/unit/visualizer/backgroundRegistry.test.ts
// Locks the folder-discovered visualizer background registry contract.

describe('visualizer background registry', () => {
    it('auto-loads built-in backgrounds in stable order', () => {
        expect(VISUALIZER_BACKGROUND_REGISTRY.map(entry => entry.mode)).toEqual([
            'common',
            'monet',
            'nomand',
            'latent',
            'url',
            'sora',
        ]);
    });

    it('keeps background modes unique and renderable', () => {
        const modes = VISUALIZER_BACKGROUND_REGISTRY.map(entry => entry.mode);

        expect(new Set(modes).size).toBe(modes.length);
        expect(VISUALIZER_BACKGROUND_REGISTRY.every(entry => typeof entry.render === 'function')).toBe(true);
    });

    it('falls back to Latent for unknown lookups', () => {
        expect(DEFAULT_VISUALIZER_BACKGROUND_MODE).toBe('latent');
        expect(hasVisualizerBackgroundMode('nomand')).toBe(true);
        expect(hasVisualizerBackgroundMode('latent')).toBe(true);
        expect(hasVisualizerBackgroundMode('missing-mode')).toBe(false);
        expect(getVisualizerBackgroundRegistryEntry('missing-mode').mode).toBe('latent');
    });

    it('uses local cover colours for empty, stale or invalid embedded selections', () => {
        const base = {
            theme: { backgroundColor: '#111', primaryColor: '#fff', secondaryColor: '#888' },
            coverUrl: 'https://example.com/cover.jpg',
            audioPower: motionValue(0),
            audioBands: {},
            isDaylight: false,
            staticMode: false,
            paused: true,
        } as VisualizerBackgroundRenderProps;
        const items = [{ id: 'page', url: 'https://example.com', note: 'Page' }];
        for (const url of [
            undefined,
            { items: [], selectedId: null },
            { items, selectedId: 'deleted' },
            { items: [{ id: 'page', url: 'javascript:alert(1)', note: '' }], selectedId: 'page' },
        ]) {
            const props = { ...base, config: { mode: 'url' as const, url } };
            const result = getVisualizerBackgroundRegistryEntry('url').render(props) as React.ReactElement;
            expect(result.type).toBe(FluidBackground);
            expect(result.props).toMatchObject({ coverUrl: base.coverUrl, theme: base.theme });
            expect(props.config.url).toBe(url);
        }
        const result = getVisualizerBackgroundRegistryEntry('url').render({
            ...base, config: { mode: 'url', url: { items, selectedId: 'page' } },
        }) as React.ReactElement;
        expect(result.type).toBe(UrlBackgroundLayer);
    });

    it('uses label fallback when translation is missing', () => {
        expect(getVisualizerBackgroundModeLabel('nomand', key => key)).toBe('Nomand');
        expect(getVisualizerBackgroundModeLabel('latent', key => key)).toBe('Latent');
    });

    it('resets only the active background settings without changing its mode', () => {
        const onModeChange = vi.fn();
        const onResetTuning = vi.fn();

        getVisualizerBackgroundRegistryEntry('nomand').resetSettings?.({
            onModeChange,
            nomand: { onResetTuning },
        });

        expect(onResetTuning).toHaveBeenCalledOnce();
        expect(onModeChange).not.toHaveBeenCalled();
    });
});
