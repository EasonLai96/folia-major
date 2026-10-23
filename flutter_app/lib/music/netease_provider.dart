import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'lrc_parser.dart';
import 'lyric_line.dart';
import 'music_exception.dart';
import 'music_provider.dart';
import 'playback_source.dart';
import 'track.dart';

class NeteaseProvider implements MusicProvider {
  NeteaseProvider({
    Uri? baseUrl,
    http.Client? client,
    Duration requestTimeout = const Duration(seconds: 12),
  }) : _baseUrl = _validateBaseUrl(baseUrl ?? defaultBaseUrl),
       _client = client ?? http.Client(),
       _ownsClient = client == null,
       _requestTimeout = requestTimeout {
    if (requestTimeout.inMilliseconds <= 0) {
      throw ArgumentError.value(
        requestTimeout,
        'requestTimeout',
        'must be positive',
      );
    }
  }

  static const String providerId = 'netease';

  static final Uri defaultBaseUrl = Uri.parse(
    const String.fromEnvironment(
      'FOLIA_NETEASE_API_BASE',
      defaultValue: 'https://folia-api-enhanced.izuna.top',
    ),
  );

  static const String _playbackLevel = 'exhigh';
  static final RegExp _numericId = RegExp(r'^[0-9]+$');

  final Uri _baseUrl;
  final http.Client _client;
  final bool _ownsClient;
  final Duration _requestTimeout;

  Uri get baseUrl => _baseUrl;

  @override
  String get id => providerId;

  @override
  Future<MusicSearchPage> search(
    String query, {
    int limit = 30,
    int offset = 0,
  }) async {
    final keywords = query.trim();
    if (keywords.isEmpty) {
      throw ArgumentError.value(query, 'query', 'must not be empty');
    }
    if (limit <= 0) {
      throw ArgumentError.value(limit, 'limit', 'must be positive');
    }
    if (offset < 0) {
      throw ArgumentError.value(offset, 'offset', 'must not be negative');
    }

    final body = await _getJson(
      _uri('/cloudsearch', <String, String>{
        'keywords': keywords,
        'limit': '$limit',
        'offset': '$offset',
      }),
      'search',
    );
    _requireOk(body, 'search');

    final result = _asMap(body['result']);
    if (result == null) {
      throw MusicProviderException.invalidResponse(
        'Search response has no result object',
      );
    }

    final songs = _asList(result['songs']);
    if (songs == null) {
      throw MusicProviderException.invalidResponse(
        'Search response has no songs list',
      );
    }

    final total = _asInt(result['songCount']);
    if (total == null || total < 0) {
      throw MusicProviderException.invalidResponse(
        'Search response has no valid song count',
      );
    }

    final tracks = <Track>[];
    for (var index = 0; index < songs.length; index++) {
      tracks.add(_parseTrack(songs[index], index));
    }

    final nextOffset = offset + tracks.length;
    return MusicSearchPage(
      tracks: tracks,
      total: total,
      hasMore: nextOffset < total,
      nextOffset: nextOffset,
    );
  }

  @override
  Future<PlaybackSource> getPlaybackSource(Track track) async {
    final mediaId = _mediaIdFor(track);
    final body = await _getJson(
      _uri('/song/url/v1', <String, String>{
        'id': mediaId,
        'level': _playbackLevel,
        'randomCNIP': 'true',
        'https': 'true',
      }),
      'song URL',
    );
    _requireOk(body, 'song URL');

    final data = _asList(body['data']);
    if (data == null || data.isEmpty) {
      throw MusicProviderException.invalidResponse(
        'Song URL response has no data entries',
      );
    }

    final entry = _asMap(data.first);
    if (entry == null) {
      throw MusicProviderException.invalidResponse(
        'Song URL response entry is not an object',
      );
    }

    final upstreamCode = _asInt(entry['code']);
    if (upstreamCode != null && upstreamCode != 200) {
      throw MusicProviderException.unavailable(
        'NetEase returned no playable URL for song $mediaId',
        upstreamCode: upstreamCode,
      );
    }

    final rawUrl = entry['url'];
    if (rawUrl is! String ||
        rawUrl.trim().isEmpty ||
        rawUrl.trim().toLowerCase() == 'null') {
      throw MusicProviderException.unavailable(
        'NetEase returned no playable URL for song $mediaId',
        upstreamCode: upstreamCode,
      );
    }

    final url = _mediaUri(rawUrl);
    if (url == null) {
      throw MusicProviderException.invalidResponse(
        'NetEase returned an invalid playback URL for song $mediaId',
      );
    }

    return PlaybackSource(url: url, preview: entry['freeTrialInfo'] is Map);
  }

