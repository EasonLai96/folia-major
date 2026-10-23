import 'package:flutter/widgets.dart';

// Centralized strings for the first native Flutter release.
class AppText {
  AppText(this.english);
  final bool english;
  static AppText of(BuildContext context) =>
      AppText(Localizations.localeOf(context).languageCode == 'en');
  String get search => english ? 'Search music' : '搜尋音樂';
  String get hint => english ? 'Songs or artists' : '歌曲或歌手';
  String get empty => english ? 'Find your next favorite song' : '找一首喜歡的歌';
  String get noResults => english ? 'No songs found' : '沒有找到歌曲';
  String get settings => english ? 'Settings' : '設定';
  String get server => english ? 'NetEase API server' : '網易雲 API 伺服器';
  String get save => english ? 'Save' : '儲存';
  String get cancel => english ? 'Cancel' : '取消';
  String get invalidServer =>
      english ? 'Enter a valid HTTPS URL' : '請輸入有效的 HTTPS 網址';
  String get queue => english ? 'Play queue' : '播放佇列';
  String get queueEmpty => english ? 'Your queue is empty' : '播放佇列是空的';
  String get add => english ? 'Add to queue' : '加入佇列';
  String get added => english ? 'Added to queue' : '已加入佇列';
  String get play => english ? 'Play' : '播放';
  String get pause => english ? 'Pause' : '暫停';
  String get next => english ? 'Next track' : '下一首';
  String get previous => english ? 'Previous track' : '上一首';
  String get lyrics => english ? 'Lyrics' : '歌詞';
  String get noLyrics =>
      english ? 'No synchronized lyrics available' : '暫無同步歌詞';
  String get preview => english ? 'Preview provided by source' : '音源提供的是試聽片段';
  String get loading => english ? 'Loading…' : '載入中…';
  String get retry => english ? 'Retry' : '重試';
  String get phase => english
      ? 'Native preview · NetEase · No account login yet'
      : '原生預覽版 · 網易雲 · 尚未支援帳號登入';
  String get privacy => english
      ? 'Search and playback requests use this server. Only HTTPS is accepted. No account credentials are stored.'
      : '搜尋與播放請求會經過此伺服器。僅接受 HTTPS，目前不儲存帳號憑證。';
  String get native => english ? 'Folia Native' : 'Folia 原生版';
}
