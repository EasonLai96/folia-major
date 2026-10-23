import 'lyric_line.dart';
import 'playback_source.dart';
import 'track.dart';

class MusicSearchPage {
  MusicSearchPage({
    required List<Track> tracks,
    required this.total,
    required this.hasMore,
    required this.nextOffset,
  }) : tracks = List<Track>.unmodifiable(tracks);

  final List<Track> tracks;
  final int total;
  final bool hasMore;
  final int nextOffset;
}

abstract class MusicProvider {
  String get id;

  Future<MusicSearchPage> search(
    String query, {
    int limit = 30,
    int offset = 0,
  });

  Future<PlaybackSource> getPlaybackSource(Track track);

  Future<List<LyricLine>> getLyrics(Track track);

  void close();
}
