import 'package:flutter/material.dart';

// Network artwork with a deterministic fallback for missing or failed images.
class CoverArt extends StatelessWidget {
  const CoverArt({super.key, this.url, this.size = 56});
  final String? url;
  final double size;
  @override
  Widget build(BuildContext context) {
    final fallback = ColoredBox(
      color: const Color(0xff343545),
      child: Center(
        child: Icon(
          Icons.music_note_rounded,
          size: size * .42,
          color: Colors.white54,
        ),
      ),
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * .14),
      child: SizedBox(
        width: size,
        height: size,
        child: url == null || url!.isEmpty
            ? fallback
            : Image.network(
                url!,
                fit: BoxFit.cover,
                errorBuilder: (_, error, stack) => fallback,
              ),
      ),
    );
  }
}
