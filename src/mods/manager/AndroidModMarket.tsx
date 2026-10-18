import React, { useCallback, useEffect, useState } from 'react';
import { Download, FlaskConical, Laptop, Loader2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ModManagerClasses } from './modManagerClasses';
import { translateModError } from './modErrors';
import { useModsStore } from '../useModsStore';

// src/mods/manager/AndroidModMarket.tsx
// Android App 的模组市场：读官方市场的 catalog.json，列出每个模组；只有 client 入口的可以一键下载安装
// （核对 zip 的 SHA-256，再由 androidModHost 校验签名、解压），有 main（Node）入口的标「仅电脑版」、不给装。
// 装好的模组出现在下面的模组列表里，启用仍要用户确认。只在 Android App 的模组管理里显示。

/** 官方市场地址；catalog.json 与下载、预览都相对它。 */
const MARKET_BASE = 'https://folium-compound.cielaniska.top';

type CatalogMod = {
    id: string;
    name: string;
    version: string;
    author: string | null;
    description: string | null;
    origin: 'official' | 'community' | string;
    channel: 'release' | 'beta' | string;
    permissions: string[];
    hasMain: boolean;
    hasClient: boolean;
    depends: string[];
    download: { url: string; size: number; sha256: string };
};

type Installed = Record<string, { version: string; enabled: boolean }>;

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`);

/** 比较 x.y.z 版本；认不出的当作相同。 */
const isNewer = (candidate: string, current: string) => {
    const parse = (value: string) => value.split('.').map(part => Number.parseInt(part, 10));
    const [a, b] = [parse(candidate), parse(current)];
    for (let index = 0; index < 3; index += 1) {
        if (Number.isNaN(a[index]) || Number.isNaN(b[index])) return false;
        if (a[index] !== b[index]) return a[index] > b[index];
    }
    return false;
};

type AndroidModMarketProps = {
    classes: ModManagerClasses;
    onNotice: (notice: { kind: 'ok' | 'error'; text: string }) => void;
};

export const AndroidModMarket: React.FC<AndroidModMarketProps> = ({ classes, onNotice }) => {
    const { t } = useTranslation();
    const mods = useModsStore(state => state.mods);
    const refresh = useModsStore(state => state.refresh);
    const [catalog, setCatalog] = useState<CatalogMod[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [installed, setInstalled] = useState<Installed>({});

    const readInstalled = useCallback(async () => {
        const host = await import('../android/androidModHost');
        setInstalled(host.readInstalledAndroidMods());
    }, []);

    const loadCatalog = useCallback(async () => {
        setLoadError(null);
        setCatalog(null);
        try {
            // catalog.json 带 CORS 头，页面直接读即可。
            const response = await fetch(`${MARKET_BASE}/catalog.json`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const body = await response.json() as { format?: string; mods?: CatalogMod[] };
            if (body.format !== 'folium-market-catalog' || !Array.isArray(body.mods)) throw new Error('unexpected catalog format');
            setCatalog(body.mods);
            console.info('[AndroidMods] Market catalog loaded', { count: body.mods.length });
        } catch (error) {
            console.warn('[AndroidMods] Market catalog failed', error);
            setLoadError(error instanceof Error ? error.message : String(error));
        }
    }, []);

    useEffect(() => {
        void loadCatalog();
    }, [loadCatalog]);

    // 模组列表变了（装、删、启用）就重读已装状态。
    useEffect(() => {
        void readInstalled();
    }, [mods, readInstalled]);

    const install = async (mod: CatalogMod) => {
        setBusyId(mod.id);
        try {
            const host = await import('../android/androidModHost');
            const bytes = await host.downloadBytes(new URL(mod.download.url, MARKET_BASE).toString());
            const hash = await host.sha256Hex(bytes);
            if (hash !== mod.download.sha256) {
                console.warn('[AndroidMods] Download hash mismatch', { id: mod.id, expected: mod.download.sha256, actual: hash });
                onNotice({ kind: 'error', text: t('mods.android.hashMismatch') });
                return;
            }
            const result = await host.installAndroidModFromBytes(bytes);
            if (!result.ok) {
                onNotice({ kind: 'error', text: translateModError(t, result.error, 'install-failed') });
                return;
            }
            await refresh();
            onNotice({ kind: 'ok', text: t('mods.android.installed', { name: mod.name }) });
        } catch (error) {
            console.warn('[AndroidMods] Market install failed', error);
            onNotice({ kind: 'error', text: t('mods.android.downloadFailed', { value: error instanceof Error ? error.message : String(error) }) });
        } finally {
            setBusyId(null);
            void readInstalled();
        }
    };

    const uninstall = async (mod: CatalogMod) => {
        if (!window.confirm(t('mods.android.uninstallConfirm', { name: mod.name }))) return;
        setBusyId(mod.id);
        try {
            const host = await import('../android/androidModHost');
            await host.uninstallAndroidMod(mod.id);
            await refresh();
            onNotice({ kind: 'ok', text: t('mods.android.uninstalled', { name: mod.name }) });
        } finally {
            setBusyId(null);
            void readInstalled();
        }
    };

    const phoneMods = catalog?.filter(mod => !mod.hasMain) ?? [];
    const desktopMods = catalog?.filter(mod => mod.hasMain) ?? [];

    const renderRow = (mod: CatalogMod) => {
        const current = installed[mod.id];
        const desktopOnly = mod.hasMain || !mod.hasClient;
        const updatable = Boolean(current && isNewer(mod.version, current.version));
        const busy = busyId === mod.id;
        return (
            <div key={mod.id} data-mod-market-id={mod.id} className={`px-4 py-3 border-b last:border-b-0 ${classes.divider}`}>
                <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            <span className="truncate">{mod.name}</span>
                            {mod.channel === 'beta'
                                ? <FlaskConical size={13} className="shrink-0 opacity-70" aria-label={t('mods.signatureBeta')} />
                                : <ShieldCheck size={13} className="shrink-0 opacity-70" aria-label={t('mods.signatureVerified')} />}
                        </div>
                        <div className={`mt-0.5 text-[11px] ${classes.muted}`}>
                            v{mod.version}{mod.author ? ` · ${mod.author}` : ''} · {formatSize(mod.download.size)}
                            {' · '}{mod.origin === 'official' ? t('mods.android.official') : t('mods.android.community')}
                            {mod.channel === 'beta' ? ` · ${t('mods.signatureBeta')}` : ''}
                        </div>
                        {mod.description ? (
                            <div className="mt-1 text-xs line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{mod.description}</div>
                        ) : null}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                        {desktopOnly ? (
                            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${classes.warning}`}>
                                <Laptop size={12} />
                                {t('mods.android.desktopOnly')}
                            </span>
                        ) : current && !updatable ? (
                            <>
                                <span className={`rounded-md border px-2 py-1 text-[11px] ${classes.success}`}>
                                    {current.enabled ? t('mods.android.installedEnabled') : t('mods.android.installedDisabled')}
                                </span>
                                <button type="button" disabled={busy} onClick={() => { void uninstall(mod); }}
                                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${classes.ghostButton}`}
                                    style={{ color: 'var(--text-secondary)' }}>
                                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                    {t('mods.android.uninstall')}
                                </button>
                            </>
                        ) : (
                            <button type="button" disabled={busy || busyId !== null} onClick={() => { void install(mod); }}
                                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs ${classes.ghostButton}`}
                                style={{ color: 'var(--text-primary)' }}>
                                {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                                {busy ? t('mods.installing') : updatable ? t('mods.android.update') : t('mods.android.install')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={`rounded-xl border overflow-hidden ${classes.card}`} data-android-mod-market="">
            <div className={`flex items-center justify-between gap-2 px-4 py-3 border-b ${classes.divider}`}>
                <div className="min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('mods.market')}</div>
                    <div className={`text-[11px] ${classes.muted}`}>{t('mods.android.marketHint')}</div>
                </div>
                <button type="button" onClick={() => { void loadCatalog(); }} aria-label={t('mods.reload')}
                    className={`shrink-0 rounded-md border p-1.5 ${classes.ghostButton}`} style={{ color: 'var(--text-secondary)' }}>
                    <RefreshCw size={14} />
                </button>
            </div>
            {loadError ? (
                <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t('mods.android.catalogFailed', { value: loadError })}
                </div>
            ) : catalog === null ? (
                <div className="px-4 py-6 flex justify-center" style={{ color: 'var(--text-secondary)' }}>
                    <Loader2 size={18} className="animate-spin opacity-60" />
                </div>
            ) : (
                <>
                    {phoneMods.map(renderRow)}
                    {desktopMods.length > 0 ? (
                        <div className={`px-4 pt-3 pb-1 text-[11px] font-medium border-b ${classes.divider} ${classes.muted}`}>
                            {t('mods.android.desktopOnlySection', { count: desktopMods.length })}
                        </div>
                    ) : null}
                    {desktopMods.map(renderRow)}
                </>
            )}
        </div>
    );
};

export default AndroidModMarket;
