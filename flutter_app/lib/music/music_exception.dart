enum MusicErrorKind { network, timeout, http, invalidResponse, unavailable }

class MusicProviderException implements Exception {
  const MusicProviderException(
    this.kind,
    this.message, {
    this.statusCode,
    this.upstreamCode,
    this.cause,
  });

  factory MusicProviderException.network(String message, {Object? cause}) =>
      MusicProviderException(MusicErrorKind.network, message, cause: cause);

  factory MusicProviderException.timeout(String message, {Object? cause}) =>
      MusicProviderException(MusicErrorKind.timeout, message, cause: cause);

  factory MusicProviderException.http(
    String message, {
    required int statusCode,
    Object? cause,
  }) => MusicProviderException(
    MusicErrorKind.http,
    message,
    statusCode: statusCode,
    cause: cause,
  );

  factory MusicProviderException.invalidResponse(
    String message, {
    Object? cause,
  }) => MusicProviderException(
    MusicErrorKind.invalidResponse,
    message,
    cause: cause,
  );

  factory MusicProviderException.unavailable(
    String message, {
    int? upstreamCode,
    Object? cause,
  }) => MusicProviderException(
    MusicErrorKind.unavailable,
    message,
    upstreamCode: upstreamCode,
    cause: cause,
  );

  final MusicErrorKind kind;
  final String message;
  final int? statusCode;
  final int? upstreamCode;
  final Object? cause;

  @override
  String toString() {
    final buffer = StringBuffer('MusicProviderException(${kind.name}): ')
      ..write(message);
    if (statusCode != null) {
      buffer.write(' [HTTP $statusCode]');
    }
    if (upstreamCode != null) {
      buffer.write(' [upstream $upstreamCode]');
    }
    return buffer.toString();
  }
}
