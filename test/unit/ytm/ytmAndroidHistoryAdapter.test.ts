import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ytmLibrary } from '@/services/onlineMusic/ytm/ytmLibrary';

// Tests the adapter seam: history stays on the wire until normalized into source-aware songs.
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/services/onlineMusic/ytm/ytmTransport', () => ({ requestYtm: request }));

beforeEach(() => request.mockReset());

describe('Android account history adapter', () => {
    it('normalizes the wire page and passes its opaque continuation unchanged', async () => {
        request.mockResolvedValue({ items: [{ id: 'abcdefghijk', name: 'History song', artists: [{ id: 'UCtest', name: 'Artist' }], album: { id: 'album', name: 'Album', coverUrl: '' }, durationMs: 123000 }], continuation: 'opaque-next' });
        const page = await ytmLibrary.getListeningHistory!('opaque-start');
        expect(request).toHaveBeenCalledWith('account_history', { continuation: 'opaque-start' });
        expect(page.nextCursor).toBe('opaque-next');
        expect(page.items[0]).toMatchObject({ name: 'History song', sourceRef: { kind: 'online', providerId: 'ytm', mediaId: 'abcdefghijk' } });
    });

    it('does not turn a malformed raw page into a successful empty history', async () => {
        request.mockResolvedValue({ contents: [] });
        await expect(ytmLibrary.getListeningHistory!()).rejects.toThrow('Invalid YouTube Music history response');
    });
});
