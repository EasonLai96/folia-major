import { CapacitorHttp } from '@capacitor/core';

// src/services/onlineMusic/ytm/android/ytmNativeFetch.ts
// Android App 里给 youtubei.js 和 BotGuard 用的 fetch：YouTube 的接口不给 https://localhost 回 CORS 头，
// WebView 的 fetch 一律被拦，所以请求改走原生 HTTP（CapacitorHttp），答案再包回一个 Response。

/** 调用方写了 accept-encoding，原生连接就把压缩过的字节原样交回；这几个头交给原生端自己定。 */
const DROPPED_HEADERS = new Set(['accept-encoding', 'content-length', 'host', 'connection', 'origin', 'referer']);
const REQUEST_LIMIT_MS = 20000;
// 页面里的 youtubei.js 不写 User-Agent（浏览器自己会写）；原生连接替它写一个桌面浏览器的。Origin 不写：
// 原生连接本来就不带，写成 https://localhost 的话 YouTube 一律回 403（2026-10-19 实测）。
const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const urlOf = (input: RequestInfo | URL): string => (
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
);

/** 读出请求体：youtubei.js 和 BotGuard 只发字符串（JSON 或 JSON+protobuf）。 */
const bodyOf = async (input: RequestInfo | URL, init?: RequestInit): Promise<string | undefined> => {
    if (typeof init?.body === 'string') return init.body;
    if (init?.body instanceof URLSearchParams) return init.body.toString();
    if (init?.body) return await new Response(init.body).text();
    if (input instanceof Request && input.body) return await input.clone().text();
    return undefined;
};

/** 和 fetch 一样的签名，走原生 HTTP。 */
export const ytmNativeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers: Record<string, string> = {};
    const collect = (source: HeadersInit | undefined) => {
        if (!source) return;
        new Headers(source).forEach((value, key) => {
            if (!DROPPED_HEADERS.has(key.toLowerCase())) headers[key] = value;
        });
    };
    if (input instanceof Request) collect(input.headers);
    collect(init?.headers);
    const named = (name: string) => Object.keys(headers).some(key => key.toLowerCase() === name);
    if (!named('user-agent')) headers['User-Agent'] = DESKTOP_AGENT;
    const body = method === 'GET' || method === 'HEAD' ? undefined : await bodyOf(input, init);
    // 原生端只在有 Content-Type 时写请求体。
    if (body !== undefined && !named('content-type')) {
        headers['Content-Type'] = 'text/plain;charset=UTF-8';
    }
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const request = CapacitorHttp.request({
        url, method, headers, data: body, connectTimeout: REQUEST_LIMIT_MS, readTimeout: REQUEST_LIMIT_MS * 2,
        responseType: 'text', shouldEncodeUrlParams: false,
    });
    // 原生请求停不下来；signal 中止时只是不再等它。
    const answer = init?.signal
        ? await Promise.race([request, new Promise<never>((_, reject) => {
            init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        })])
        : await request;
    const text = typeof answer.data === 'string' ? answer.data : JSON.stringify(answer.data ?? null);
    const responseHeaders = new Headers();
    Object.entries(answer.headers ?? {}).forEach(([key, value]) => {
        // 原生端已经解压，留着 content-encoding / content-length 会让 Response 误读正文。
        if (/^content-(encoding|length)$/i.test(key)) return;
        try { responseHeaders.set(key, String(value)); } catch { /* 非法头名跳过 */ }
    });
    const nullBody = answer.status === 204 || answer.status === 205 || answer.status === 304;
    const response = new Response(nullBody ? null : text, { status: answer.status, headers: responseHeaders });
    // youtubei.js 在错误里写 response.url；构造出来的 Response 没有它。
    Object.defineProperty(response, 'url', { value: answer.url || url });
    return response;
};
