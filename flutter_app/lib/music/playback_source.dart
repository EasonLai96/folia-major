class PlaybackSource {
  PlaybackSource({required this.url, this.preview = false}) {
    if (!isSupportedUrl(url)) {
      throw ArgumentError.value(
        url,
        'url',
        'must be an absolute HTTP or HTTPS URL',
      );
    }
  }

  final Uri url;
  final bool preview;

  static bool isSupportedUrl(Uri url) {
    final scheme = url.scheme.toLowerCase();
    return (scheme == 'http' || scheme == 'https') && url.host.isNotEmpty;
  }

  @override
  bool operator ==(Object other) =>
      other is PlaybackSource && other.url == url && other.preview == preview;

  @override
  int get hashCode => Object.hash(url, preview);

  @override
  String toString() => 'PlaybackSource($url, preview: $preview)';
}
