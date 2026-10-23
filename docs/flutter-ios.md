# Folia iOS（原生 Flutter 重寫）

這個分支在為 iOS 做原生 Flutter 重寫，原始碼在 `flutter_app/`。它不走 WebView 外殼，與 Android Capacitor 版是不同的實作，目前**不是功能完整的移植**；重寫範圍與規則見 `flutter_app/AGENTS.md`。功能基準來源是 Android 版最後核實的 v22（versionCode 22）原始碼，差異與未完成的部分以此為準，不冒稱已覆蓋。既有的 Android 原始碼與發布流程完全不動。

## 第一階段實作

- 原生 Material 介面：歌曲搜尋、分頁結果、播放佇列、迷你播放器、播放頁、拖動進度與逐行同步歌詞。
- Dart `http` → OmniMusicService → 網易雲 provider → 現有可設定的 HTTPS API 後端；**仍依賴後端，不是把 Node.js 音樂 library 內嵌進 iOS**。
- `just_audio`、`just_audio_background`、`audio_session` 提供音訊與系統媒體整合；已加入 `UIBackgroundModes=audio`，實際背景／鎖屏行為待 iPhone 驗證。
- 繁體中文／英文介面；設定只儲存公開 API 網址，不儲存帳號憑證。
- 尚未實作：登入、QQ／酷狗／YouTube Music、歌單收藏、離線下載、本地匯入、原版複雜特效、設定跨版本匯入、手勢切歌。
- iOS 工程在 `flutter_app/ios`，Web 工程僅供 Windows 開發期編譯檢查，不代表 iOS 驗證。

## CI 建置

`.github/workflows/flutter-ios.yml`：只允許在 GitHub Actions 頁面手動觸發（`workflow_dispatch`），跑在 macOS runner 上，內容為儲存庫 checkout → Flutter 的 `subosito/flutter-action`（直接釘死穩定版 **3.47.7**，Dart 版本由這支 SDK 決定，不另外指定）→ `flutter pub get` → `flutter analyze` → `flutter test` → `flutter build ios --release --no-codesign` → 把 `Payload/Runner.app` 打包成未簽署的 IPA → 上傳為名為 `folia-ios-unsigned` 的 artifact。

- 沒有 push / pull_request 觸發器：文件的普通提交不會帶起它，也不會牽動既有的 Android 相關流程。
- **此 workflow 尚未實際執行過**：在第一次手動跑走完全程之前，上述步驟與路徑只是規劃，未驗證。
- **Windows 無法在本機建置 iOS**：iOS 建置需要 macOS 的 Xcode 工具鏈，Windows 端只能做 Dart 分析、測試等與簽建無關的工作，建 iOS 一律走本 CI。
- 在 `flutter_app` 內容陸續落地的過程中，手動 dispatch 可能因應用程式尚未建置完成而失敗，屬預期行為。

## 產物與安裝

CI 產出的是**未簽署** IPA：裡面只有 `Payload/Runner.app`，本專案不提供任何簽署憑證，也不設定任何秘密、付费帳號憑證或發布 Release。你要在本機透過 GitHub artifact 下載它，再自己完成簽署與安裝：

- **每個使用者都需要自己的簽章**：不能直接安裝這支 IPA；安裝之前要用工具（例如 SideStore）以你自己的 Apple ID 重新簽署，再安裝到你的裝置上自行測試。
- **SideStore**：用官方來源安裝（見 [sidestore.io](https://sidestore.io) 的安裝指引與其官方来源，勿使用第三方鏡像）。
- **免費 Apple ID 的限制**：免費帳號簽署的 App 約 7 天後過期，需在 SideStore 內重新整理續期；且 Apple 的免費帳號一般同時最多 3 個自簽 App，**SideStore 本身也占掉一個名額**。

## 本機驗證（2026-10-23）

- Flutter 3.47.7 / Dart 3.13.5；`flutter analyze` 無問題。
- `flutter test`：7 個測試通過，涵蓋 LRC 多時間戳／偏移、搜尋與分頁映射、試聽來源、缺失 URL、HTTP／JSON 錯誤、HTTPS 端點驗證與設定儲存。
- `flutter build web --release` 成功。編譯器有套件引用 Cupertino 字型的提示，未阻止建置；目前應用自有介面使用 Material 圖示。
- `dart run tool/live_probe.dart` 實際透過 Dart Omni 資料層搜尋到 3 筆結果，取得試聽來源與 46 行歌詞；這是資料層驗證，不是 iOS 播放驗證。
- 瀏覽器操作測試未完成：本機瀏覽器偵錯服務未連通，未宣稱實際 UI 點選或播放通過。
- 尚未推送分支、觸發 macOS CI、產出 IPA、簽署憑證或在 iPhone 驗證。

## 未經測試／待確認

- **背景音訊**：background audio entitlements／設定（如 `UIBackgroundModes`）在 iOS 端目前只是配置意圖，是否真的能在鎖屏、切背景後持續播放，**需要實機測試確認**。
- 原生 Flutter 重寫**不是功能完整的移植**；本文件不宣稱任何未經實機或 CI 驗證的效果。
