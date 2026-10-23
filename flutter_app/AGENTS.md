# Flutter native rewrite

This standalone application belongs only to the `ios` branch. Do not modify the original Android worktree or root `android/`, `src/`, and Capacitor code as part of the rewrite.

- Use standard Dart snake_case filenames and `dart format`. TypeScript/Tailwind/Zustand-specific rules do not apply to Dart. These exceptions exist because this is a separate native Flutter application, not an extension to the React renderer.
- Group implementation by feature: `lib/music`, `lib/playback`, `lib/search`, `lib/player`, `lib/settings`.
- All online music access goes through `OmniMusicService`. Widgets must not construct providers or perform platform API requests.
- Provider-specific rules live in their provider. Never claim Node libraries can execute in Dart without a real runtime.
- UI strings belong in the centralized localization class; support Traditional Chinese and English initially, with explicit fallback for other locales.
- Tests live under `test/`; run `flutter analyze` and `flutter test`. Do not claim an iOS build or device verification from Windows tests.
- Keep credentials out of source and logs. First phase has no account login or credential storage.
- Original AGPL-3.0 license and upstream attribution remain applicable.
