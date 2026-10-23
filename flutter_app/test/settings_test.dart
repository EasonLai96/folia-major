import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:folia_native/settings/app_settings.dart';

// Public endpoint settings must reject credentials and non-TLS API servers.
void main() {
  test('normalizes HTTPS endpoint and rejects unsafe inputs', () {
    expect(
      AppSettings.normalize(' https://example.com/api/ '),
      'https://example.com/api',
    );
    for (final input in [
      'http://example.com',
      'https://u:p@example.com',
      'file:///a',
      'https://example.com?token=x',
      'https://example.com#x',
    ]) {
      expect(AppSettings.normalize(input), isNull);
    }
  });
  test('persists endpoint in isolated native settings', () async {
    SharedPreferences.setMockInitialValues({});
    final settings = AppSettings(await SharedPreferences.getInstance());
    await settings.setServer('https://example.com/');
    final restored = AppSettings(await SharedPreferences.getInstance());
    expect(restored.server, 'https://example.com');
  });
}
