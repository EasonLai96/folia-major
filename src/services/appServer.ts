import { CapacitorHttp } from '@capacitor/core';
import { isCapacitorAndroid } from '../platform/runtime';

// src/services/appServer.ts
// Android App 的“Folia 服务器”：App 内置的页面不在任何部署的同源下，同源的 /api 和各平台后端路由
// 都不存在。用户在设置里填一个 Folia Web 部署（Docker 网关）的地址后，这些路由都从它派生：
//   <base>/api/*，以及各平台后端 <base>/<平台 id>
// 构建时的 VITE_* 变量仍然优先；浏览器和桌面版不读这里的值，行为不变。

/** 存储键，已发布后不改名。 */
export const APP_SERVER_BASE_KEY = 'folia_app_server_base';

const normalizeBase = (value: string): string => value.trim().replace(/\/+$/, '');

/** 构建时写死的默认地址（可选，VITE_APP_SERVER_BASE），用户没填时用它。 */
const buildTimeBase = (): string => normalizeBase(String(import.meta.env?.VITE_APP_SERVER_BASE || ''));

/** 只读用户自己填的值（设置页的输入框用），不含构建默认值。 */
export const getStoredAppServerBase = (): string => {
    try {
        return normalizeBase(localStorage.getItem(APP_SERVER_BASE_KEY) || '');
    } catch {
        return '';
    }
};

/** 生效的服务器地址，没有时为空串。只在 Android App 里有值。 */
export const getAppServerBase = (): string => {
    if (!isCapacitorAndroid()) return '';
    return getStoredAppServerBase() || buildTimeBase();
};

export const setAppServerBase = (value: string): void => {
    const normalized = normalizeBase(value);
    if (normalized) localStorage.setItem(APP_SERVER_BASE_KEY, normalized);
    else localStorage.removeItem(APP_SERVER_BASE_KEY);
    console.info('[AppServer] Server address', normalized ? 'saved' : 'cleared');
};

/**
 * 一个平台后端在用户自己填的服务器上的地址（路径由各平台目录给出）；用户没填时返回空串，
 * 平台再退回构建时的默认地址（VITE_*_API_BASE）。用户填的优先，所以它排在构建值前面。
 */
export const appServerRoute = (route: string): string => {
    if (!isCapacitorAndroid()) return '';
    const base = getStoredAppServerBase();
    return base ? `${base}${route}` : '';
};

/** 把同源的 /api/... 路径改写成 App 能访问的地址；其他情况原样返回。 */
export const resolveAppApiPath = (path: string): string => {
    const base = getAppServerBase();
    return base ? `${base}${path}` : path;
};

/**
 * 发往 Folia 服务器 /api 的 JSON 请求。Android App 的页面源是 https://localhost，而网关和 AI 路由
 * 不带 CORS 头，WebView 的 fetch 会被拦；这里改走原生 HTTP（CapacitorHttp），不受 CORS 限制。
 * 其他环境就是普通 fetch。
 */
export const appServerFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    if (!isCapacitorAndroid() || !/^https?:/i.test(url)) return fetch(url, init);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => { headers[key] = value; });
    let data: unknown = undefined;
    if (typeof init.body === 'string') {
        try { data = JSON.parse(init.body); } catch { data = init.body; }
    }
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const request = CapacitorHttp.request({
        url,
        method: init.method || 'GET',
        headers,
        data,
        connectTimeout: 15000,
        readTimeout: 120000,
    });
    // 原生请求取消不了；signal 中止时先放弃等待，让调用方的时限照常生效。
    const answer = init.signal
        ? await Promise.race([request, new Promise<never>((_, reject) => {
            init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        })])
        : await request;
    const body = typeof answer.data === 'string' ? answer.data : JSON.stringify(answer.data ?? null);
    // 原样带回响应头（429 的 Retry-After 要读），只保证 Content-Type 存在。
    const responseHeaders = new Headers();
    Object.entries(answer.headers ?? {}).forEach(([key, value]) => {
        try { responseHeaders.set(key, String(value)); } catch { /* 非法头名跳过 */ }
    });
    if (!responseHeaders.has('Content-Type')) responseHeaders.set('Content-Type', 'application/json');
    const nullBodyStatus = answer.status === 204 || answer.status === 205 || answer.status === 304;
    return new Response(nullBodyStatus ? null : body, { status: answer.status, headers: responseHeaders });
};

/** 测一下服务器能不能连上：读网关的 /healthz。 */
export const testAppServer = async (value: string): Promise<boolean> => {
    const base = normalizeBase(value);
    if (!base) return false;
    try {
        const response = await appServerFetch(`${base}/healthz`, { cache: 'no-store' });
        console.info('[AppServer] Health check answered', response.status);
        return response.ok;
    } catch (error) {
        console.warn('[AppServer] Health check failed', error);
        return false;
    }
};
