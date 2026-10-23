import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:folia_native/music/music.dart';

// Provider contract tests use synthetic responses, not live platform accounts.
void main() {
  test('LRC parses multiple tags, fractions, sorting and global offset', () {
    final lines = LrcParser.parse(
      '[offset:-100]\n[00:02.12][00:03.123]Hello\n[00:01.5]First\n[ar:Artist]\ninvalid',
    );
    expect(lines.map((x) => x.start.inMilliseconds), [1400, 2020, 3023]);
    expect(lines.map((x) => x.text), ['First', 'Hello', 'Hello']);
  });
  test('LRC rejects invalid seconds and empty lines', () {
    expect(LrcParser.parse('[00:99]bad\n[00:01]\nmetadata'), isEmpty);
  });
  test('search maps tracks and pagination', () async {
    final client = MockClient((request) async {
      expect(request.url.path, '/cloudsearch');
      expect(request.url.queryParameters['keywords'], 'hello');
      return http.Response(
        jsonEncode({
          'code': 200,
          'result': {
            'songCount': 2,
            'songs': [
              {
                'id': 1,
                'name': 'Hello',
                'dt': 123000,
                'ar': [
                  {'name': 'Singer'},
                ],
                'al': {'name': 'Album', 'picUrl': 'https://example.com/a.png'},
              },
            ],
          },
        }),
        200,
      );
    });
    final music = OmniMusicService(
      baseUrl: Uri.parse('https://example.com'),
      client: client,
    );
    final page = await music.searchSongs('hello', limit: 1);
    expect(page.tracks.single.title, 'Hello');
    expect(page.tracks.single.artistLabel, 'Singer');
    expect(page.tracks.single.duration.inSeconds, 123);
    expect(page.hasMore, isTrue);
    expect(page.nextOffset, 1);
    music.close();
    client.close();
  });
  test('playback reports preview and refuses absent URL', () async {
    final track = Track(providerId: 'netease', id: '1', title: 'Song');
    final client = MockClient(
      (request) async => http.Response(
        jsonEncode({
          'code': 200,
          'data': [
            {
              'code': 200,
              'url': 'https://example.com/a.mp3',
              'freeTrialInfo': {'start': 0, 'end': 30},
            },
          ],
        }),
        200,
      ),
    );
    final music = OmniMusicService(client: client);
    expect((await music.getPlaybackSource(track)).preview, isTrue);
    client.close();
    music.close();
    final refused = MockClient(
      (request) async =>
          http.Response('{"code":200,"data":[{"code":404,"url":null}]}', 200),
    );
    final other = OmniMusicService(client: refused);
    await expectLater(
      other.getPlaybackSource(track),
      throwsA(isA<MusicProviderException>()),
    );
    other.close();
    refused.close();
  });
  test('malformed JSON and HTTP failures remain explicit', () async {
    for (final response in [
      http.Response('<html>error</html>', 200),
      http.Response('{}', 503),
    ]) {
      final client = MockClient((_) async => response);
      final music = OmniMusicService(client: client);
      await expectLater(
        music.searchSongs('hello'),
        throwsA(isA<MusicProviderException>()),
      );
      music.close();
      client.close();
    }
  });
}
