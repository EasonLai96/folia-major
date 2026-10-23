import 'dart:io';
import 'package:folia_native/music/music.dart';

// Opt-in live smoke test prints metadata only, never expiring media URLs.
Future<void> main() async {
  final music = OmniMusicService();
  try {
    final result = await music.searchSongs('Never Gonna Give You Up', limit: 3);
    if (result.tracks.isEmpty) {
      throw StateError('Live search returned no tracks');
    }
    stdout.writeln('Search OK: ${result.tracks.length} tracks');
    for (final track in result.tracks) {
      try {
        final source = await music.getPlaybackSource(track);
        final lyrics = await music.getLyrics(track);
        stdout.writeln(
          'Source OK: ${track.title}; preview=${source.preview}; lyricLines=${lyrics.length}',
        );
        return;
      } catch (error) {
        stdout.writeln('Track unavailable: ${track.id}; ${error.runtimeType}');
      }
    }
    throw StateError('No playable source returned for live search results');
  } finally {
    music.close();
  }
}
