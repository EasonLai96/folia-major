import 'dart:async';
import 'package:flutter/material.dart';
import '../l10n/app_text.dart';
import '../playback/playback_controller.dart';
import 'cover_art.dart';

// Native player, synchronized line lyrics, seeking and queue navigation.
class PlayerPage extends StatelessWidget {
  const PlayerPage({super.key, required this.controller});
  final PlaybackController controller;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) {
      final t = AppText.of(context);
      final track = controller.current;
      if (track == null) {
        return Scaffold(
          appBar: AppBar(),
          body: Center(child: Text(t.queueEmpty)),
        );
      }
      return Scaffold(
        appBar: AppBar(
          title: Text(t.native),
          actions: [
            IconButton(
              tooltip: t.queue,
              icon: const Icon(Icons.queue_music_rounded),
              onPressed: () => showQueue(context, controller),
            ),
          ],
        ),
        body: SafeArea(
          child: StreamBuilder<Duration>(
            stream: controller.audio.positionStream,
            initialData: controller.audio.position,
            builder: (context, snapshot) {
              final position = snapshot.data ?? Duration.zero;
              final duration = controller.audio.duration ?? track.duration;
              final max = duration.inMilliseconds.toDouble();
              int active = -1;
              for (int i = 0; i < controller.lyrics.length; i++) {
                if (controller.lyrics[i].start <= position) {
                  active = i;
                } else {
                  break;
                }
              }
              return LayoutBuilder(
                builder: (context, constraints) => SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 28,
                    vertical: 16,
                  ),
                  child: Column(
                    children: [
                      CoverArt(
                        url: track.coverUrl?.toString(),
                        size:
                            constraints.maxWidth.clamp(160, 300).toDouble() *
                            .7,
                      ),
                      const SizedBox(height: 24),
                      Text(
                        track.title,
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      Text(
                        track.artistLabel,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(color: Colors.white54),
                      ),
                      const SizedBox(height: 10),
                      if (controller.preview) Chip(label: Text(t.preview)),
                      if (controller.error != null)
                        Text(
                          controller.error!,
                          style: const TextStyle(color: Colors.orangeAccent),
                        ),
                      Slider(
                        value: max > 0
                            ? position.inMilliseconds.toDouble().clamp(0, max)
                            : 0,
                        max: max > 0 ? max : 1,
                        onChanged: controller.loading
                            ? null
                            : (v) => unawaited(
                                controller.seek(
                                  Duration(milliseconds: v.round()),
                                ),
                              ),
                      ),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(formatTime(position)),
                          Text(formatTime(duration)),
                        ],
                      ),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          IconButton(
                            tooltip: t.previous,
                            iconSize: 36,
                            onPressed: controller.loading
                                ? null
                                : controller.previous,
                            icon: const Icon(Icons.skip_previous_rounded),
                          ),
                          const SizedBox(width: 20),
                          controller.loading
                              ? const Padding(
                                  padding: EdgeInsets.all(18),
                                  child: CircularProgressIndicator(),
                                )
                              : IconButton.filled(
                                  tooltip: controller.audio.playing
                                      ? t.pause
                                      : t.play,
                                  iconSize: 48,
                                  onPressed: controller.toggle,
                                  icon: Icon(
                                    controller.audio.playing
                                        ? Icons.pause_rounded
                                        : Icons.play_arrow_rounded,
                                  ),
                                ),
                          const SizedBox(width: 20),
                          IconButton(
                            tooltip: t.next,
                            iconSize: 36,
                            onPressed:
                                controller.loading ||
                                    controller.index + 1 >=
                                        controller.queue.length
                                ? null
                                : controller.next,
                            icon: const Icon(Icons.skip_next_rounded),
                          ),
                        ],
                      ),
                      const SizedBox(height: 28),
                      Semantics(
                        label: t.lyrics,
                        liveRegion: true,
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 250),
                          child: Column(
                            key: ValueKey(active),
                            children: [
                              if (controller.lyrics.isEmpty)
                                Text(
                                  controller.lyricError ?? t.noLyrics,
                                  textAlign: TextAlign.center,
                                ),
                              if (controller.lyrics.isNotEmpty)
                                for (
                                  int i = (active - 1).clamp(
                                    0,
                                    controller.lyrics.length - 1,
                                  );
                                  i <=
                                      (active + 2).clamp(
                                        0,
                                        controller.lyrics.length - 1,
                                      );
                                  i++
                                )
                                  Padding(
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 10,
                                    ),
                                    child: InkWell(
                                      onTap: () => controller.seek(
                                        controller.lyrics[i].start,
                                      ),
                                      child: Text(
                                        controller.lyrics[i].text,
                                        textAlign: TextAlign.center,
                                        style: TextStyle(
                                          fontSize: i == active ? 25 : 18,
                                          fontWeight: i == active
                                              ? FontWeight.w700
                                              : FontWeight.w400,
                                          color: i == active
                                              ? Colors.white
                                              : Colors.white38,
                                        ),
                                      ),
                                    ),
                                  ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      );
    },
  );
}

String formatTime(Duration value) =>
    '${value.inMinutes}:${(value.inSeconds % 60).toString().padLeft(2, '0')}';

void showQueue(BuildContext context, PlaybackController controller) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (context) => SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * .65,
        child: ListenableBuilder(
          listenable: controller,
          builder: (context, _) => Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(20),
                child: Text(
                  AppText.of(context).queue,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              Expanded(
                child: controller.queue.isEmpty
                    ? Center(child: Text(AppText.of(context).queueEmpty))
                    : ListView.builder(
                        itemCount: controller.queue.length,
                        itemBuilder: (context, i) {
                          final track = controller.queue[i];
                          return ListTile(
                            selected: i == controller.index,
                            leading: CoverArt(
                              url: track.coverUrl?.toString(),
                              size: 44,
                            ),
                            title: Text(
                              track.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: Text(track.artistLabel),
                            onTap: () {
                              unawaited(controller.playIndex(i));
                              Navigator.pop(context);
                            },
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
