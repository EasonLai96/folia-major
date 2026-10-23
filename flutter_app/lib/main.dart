import 'package:audio_session/audio_session.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:just_audio_background/just_audio_background.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'music/music.dart';
import 'playback/playback_controller.dart';
import 'search/search_page.dart';
import 'settings/app_settings.dart';

// Composes the native client; no React or WebView runtime is embedded.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await JustAudioBackground.init(
    androidNotificationChannelId: 'top.izuna.folia.native.audio',
    androidNotificationChannelName: 'Folia playback',
    androidNotificationOngoing: true,
  );
  final session = await AudioSession.instance;
  await session.configure(const AudioSessionConfiguration.music());
  final settings = AppSettings(await SharedPreferences.getInstance());
  runApp(FoliaApp(settings: settings));
}

class FoliaApp extends StatefulWidget {
  const FoliaApp({super.key, required this.settings});
  final AppSettings settings;
  @override
  State<FoliaApp> createState() => _FoliaAppState();
}

class _FoliaAppState extends State<FoliaApp> {
  late OmniMusicService music;
  late final PlaybackController playback;
  @override
  void initState() {
    super.initState();
    music = OmniMusicService(baseUrl: Uri.parse(widget.settings.server));
    playback = PlaybackController(music);
  }

  void changeServer() {
    final previous = music;
    setState(() {
      music = OmniMusicService(baseUrl: Uri.parse(widget.settings.server));
      playback.changeService(music);
    });
    previous.close();
  }

  @override
  void dispose() {
    playback.dispose();
    music.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Folia Native',
    debugShowCheckedModeBanner: false,
    supportedLocales: const [Locale('zh', 'TW'), Locale('en')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    localeResolutionCallback: (locale, supported) =>
        locale?.languageCode == 'en'
        ? const Locale('en')
        : const Locale('zh', 'TW'),
    theme: ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: const Color(0xff101116),
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xffb6b2ef),
        brightness: Brightness.dark,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xff101116),
        centerTitle: false,
      ),
    ),
    home: SearchPage(
      music: music,
      playback: playback,
      settings: widget.settings,
      onServerChanged: changeServer,
    ),
  );
}
