import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:just_audio/just_audio.dart';
import 'package:just_audio_background/just_audio_background.dart';
import '../music/music.dart';

// Owns native audio and queue state; widgets never resolve platform URLs.
class PlaybackController extends ChangeNotifier {
  PlaybackController(this._music, {AudioPlayer? player})
    : audio = player ?? AudioPlayer() {
    _subscriptions.add(
      audio.playerStateStream.listen((state) {
        notifyListeners();
        if (state.processingState == ProcessingState.completed && !loading) {
          if (index + 1 < _queue.length) {
            unawaited(next());
          }
        }
      }),
    );
    _subscriptions.add(
      audio.errorStream.listen((event) {
        error = event.message;
        notifyListeners();
      }),
    );
  }
  OmniMusicService _music;
  final AudioPlayer audio;
  final List<StreamSubscription<dynamic>> _subscriptions = [];
  final List<Track> _queue = [];
  List<Track> get queue => List.unmodifiable(_queue);
  int index = -1;
  Track? get current =>
      index >= 0 && index < _queue.length ? _queue[index] : null;
  List<LyricLine> lyrics = [];
  bool loading = false;
  bool preview = false;
  String? error;
  String? lyricError;
  int _generation = 0;
  bool _disposed = false;

  void changeService(OmniMusicService value) {
    _music = value;
  }

  void add(Track track) {
    _queue.add(track);
    notifyListeners();
  }

  Future<void> playTrack(Track track) async {
    final found = _queue.indexOf(track);
    if (found < 0) {
      _queue.add(track);
      index = _queue.length - 1;
    } else {
      index = found;
    }
    await _load();
  }

  Future<void> playIndex(int value) async {
    if (value < 0 || value >= _queue.length) return;
    index = value;
    await _load();
  }

  Future<void> next() => playIndex(index + 1);
  Future<void> previous() async {
    if (audio.position > const Duration(seconds: 3)) {
      await seek(Duration.zero);
    } else {
      await playIndex(index - 1);
    }
  }

  Future<void> _load() async {
    final track = current;
    if (track == null) return;
    final generation = ++_generation;
    loading = true;
    error = null;
    lyricError = null;
    lyrics = [];
    preview = false;
    notifyListeners();
    try {
      await audio.stop();
      if (_disposed || generation != _generation) return;
      final source = await _music.getPlaybackSource(track);
      if (_disposed || generation != _generation) return;
      preview = source.preview;
      await audio.setAudioSource(
        AudioSource.uri(
          source.url,
          tag: MediaItem(
            id: '${track.providerId}:${track.id}',
            title: track.title,
            artist: track.artistLabel,
            album: track.album,
            artUri: track.coverUrl,
          ),
        ),
      );
      if (_disposed || generation != _generation) return;
      loading = false;
      notifyListeners();
      unawaited(_loadLyrics(track, generation));
      unawaited(
        audio.play().catchError((Object e) {
          if (!_disposed && generation == _generation) {
            error = e.toString();
            notifyListeners();
          }
        }),
      );
    } catch (e) {
      if (!_disposed && generation == _generation) {
        error = e.toString();
        loading = false;
        notifyListeners();
      }
    }
  }

  Future<void> _loadLyrics(Track track, int generation) async {
    try {
      final result = await _music.getLyrics(track);
      if (!_disposed && generation == _generation) {
        lyrics = result;
        notifyListeners();
      }
    } catch (e) {
      if (!_disposed && generation == _generation) {
        lyricError = e.toString();
        notifyListeners();
      }
    }
  }

  Future<void> toggle() async {
    try {
      if (audio.playing) {
        await audio.pause();
      } else {
        if (audio.processingState == ProcessingState.completed) {
          await audio.seek(Duration.zero);
        }
        unawaited(
          audio.play().catchError((Object e) {
            if (!_disposed) {
              error = e.toString();
              notifyListeners();
            }
          }),
        );
      }
    } catch (e) {
      if (!_disposed) {
        error = e.toString();
        notifyListeners();
      }
    }
  }

  Future<void> seek(Duration position) async {
    try {
      await audio.seek(position);
    } catch (e) {
      if (!_disposed) {
        error = e.toString();
        notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    for (final subscription in _subscriptions) {
      unawaited(subscription.cancel());
    }
    unawaited(audio.dispose());
    super.dispose();
  }
}
