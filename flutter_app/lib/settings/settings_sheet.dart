import 'package:flutter/material.dart';
import '../l10n/app_text.dart';
import 'app_settings.dart';

// Edits the public endpoint without mixing persistence into the search UI.
Future<bool?> showSettings(BuildContext context, AppSettings settings) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _SettingsSheet(settings: settings),
  );
}

class _SettingsSheet extends StatefulWidget {
  const _SettingsSheet({required this.settings});
  final AppSettings settings;
  @override
  State<_SettingsSheet> createState() => _SettingsSheetState();
}

class _SettingsSheetState extends State<_SettingsSheet> {
  late final TextEditingController controller;
  bool saving = false;
  String? error;
  @override
  void initState() {
    super.initState();
    controller = TextEditingController(text: widget.settings.server);
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppText.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        24,
        24,
        24,
        24 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(t.settings, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 20),
            TextField(
              controller: controller,
              keyboardType: TextInputType.url,
              autocorrect: false,
              decoration: InputDecoration(
                labelText: t.server,
                errorText: error,
              ),
            ),
            const SizedBox(height: 12),
            Text(t.privacy, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: saving
                  ? null
                  : () async {
                      if (AppSettings.normalize(controller.text) == null) {
                        setState(() => error = t.invalidServer);
                        return;
                      }
                      setState(() {
                        saving = true;
                        error = null;
                      });
                      try {
                        await widget.settings.setServer(controller.text);
                        if (context.mounted) Navigator.pop(context, true);
                      } catch (_) {
                        if (mounted) {
                          setState(() {
                            saving = false;
                            error = t.retry;
                          });
                        }
                      }
                    },
              child: Text(t.save),
            ),
          ],
        ),
      ),
    );
  }
}
