# Android 開源版本功能對照與第一批補強

本文件記錄本次對照範圍，不代表其他版本的全部功能已合併。

## 核實的參考

- [hejunlin1755/folia-major-android](https://github.com/hejunlin1755/folia-major-android)：[Android 構建說明](https://github.com/hejunlin1755/folia-major-android/blob/main/packaging/android/README.md) 記錄手機內建 Node 24 API、原生媒體服務、耳機拔出暫停、更新頁面快取與橫屏調整。其 [FoliaPlaybackService.java](https://github.com/hejunlin1755/folia-major-android/blob/main/packaging/android/android/app/src/main/java/top/izuna/folia/android/FoliaPlaybackService.java) 實際註冊 AUDIO_BECOMING_NOISY。
- [aikun-China/folia-major-apk](https://github.com/aikun-China/folia-major-apk)：[README](https://github.com/aikun-China/folia-major-apk/blob/master/README.md) 記錄系統下載管理器、檔案上傳與離線提示；這是載入遠端網站的 WebView 外殼，與本分支內建頁面的架構不同，不整包合併。
- [Metrolist](https://github.com/MetrolistGroup/Metrolist)：不是 Folia 移植版；僅參考 Android 播放器的產品行為。[PlayerSettings.kt](https://github.com/MetrolistGroup/Metrolist/blob/main/app/src/main/kotlin/com/metrolist/music/ui/screens/settings/PlayerSettings.kt) 含展開播放器時保持亮屏的選項。本次採更保守的「可見且正在播放才常亮」行為，未複製其程式碼。

## 對照與本次範圍

| 功能 | 本分支現況 | 本次處理 |
| --- | --- | --- |
| 通知／鎖屏控制、進度跳轉、背景播放 | 已有 Capacitor media session 整合 | 保留，不另起播放器或服務 |
| 迷你播放條、左右滑切歌、沉浸全屏 | 已有 | 保留 |
| 睡眠定時、音效／均衡器 | 已有 Web 播放流程 | 不重做；未宣稱鎖屏定時精度已驗證 |
| 耳機拔出自動暫停 | 原生插件及現有媒體插件未實作 | 新增 FoliaDevice 原生廣播，轉回既有 pause 流程；不自動播放、不調音量 |
| 播放頁常亮 | 原生及前端皆無 | 播放頁／拼貼頁可見且播放中才開啟；暫停、首頁、背景、卸載時解除 |
| 手機內建三平台 API | 尚無，使用設定的後端 | 留作獨立遷移：需檢查 Node ABI、授權、回環鑑權、登入資料遷移與包體，不在此批冒然合併 |
| 系統下載／分享 | 未完整整合 | 後續需定義檔案輸出、來源權限與失敗處理；不以既有內部快取冒稱下載功能 |
| 持久目錄授權與 MediaStore 掃描 | 目前主要為 Web 檔案選擇器 | 後續需 Android SAF／ContentResolver 整合，不宣稱完整本地掃描已具備 |
| 原生音訊焦點 | 未新增額外 AudioManager 焦點持有者 | WebView／Web Audio 也可能持有焦點，需真機確認後再設計，避免雙重焦點打架 |

## 新功能接入

- 原生：`android/app/src/main/java/top/izuna/foliamajor/FoliaDevicePlugin.java`，由 `MainActivity` 註冊。
- 前端：`src/platform/androidDevice.ts`；耳機暫停由 `useMediaSessionBridge` 呼叫既有傳輸暫停回呼；亮屏策略掛在 `useCapacitorShell`。
- 無新權限、無新伺服器、無新音訊來源；既有帳號、曲庫及音量設定不改。

## 驗證邊界

單元測試覆蓋：Android／非 Android 分流、播放／暫停與可見性亮屏策略、耳機事件原因過濾、已暫停不重複暫停、卸載後忽略事件及非同步監聽器釋放；另有整合測試確認事件呼叫既有暫停回呼並遵守控制禁用狀態。

- v22（versionCode 22）已成功建置，使用者確認已覆蓋安裝；實機能開啟首頁及播放頁，莫奈背景與歌詞正常顯示。
- 使用者實際斷開耳機，回報歌曲自動暫停：硬體場景確認通過（使用者回報，不冒稱為自動化測量）。
- 播放常亮超過系統鎖屏時間的實機測試：使用者選擇稍後再測，目前保持暫停；尚未確認此項硬體效果。
- 未操作音量、未清除資料。TypeScript 檢查仍有原有 WebView 相容性測試的兩個未使用 `@ts-expect-error`；先前已在基準版本重現。
