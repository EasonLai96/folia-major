import { describe, expect, it, vi, afterEach } from 'vitest';
import postcss from 'postcss';
import presetEnv from 'postcss-preset-env';
// @ts-expect-error Build plugins are JavaScript modules without declarations.
import webview95Transforms from '../../../build/postcss-webview95.mjs';

// Guard Android-only transform conversion and its cascade-layer fallback.
const convert = async (css: string) => (await postcss([webview95Transforms()]).process(css, { from: undefined })).root;
afterEach(() => vi.unstubAllEnvs());

describe('WebView 95 transforms', () => {
    it('keeps calc/var arguments intact and preserves important', async () => {
        const root = await convert('.a { translate: calc(var(--x, 0) * 6px) 2px; scale: 1 2 3; rotate: x 30deg !important }');
        expect(root.toString()).toContain('translate(calc(var(--x, 0) * 6px), 2px)');
        expect(root.toString()).toContain('scale3d(1, 2, 3)');
        expect(root.toString()).toContain('rotateX(30deg) !important');
        expect(root.toString()).toMatch(/transform: var\(--folia-compat-translate\).* !important/);
    });
    it('preserves existing transform and supplies blank defaults', async () => {
        const root = await convert('.a { translate: 1px 2px 3px; transform: skewX(5deg) } .b { scale: none }');
        expect(root.toString()).toContain('translate3d(1px, 2px, 3px)');
        expect(root.toString()).toContain('--folia-compat-transform: skewX(5deg)');
        const defaults = root.first as postcss.AtRule;
        expect(defaults.name).toBe('layer');
        expect((defaults.first as postcss.Rule).selector).toBe('*,::before,::after');
        expect((defaults.first as postcss.Rule).nodes.every(node => node.type === 'decl' && node.value === ' ')).toBe(true);
    });
    it('leaves standard and prefixed keyframes unchanged', async () => {
        const css = '@keyframes a { to { scale: 2 } } @-webkit-keyframes b { to { translate: 2px } }';
        expect((await convert(css)).toString()).toBe(css);
    });
    it('keeps centering transforms while a transform keyframe spins', async () => {
        const root = await convert('.a { translate: 0 -50%; transition: translate 200ms, opacity 1s } @keyframes spin { to { transform: rotate(360deg) } }');
        expect(root.toString()).toContain('transition: transform 200ms, opacity 1s');
        const animation = root.nodes.find(node => node.type === 'atrule' && node.name === 'keyframes') as postcss.AtRule;
        expect(animation.toString()).toContain('var(--folia-compat-translate, )');
        expect(animation.toString()).toContain('rotate(360deg)');
    });
    it('flattens generated and existing layers', async () => {
        const output = await postcss([webview95Transforms(), presetEnv({ browsers: 'Chrome >= 95', stage: 2, features: { 'nesting-rules': true, 'cascade-layers': true } })]).process('@layer utilities { .a { scale: 2 } }', { from: undefined });
        expect(output.css).not.toContain('@layer');
        expect(output.css).toContain('--folia-compat-scale');
    });
    it('gates compatibility to capacitor, leaving desktop unchanged', async () => {
        const input = '@layer demo { .a { scale: 2 } }';
        for (const target of ['desktop', 'capacitor']) {
            vi.stubEnv('FOLIA_BUILD_TARGET', target);
            vi.resetModules();
            // @ts-expect-error PostCSS config is JavaScript without declarations.
            const { default: config } = await import('../../../postcss.config.js');
            const result = await postcss(config.plugins).process(input, { from: undefined });
            if (target === 'desktop') expect(result.css).toBe(input);
            else {
                expect(result.css).not.toContain('@layer');
                expect(result.css).toContain('--folia-compat-scale');
            }
        }
    });
});
