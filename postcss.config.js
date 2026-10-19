import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import presetEnv from 'postcss-preset-env';
import webview95Transforms from './build/postcss-webview95.mjs';

// Run Android compatibility after Tailwind, before the existing autoprefixer pass.
const androidCompatibility = {
    postcssPlugin: 'folia-android-compatibility',
    async Once(root, { result }) {
        const converted = await postcss([
            webview95Transforms(),
            presetEnv({
                browsers: 'Chrome >= 95',
                stage: 2,
                features: { 'nesting-rules': true, 'cascade-layers': true },
            }),
        ]).process(root, { ...result.opts, map: false });
        result.messages.push(...converted.messages);
    },
};

export default {
    plugins: [
        tailwindcss(),
        ...(process.env.FOLIA_BUILD_TARGET === 'capacitor' ? [androidCompatibility] : []),
        autoprefixer(),
    ],
};
