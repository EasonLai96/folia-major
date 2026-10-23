import 'dart:io';
import 'package:yaml/yaml.dart';

// Checks the manual-only packaging workflow without claiming a macOS build.
void main() {
  final document =
      loadYaml(File('../.github/workflows/flutter-ios.yml').readAsStringSync())
          as YamlMap;
  final triggers = document['on'] as YamlMap;
  if (triggers.keys.length != 1 || !triggers.containsKey('workflow_dispatch')) {
    throw StateError('iOS workflow must be manual only');
  }
  final jobs = document['jobs'] as YamlMap;
  final job = jobs['build-ios'] as YamlMap;
  if (!(job['runs-on'] as String).startsWith('macos')) {
    throw StateError('macOS runner required');
  }
  stdout.writeln('Workflow YAML OK: manual dispatch only; macOS build job');
}
