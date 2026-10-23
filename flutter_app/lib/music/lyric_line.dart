class LyricLine implements Comparable<LyricLine> {
  const LyricLine({required this.start, required this.text});

  final Duration start;
  final String text;

  @override
  int compareTo(LyricLine other) => start.compareTo(other.start);

  @override
  bool operator ==(Object other) =>
      other is LyricLine && other.start == start && other.text == text;

  @override
  int get hashCode => Object.hash(start, text);

  @override
  String toString() => 'LyricLine(${start.inMilliseconds}ms, $text)';
}
