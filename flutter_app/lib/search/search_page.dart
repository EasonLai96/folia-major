import 'dart:async';
import 'package:flutter/material.dart';
import '../l10n/app_text.dart';
import '../music/music.dart';
import '../playback/playback_controller.dart';
import '../player/cover_art.dart';
import '../player/player_page.dart';
import '../settings/app_settings.dart';
import '../settings/settings_sheet.dart';

// Native search workspace with explicit loading, failure and pagination states.
class SearchPage extends StatefulWidget {
  const SearchPage({
    super.key,
    required this.music,
    required this.playback,
    required this.settings,
    required this.onServerChanged,
  });
  final OmniMusicService music;
  final PlaybackController playback;
  final AppSettings settings;
  final VoidCallback onServerChanged;
  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  final query = TextEditingController();
  List<Track> tracks = [];
  bool loading = false, searched = false, hasMore = false;
  String? error;
  int generation = 0, offset = 0;
  String submitted = '';
  @override
  void dispose() {
    generation++;
    query.dispose();
    super.dispose();
  }

  Future<void> search({bool more = false}) async {
    final text = more ? submitted : query.text.trim();
    if (text.isEmpty) return;
    final token = ++generation;
    setState(() {
      loading = true;
      error = null;
      searched = true;
      if (!more) {
        tracks = [];
        offset = 0;
        hasMore = false;
        submitted = text;
      }
    });
    try {
      final result = await widget.music.searchSongs(
        text,
        offset: more ? offset : 0,
      );
      if (!mounted || token != generation) return;
      setState(() {
        tracks = more ? [...tracks, ...result.tracks] : result.tracks;
        offset = result.nextOffset;
        hasMore = result.hasMore;
        loading = false;
      });
    } catch (e) {
      if (mounted && token == generation) {
        setState(() {
          error = e.toString();
          loading = false;
        });
      }
    }
  }

  void openPlayer() => Navigator.push<void>(
    context,
    MaterialPageRoute(builder: (_) => PlayerPage(controller: widget.playback)),
  );
  @override
  Widget build(BuildContext context) {
    final t = AppText.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Folia',
          style: TextStyle(fontWeight: FontWeight.w800, letterSpacing: -1),
        ),
        actions: [
          IconButton(
            tooltip: t.queue,
            onPressed: () => showQueue(context, widget.playback),
            icon: const Icon(Icons.queue_music_rounded),
          ),
          IconButton(
            tooltip: t.settings,
            onPressed: () async {
              if (await showSettings(context, widget.settings) == true &&
                  mounted) {
                generation++;
                setState(() {
                  tracks = [];
                  searched = false;
                  hasMore = false;
                  error = null;
                  loading = false;
                });
                widget.onServerChanged();
              }
            },
            icon: const Icon(Icons.tune_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
              child: TextField(
                controller: query,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => search(),
                decoration: InputDecoration(
                  hintText: t.hint,
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: IconButton(
                    tooltip: t.search,
                    onPressed: () => search(),
                    icon: const Icon(Icons.arrow_forward_rounded),
                  ),
                  filled: true,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Text(
                t.phase,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            if (loading) const LinearProgressIndicator(minHeight: 2),
            if (error != null)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Text(
                      error!,
                      style: const TextStyle(color: Colors.orangeAccent),
                    ),
                    TextButton(onPressed: () => search(), child: Text(t.retry)),
                  ],
                ),
              ),
            Expanded(
              child: tracks.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.graphic_eq_rounded,
                            size: 64,
                            color: Colors.white24,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            loading
                                ? t.loading
                                : searched
                                ? t.noResults
                                : t.empty,
                          ),
                        ],
                      ),
                    )
                  : ListView.builder(
                      itemCount: tracks.length + (hasMore ? 1 : 0),
                      itemBuilder: (context, i) {
                        if (i == tracks.length) {
                          return TextButton(
                            onPressed: loading
                                ? null
                                : () => search(more: true),
                            child: const Icon(Icons.expand_more),
                          );
                        }
                        final track = tracks[i];
                        return ListTile(
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 20,
                            vertical: 6,
                          ),
                          leading: CoverArt(url: track.coverUrl?.toString()),
                          title: Text(
                            track.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            '${track.artistLabel} · ${track.album}',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          onTap: () {
                            unawaited(widget.playback.playTrack(track));
                            openPlayer();
                          },
                          trailing: IconButton(
                            tooltip: t.add,
                            icon: const Icon(Icons.add_rounded),
                            onPressed: () {
                              widget.playback.add(track);
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(t.added),
                                  duration: const Duration(seconds: 1),
                                ),
                              );
                            },
                          ),
                        );
                      },
                    ),
            ),
            ListenableBuilder(
              listenable: widget.playback,
              builder: (context, _) {
                final track = widget.playback.current;
                if (track == null) return const SizedBox.shrink();
                return Material(
                  color: const Color(0xff242530),
                  child: ListTile(
                    onTap: openPlayer,
                    leading: CoverArt(
                      url: track.coverUrl?.toString(),
                      size: 46,
                    ),
                    title: Text(
                      track.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: Text(track.artistLabel, maxLines: 1),
                    trailing: widget.playback.loading
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : IconButton(
                            tooltip: widget.playback.audio.playing
                                ? t.pause
                                : t.play,
                            onPressed: widget.playback.toggle,
                            icon: Icon(
                              widget.playback.audio.playing
                                  ? Icons.pause_rounded
                                  : Icons.play_arrow_rounded,
                            ),
                          ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
