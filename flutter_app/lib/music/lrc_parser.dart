import 'dart:convert';

import 'lyric_line.dart';

class LrcParser {
  LrcParser._();

  static final RegExp _tagPattern = RegExp(r'\[([^\]]+)\]');
  static final RegExp _timestampPattern = RegExp(
    r'^(\d{1,4}):([0-5]?\d)(?:[.:](\d{1,3}))?$',
  );
  static final RegExp _offsetPattern = RegExp(
    r'^\[offset\s*:\s*([+-]?\d+)\s*\]$',
    caseSensitive: false,
  );

  static List<LyricLine> parse(String source) {
    if (source.isEmpty) {
      return const <LyricLine>[];
    }

    final text = source.replaceFirst('\uFEFF', '');
    final lines = const LineSplitter().convert(text);
    final offsetMs = _readOffset(lines);
    final entries = <_TimedEntry>[];
    var order = 0;

    for (final rawLine in lines) {
      final line = rawLine.trimRight();
      var cursor = 0;
      final starts = <int>[];

      while (true) {
        final tag = _tagPattern.matchAsPrefix(line, cursor);
        if (tag == null) {
          break;
        }
        final timestamp = _timestampPattern.firstMatch(tag.group(1)!.trim());
        if (timestamp != null) {
          final milliseconds = _timestampToMilliseconds(timestamp);
          if (milliseconds != null) {
            starts.add(milliseconds);
          }
        }
        cursor = tag.end;
      }

      if (starts.isEmpty) {
        continue;
      }

      final lyric = line.substring(cursor).trim();
      if (lyric.isEmpty) {
        continue;
      }

      for (final start in starts) {
        final adjusted = start + offsetMs;
        entries.add(_TimedEntry(adjusted < 0 ? 0 : adjusted, order++, lyric));
      }
    }

    entries.sort((a, b) {
      final byTime = a.startMs.compareTo(b.startMs);
      return byTime != 0 ? byTime : a.order.compareTo(b.order);
    });

    return List<LyricLine>.unmodifiable(
      entries.map(
        (entry) => LyricLine(
          start: Duration(milliseconds: entry.startMs),
          text: entry.text,
        ),
      ),
    );
  }

  static int _readOffset(List<String> lines) {
    for (final line in lines) {
      final match = _offsetPattern.firstMatch(line.trim());
      if (match != null) {
        return int.tryParse(match.group(1)!) ?? 0;
      }
    }
    return 0;
  }

  static int? _timestampToMilliseconds(RegExpMatch match) {
    final minutes = int.tryParse(match.group(1)!);
    final seconds = int.tryParse(match.group(2)!);
    if (minutes == null || seconds == null || seconds > 59) {
      return null;
    }

    var milliseconds = seconds * 1000;
    final fraction = match.group(3);
    if (fraction != null) {
      final value = int.tryParse(fraction);
      if (value == null) {
        return null;
      }
      if (fraction.length == 1) {
        milliseconds += value * 100;
      } else if (fraction.length == 2) {
        milliseconds += value * 10;
      } else {
        milliseconds += value;
      }
    }

    return minutes * 60000 + milliseconds;
  }
}

class _TimedEntry {
  const _TimedEntry(this.startMs, this.order, this.text);

  final int startMs;
  final int order;
  final String text;
}
