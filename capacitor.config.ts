import type { CapacitorConfig } from '@capacitor/cli';

// capacitor.config.ts
// Folia Android App（Capacitor）的外壳配置：内置 dist/，https://localhost 安全上下文，深色启动屏。

const config: CapacitorConfig = {
    appId: 'top.izuna.foliamajor',
    appName: 'Folia',
    webDir: 'dist',
    backgroundColor: '#09090b',
    server: {
        androidScheme: 'https',
        hostname: 'localhost',
    },
    android: {
        // 允许用户填 http:// 的局域网服务器（NAS）；https 页面里的 http 请求不会被拦。
        allowMixedContent: true,
    },
    plugins: {
        SplashScreen: {
            launchAutoHide: true,
            launchShowDuration: 900,
            backgroundColor: '#09090b',
            showSpinner: false,
        },
        StatusBar: {
            overlaysWebView: false,
            style: 'DARK',
            backgroundColor: '#09090b',
        },
    },
};

export default config;
