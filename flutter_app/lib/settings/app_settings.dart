import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Stores only the native application's public API endpoint, never credentials.
class AppSettings extends ChangeNotifier {
  AppSettings(this._preferences)
    : server = _preferences.getString(_key) ?? defaultServer;
  static const defaultServer = 'https://folia-api-enhanced.izuna.top';
  static const _key = 'folia_native.netease_server';
  final SharedPreferences _preferences;
  String server;

  static String? normalize(String input) {
    final uri = Uri.tryParse(input.trim());
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment) {
      return null;
    }
    return uri.toString().replaceFirst(RegExp(r'/+$'), '');
  }

  Future<void> setServer(String input) async {
    final value = normalize(input);
    if (value == null) throw ArgumentError('Invalid HTTPS endpoint');
    if (!await _preferences.setString(_key, value)) {
      throw StateError('Could not save settings');
    }
    server = value;
    notifyListeners();
  }
}
