# Folia for iOS — Flutter 原生重構版

> **這裡是獨立的 `ios` 開發分支，不是 Android 發行版。**
>
> Flutter 重構正在開發中，目前沒有可下載安裝的 iOS IPA，也沒有提供共用簽署憑證。Android 使用者請前往下方 Android 分支；不要把本分支當成 Android 更新。

[Android 版本與說明](https://github.com/EasonLai96/folia-major/tree/android) · [iOS 開發說明](docs/flutter-ios.md) · [Flutter 原始碼](flutter_app) · [上游 Folia](https://github.com/chthollyphile/folia-major)

## Android 與 iOS 分開維護

| 項目 | Android | iOS 原生重構 |
| --- | --- | --- |
| 分支 | [`android`](https://github.com/EasonLai96/folia-major/tree/android) | [`ios`](https://github.com/EasonLai96/folia-major/tree/ios)（本分支） |
| 技術 | React / Capacitor | Flutter / Dart，不使用 WebView 外殼 |
| 程式入口 | Android 分支的 `src/`、`android/` | 本分支的 `flutter_app/` |
| 安裝產物 | 已發布 Android APK，請依 Release 說明選擇 | 尚未發布 IPA |
| 相容性 | 依 Android 版文件 | 尚待 macOS 建置與 iPhone 實測 |

本分支從 Android v22 原始碼建立。保留的 React、Electron、Capacitor 和根目錄 `android/` 是來源基底，**不是 Flutter iOS 的執行入口**。目前 Flutter 重構不修改 Android 分支，也不表示兩邊功能已經一致。

## 第一階段已實作

- Flutter 原生搜尋介面與結果分頁。
- 播放佇列、迷你播放器、播放頁與進度拖動。
- LRC 逐行同步歌詞與歌詞跳轉。
- 網易雲資料介接，透過可設定的 HTTPS API 後端；**仍依賴後端，不是內嵌 Node.js library**。
- 繁體中文／英文介面。
- iOS 背景音訊與媒體套件接線；實機效果未驗證。

尚未移植：帳號登入、QQ／酷狗／YouTube Music、收藏歌單、本地匯入、離線下載、原版複雜歌詞特效及完整手勢。這不是與 Android 等功能的正式版本。

## 驗證狀態

- Flutter 3.47.7 / Dart 3.13.5。
- `flutter analyze` 無問題，7 個單元測試通過。
- Web release 編譯成功；Dart 資料層實際取得搜尋結果、試聽來源與歌詞。
- **尚未完成 iOS 建置、iPhone 播放驗證、SideStore 安裝驗證。** Windows 上的分析／測試不能代替這些驗證。

## 開發與 iOS 建置

```sh
cd flutter_app
flutter pub get
flutter analyze
flutter test
```

iOS 需要 macOS / Xcode。儲存庫內提供手動觸發的 [Flutter iOS Build](.github/workflows/flutter-ios.yml)，用於產生未簽署 IPA；流程尚未在 macOS runner 實跑驗證，不自動發布 Release。

SideStore 安裝需要各使用者自己的 Apple ID 重簽。免費帳號一般需要在 7 天效期內刷新，且有啟用 App 數量限制；**不是下載未簽署 IPA 就能直接安裝，也不提供所有人共用的永久憑證**。請參考 [SideStore 官方說明](https://docs.sidestore.io/docs/faq) 與 [本分支建置文件](docs/flutter-ios.md)。

## 來源與授權

基於 [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) 的社群非官方重構，並非上游官方 iOS 發行版。既有視覺設計與原專案貢獻歸原作者及貢獻者；本分支沿用 [AGPL-3.0](LICENSE)。iOS 重構特有問題請回報本 fork，並註明 `ios / Flutter`，不要誤報至 Android 或上游。
