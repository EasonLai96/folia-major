import { describe, expect, it } from 'vitest';
import {
    normalizeQishuiCollection,
    normalizeQishuiSong,
    normalizeQishuiUser,
    qishuiImage,
} from '../../../src/services/onlineMusic/qishui/qishuiNormalize';

// The car bridge keeps 64-bit media IDs as strings; normalization must not round them.
describe('qishui normalization', () => {
    it('keeps a large media id and maps artists and album', () => {
        const song = normalizeQishuiSong({
            base_info: {
                id: '9007199254740993',
                name: 'Track',
                duration_ms: 183000,
            },
            related_info: {
                artist_links: [{ id: '42', name: 'Artist' }],
                album_link: { id: '7', name: 'Album' },
            },
            display_info: { cover_url: { urls: ['https://p3.douyinpic.com/a.jpg'] } },
        });
        expect(song.id).toBe('9007199254740993');
        expect(song.name).toBe('Track');
        expect(song.durationMs).toBe(183000);
        expect(song.artists[0]).toMatchObject({
            id: '42',
            name: 'Artist',
            catalogRef: { providerId: 'qishui', kind: 'artist', id: '42' },
        });
        expect(song.album).toMatchObject({ id: '7', name: 'Album', coverUrl: 'https://p3.douyinpic.com/a.jpg' });
        expect(song.sourceRef).toEqual({ kind: 'online', providerId: 'qishui', mediaId: '9007199254740993' });
    });

    it('rejects a track without an identity', () => {
        expect(() => normalizeQishuiSong({ base_info: { name: 'No id' } }))
            .toThrowError(/Qishui track ID is missing/);
    });

    it('maps an owned playlist and its owner id for later page reads', () => {
        const collection = normalizeQishuiCollection({
            base_info: {
                id: '555',
                title: 'Mine',
                owner_id: '9',
                type: 1,
                desc: 'Description',
            },
            display_info: { url_cover: 'https://p3.douyinpic.com/cover.jpg' },
            resource_cnt: { track_cnt: 12 },
            isOwned: true,
        });
        expect(collection).toMatchObject({
            providerId: 'qishui',
            id: '555',
            type: 'playlist',
            name: 'Mine',
            isOwned: true,
            isLiked: true,
            trackCount: 12,
            providerData: { ownerId: '9' },
        });
    });

    it('builds an image address from the car template only when it is https', () => {
        expect(qishuiImage({ urls: ['https://p3.douyinpic.com/'], uri: 'x', template_prefix: '240' }))
            .toBe('https://p3.douyinpic.com/x~240-image.image');
        expect(qishuiImage({ urls: ['http://example.com/a.jpg'] })).toBe('');
        expect(qishuiImage('https://p3.douyinpic.com/a.jpg')).toBe('https://p3.douyinpic.com/a.jpg');
    });

    it('maps the account shape without exposing native session fields', () => {
        expect(normalizeQishuiUser({ id: '1', nickname: 'Listener', avatar: 'https://p3.douyinpic.com/a.jpg', isVip: true }))
            .toEqual({ id: '1', nickname: 'Listener', avatarUrl: 'https://p3.douyinpic.com/a.jpg', vipType: 1 });
    });
});
