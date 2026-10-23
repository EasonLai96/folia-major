import 'package:http/http.dart' as http;

import 'lyric_line.dart';
import 'music_provider.dart';
import 'netease_provider.dart';
import 'playback_source.dart';
import 'track.dart';

class OmniMusicService {
  OmniMusicService({
    Uri? baseUrl,
    http.Client? client,
    Duration requestTimeout = const Duration(seconds: 12),
  }) : _provider = NeteaseProvider(
         baseUrl: baseUrl,
         client: client,
         requestTimeout: requestTimeout,
       );

  OmniMusicService.withProvider(MusicProvider provider) : _provider = provider;

  final MusicProvider _provider;

  String get providerId => _provider.id;

  Future<MusicSearchPage> searchSongs(
    String query, {
    int limit = 30,
    int offset = 0,
  }) => _provider.search(query, limit: limit, offset: offset);

  Future<PlaybackSource> getPlaybackSource(Track track) =>
      _provider.getPlaybackSource(track);

  Future<List<LyricLine>> getLyrics(Track track) => _provider.getLyrics(track);

  void close() => _provider.close();
}
