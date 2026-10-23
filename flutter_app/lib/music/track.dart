class Track {
  Track({
    required this.providerId,
    required this.id,
    required this.title,
    List<String> artists = const <String>[],
    this.album = 'Unknown Album',
    this.duration = Duration.zero,
    this.coverUrl,
  }) : artists = List<String>.unmodifiable(artists) {
    if (providerId.trim().isEmpty) {
      throw ArgumentError.value(providerId, 'providerId', 'must not be empty');
    }
    if (id.trim().isEmpty) {
      throw ArgumentError.value(id, 'id', 'must not be empty');
    }
    if (title.trim().isEmpty) {
      throw ArgumentError.value(title, 'title', 'must not be empty');
    }
  }

  final String providerId;
  final String id;
  final String title;
  final List<String> artists;
  final String album;
  final Duration duration;
  final Uri? coverUrl;

  String get artistLabel =>
      artists.isEmpty ? 'Unknown Artist' : artists.join(', ');

  @override
  bool operator ==(Object other) =>
      other is Track && other.providerId == providerId && other.id == id;

  @override
  int get hashCode => Object.hash(providerId, id);

  @override
  String toString() => 'Track($providerId:$id, $title, $artistLabel, $album)';
}
