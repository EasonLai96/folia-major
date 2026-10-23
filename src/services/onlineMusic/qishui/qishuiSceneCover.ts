// src/services/onlineMusic/qishui/qishuiSceneCover.ts
// Scene cards get deterministic vector artwork. The native bridge is the only network path, so no icon is fetched here.

const covers = new Map<string, Promise<string>>();
const PALETTES: Array<[number, number]> = [
    [222, 270], [166, 215], [304, 248], [24, 346], [190, 239], [258, 323], [145, 194], [345, 26],
];

export function createQishuiSceneCover(id: string, _iconUrl: string): Promise<string> {
    const kept = covers.get(id);
    if (kept) return kept;
    const seed = [...id].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
    const [a, b] = PALETTES[seed % PALETTES.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
<defs>
<linearGradient id="base" x2="1" y2="1"><stop stop-color="hsl(${a},35%,12%)"/><stop offset="1" stop-color="hsl(${b},29%,7%)"/></linearGradient>
<radialGradient id="light"><stop stop-color="hsl(${a},65%,49%)" stop-opacity=".54"/><stop offset="1" stop-color="hsl(${a},60%,30%)" stop-opacity="0"/></radialGradient>
<radialGradient id="warm"><stop stop-color="hsl(${b},60%,44%)" stop-opacity=".38"/><stop offset="1" stop-color="hsl(${b},60%,25%)" stop-opacity="0"/></radialGradient>
<linearGradient id="disc" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".065"/><stop offset="1" stop-color="#fff" stop-opacity=".012"/></linearGradient>
</defs>
<path fill="url(#base)" d="M0 0H640V640H0Z"/>
<ellipse fill="url(#light)" cx="105" cy="130" rx="500" ry="420"/>
<ellipse fill="url(#warm)" cx="590" cy="570" rx="450" ry="460"/>
<g fill="none" stroke="#fff" stroke-opacity=".055">
<path d="M-90 520C120 ${220 + seed % 120} 430 140 740 280"/>
<path d="M-90 550C120 ${250 + seed % 120} 430 170 740 310"/>
<path d="M-90 580C120 ${280 + seed % 120} 430 200 740 340"/>
</g>
<circle cx="320" cy="320" r="110" fill="url(#disc)" stroke="#fff" stroke-opacity=".09"/>
<circle cx="320" cy="320" r="134" fill="none" stroke="#fff" stroke-opacity=".035"/>
</svg>`;
    const task = Promise.resolve(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    covers.set(id, task);
    while (covers.size > 64) covers.delete(covers.keys().next().value!);
    return task;
}
