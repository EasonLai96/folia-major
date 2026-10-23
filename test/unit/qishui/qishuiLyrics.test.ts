import { describe, expect, it } from 'vitest';
import { parseQishuiLyrics } from '../../../src/services/onlineMusic/qishui/qishuiLyrics';

// Car lyrics arrive as LRC or KRC; translations are matched to the main line's start time.
describe('qishui lyrics', () => {
    it('parses main lyrics and joins a translation by line time', () => {
        const result = parseQishuiLyrics({
            lyric_entity: { type: 'lrc', content: '[00:01.00]Hello\u0000\n[00:03.00]World' },
            lang_translations: {
                'zh-CN': { type: 'lrc', content: '[00:01.00]你好\n[00:03.00]世界' },
            },
        });
        expect(result.lyrics?.lines.map(line => line.fullText)).toEqual(['Hello', 'World']);
        expect(result.lyrics?.lines.map(line => line.translation)).toEqual(['你好', '世界']);
        expect(result.mainText).toContain('Hello');
        expect(result.translationText).toContain('你好');
        expect(result.wordByWordText).toBeNull();
        expect(result.isPureMusic).toBe(false);
    });

    it('answers an empty lyric body without pretending the track is instrumental', () => {
        expect(parseQishuiLyrics({ lyric_entity: { type: 'krc', content: ' \u0000 ' } }))
            .toEqual({ lyrics: null, mainText: '', isPureMusic: false });
    });
});