  @override
  Future<List<LyricLine>> getLyrics(Track track) async {
    final mediaId = _mediaIdFor(track);
    final body = await _getJson(
      _uri('/lyric/new', <String, String>{'id': mediaId}),
      'lyrics',
    );
    _requireOk(body, 'lyrics');

    final lyricText = _extractLyricText(body);
    if (lyricText == null) {
      throw MusicProviderException.invalidResponse(
        'Lyrics response has no LRC text for song $mediaId',
      );
    }

    return LrcParser.parse(lyricText);
  }

  @override
  void close() {
    if (_ownsClient) {
      _client.close();
    }
  }

  Future<Map<String, Object?>> _getJson(Uri uri, String action) async {
    http.Response response;
    try {
      response = await _client
          .get(
            uri,
            headers: const <String, String>{'Accept': 'application/json'},
          )
          .timeout(_requestTimeout);
    } on TimeoutException catch (error) {
      throw MusicProviderException.timeout(
        '$action request timed out after ${_requestTimeout.inSeconds}s',
        cause: error,
      );
    } on http.ClientException catch (error) {
      throw MusicProviderException.network(
        '$action request failed before reaching the backend',
        cause: error,
      );
    } catch (error) {
      throw MusicProviderException.network(
        '$action request failed before reaching the backend',
        cause: error,
      );
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw MusicProviderException.http(
        '$action request returned HTTP ${response.statusCode}',
        statusCode: response.statusCode,
      );
    }

    String bodyText;
    try {
      bodyText = utf8.decode(response.bodyBytes);
    } on FormatException catch (error) {
      throw MusicProviderException.invalidResponse(
        '$action response is not valid UTF-8',
        cause: error,
      );
    }

    if (bodyText.isNotEmpty && bodyText.codeUnitAt(0) == 0xFEFF) {
      bodyText = bodyText.substring(1);
    }

    Object? decoded;
    try {
      decoded = jsonDecode(bodyText);
    } on FormatException catch (error) {
      throw MusicProviderException.invalidResponse(
        '$action response is not valid JSON',
        cause: error,
      );
    }

    if (decoded is! Map) {
      throw MusicProviderException.invalidResponse(
        '$action response is not a JSON object',
      );
    }

    return decoded.cast<String, Object?>();
  }

  void _requireOk(Map<String, Object?> body, String action) {
    final code = _asInt(body['code']);
    if (code == null) {
      throw MusicProviderException.invalidResponse(
        '$action response has no status code',
      );
    }
    if (code != 200) {
      throw MusicProviderException.unavailable(
        '$action failed with upstream code $code',
        upstreamCode: code,
      );
    }
  }

  Track _parseTrack(Object? value, int index) {
    final raw = _asMap(value);
    if (raw == null) {
      throw MusicProviderException.invalidResponse(
        'Search result song $index is not an object',
      );
    }

    final song = _asMap(raw['simpleSong']) ?? raw;
    final mediaId = _mediaId(song['id'] ?? raw['id']);
    if (mediaId == null) {
      throw MusicProviderException.invalidResponse(
        'Search result song $index has no valid id',
      );
    }

    final title = _nonEmptyString(
      song['name'] ?? raw['songName'] ?? raw['fileName'],
    );
    if (title == null) {
      throw MusicProviderException.invalidResponse(
        'Search result song $index has no title',
      );
    }

    final artists = <String>[];
    final rawArtists = song['ar'] ?? song['artists'];
    if (rawArtists is List) {
      for (final rawArtist in rawArtists) {
        final name = rawArtist is String
            ? _nonEmptyString(rawArtist)
            : _nonEmptyString(_asMap(rawArtist)?['name']);
        if (name != null) {
          artists.add(name);
        }
      }
    }

    final album = _asMap(song['al'] ?? song['album']);
    final albumName = _nonEmptyString(album?['name']) ?? 'Unknown Album';
    final coverUrl = _mediaUri(
      _nonEmptyString(album?['picUrl'] ?? album?['coverUrl'] ?? raw['cover']),
    );
    final durationMs = _asInt(
      song['dt'] ?? song['durationMs'] ?? song['duration'] ?? raw['duration'],
    );

    return Track(
      providerId: providerId,
      id: mediaId,
      title: title,
      artists: artists,
      album: albumName,
      duration: Duration(
        milliseconds: durationMs != null && durationMs > 0 ? durationMs : 0,
      ),
      coverUrl: coverUrl,
    );
  }

  String _mediaIdFor(Track track) {
    if (track.providerId != providerId) {
      throw ArgumentError.value(
        track.providerId,
        'track',
        'belongs to another provider, not $providerId',
      );
    }
    if (!_numericId.hasMatch(track.id)) {
      throw ArgumentError.value(track.id, 'track', 'has an invalid id');
    }
    return track.id;
  }

  Uri _uri(String endpoint, Map<String, String> query) {
    var basePath = _baseUrl.path;
    while (basePath.endsWith('/')) {
      basePath = basePath.substring(0, basePath.length - 1);
    }
    final suffix = endpoint.startsWith('/') ? endpoint : '/$endpoint';
    return _baseUrl.replace(path: '$basePath$suffix', queryParameters: query);
  }

  static Uri _validateBaseUrl(Uri uri) {
    final scheme = uri.scheme.toLowerCase();
    if (scheme != 'http' && scheme != 'https') {
      throw ArgumentError.value(uri, 'baseUrl', 'must use HTTP or HTTPS');
    }
    if (uri.host.isEmpty) {
      throw ArgumentError.value(uri, 'baseUrl', 'must have a host');
    }
    if (uri.userInfo.isNotEmpty) {
      throw ArgumentError.value(uri, 'baseUrl', 'must not contain credentials');
    }
    if (uri.hasQuery || uri.hasFragment) {
      throw ArgumentError.value(
        uri,
        'baseUrl',
        'must not contain a query or fragment',
      );
    }
    return uri;
  }

  static String? _extractLyricText(Map<String, Object?> body) {
    final nested = _asMap(body['data']);
    for (final source in <Map<String, Object?>>[body, ?nested]) {
      final lrc = _asMap(source['lrc']);
      final lrcText = lrc?['lyric'];
      if (lrcText is String) {
        return lrcText;
      }
      final direct = source['lyric'];
      if (direct is String) {
        return direct;
      }
    }
    return null;
  }

  static Map<String, Object?>? _asMap(Object? value) {
    if (value is Map) {
      return value.cast<String, Object?>();
    }
    return null;
  }

  static List<Object?>? _asList(Object? value) {
    if (value is List) {
      return value;
    }
    return null;
  }

  static int? _asInt(Object? value) {
    if (value is int) {
      return value;
    }
    if (value is num && value.isFinite && value == value.roundToDouble()) {
      return value.toInt();
    }
    if (value is String) {
      return int.tryParse(value.trim());
    }
    return null;
  }

  static String? _nonEmptyString(Object? value) {
    if (value is! String) {
      return null;
    }
    final text = value.trim();
    return text.isEmpty ? null : text;
  }

  static String? _mediaId(Object? value) {
    if (value is int) {
      return value > 0 ? '$value' : null;
    }
    if (value is num && value.isFinite && value == value.roundToDouble()) {
      final parsed = value.toInt();
      return parsed > 0 ? '$parsed' : null;
    }
    if (value is String) {
      final text = value.trim();
      if (!_numericId.hasMatch(text)) {
        return null;
      }
      final parsed = int.tryParse(text);
      return parsed != null && parsed > 0 ? '$parsed' : null;
    }
    return null;
  }

  static Uri? _mediaUri(String? value) {
    if (value == null) {
      return null;
    }

    var text = value.trim();
    if (text.isEmpty || text.toLowerCase() == 'null') {
      return null;
    }
    if (text.toLowerCase().startsWith('http://')) {
      text = 'https://${text.substring(7)}';
    }

    final uri = Uri.tryParse(text);
    if (uri == null ||
        uri.host.isEmpty ||
        (uri.scheme != 'http' && uri.scheme != 'https')) {
      return null;
    }
    return uri;
  }
}
