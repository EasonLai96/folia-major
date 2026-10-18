# Folia Android App（Capacitor 版）

這個分支把 Folia（v0.7.20）用 [Capacitor](https://capacitorjs.com/) 包成可以直接安裝的 Android App，並針對手機補上系統媒體控制、手機用的播放條和手勢。上游原專案是 [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major)，本分支只在它之上加了 Android 相關的修改，桌面版和網頁版的行為不變。

> [!NOTE]
> 這是社群的非官方移植，問題請先回報到本分支，不要打擾原作者。授權與上游相同，為 AGPL-3.0。

## 下載

到本倉庫的 [Releases](../../releases) 下載 `Folia-*-android-*.apk`，在手機上打開安裝即可（需要允許「安裝未知應用程式」）。

- 套件名稱：`top.izuna.foliamajor`
- 最低需求：Android 7.0（API 24）以上，建議 Android 10 以上
- 目前提供的是 debug 簽名的安裝檔，之後如果改用正式簽名，需要先移除舊版再安裝

## 和網頁版 / PWA 相比多了什麼

| 功能 | 說明 |
|---|---|
| 可直接安裝 | 不用自己架站、不用加到主畫面，裝好就能用 |
| 預設連線 | 預設使用作者公開部署的後端（`folia.izuna.top` 那一套），在 App 設定裡填自己的伺服器就會改用自己的 |
| 系統媒體控制 | 通知欄、鎖屏、小米 HyperOS「超級島」都會顯示封面、歌名、歌手，並可上一首 / 暫停 / 下一首、拖動進度；切到背景也會繼續播放 |
| 返回鍵 | 先關掉眼前的面板或對話框，已在最外層時把 App 退到背景（不會停止播放） |
| 迷你播放條 | 首頁和歌牆底部改成貼底的播放條：封面、歌名、歌手、播放 / 暫停、下一首與進度線；點一下進播放頁，左右滑切歌 |
| 播放頁手勢 | 左滑下一首、右滑上一首、下滑離開播放頁 |
| 手機預設值 | 首次開啟使用網格書庫；動畫預設 30 FPS、像素比上限 2，省電、不容易發燙（設定裡都能改） |
| 收起桌面專用介面 | 快捷鍵、開發者頁等只在電腦上有意義的東西在手機上不顯示 |

## 目前已知狀況

- **網易雲**：搜尋、播放、登入可用（實機測過）。
- **酷狗**：可用。
- **QQ 音樂**：作者公開的 QQ 後端目前回應 501，搜尋、歌單、登入都不能用；需要自己部署 QQ 後端（見 [QQ 音樂部署指南](qq-music-deployment.md)）。
- 登入的 cookie 會經過你設定的後端伺服器；用預設值時就是作者的伺服器，介意的話請自架。
- 手機上動畫較重的歌詞樣式（例如 3D 類）可能偏耗電。

## 自己建置

需要 Node.js 24、JDK 21、Android SDK（build-tools 36）。

```bash
npm ci
npm run build:android:debug
# 產物：android/app/build/outputs/apk/debug/app-debug.apk
```

- Android 版的預設後端寫在 `.env.android`，建置時用 `vite --mode android` 讀取。
- 在 arm64 Linux 上建置時，Google 提供的 aapt2 只有 x86-64 版本，請在 `~/.gradle/gradle.properties` 加上 `android.aapt2FromMavenOverride=<arm64 版 aapt2 的路徑>`。
- 每次發新版前記得把 `android/app/build.gradle` 的 `versionCode` 加一，否則手機無法覆蓋安裝。

## 程式在哪裡

| 位置 | 內容 |
|---|---|
| `capacitor.config.ts`、`android/` | Capacitor 設定與 Android 專案 |
| `src/platform/runtime.ts` | 判斷目前是桌面版、Android App 還是瀏覽器 |
| `src/platform/nativeMediaSession.ts` | 把媒體資訊轉給原生通知（`@capgo/capacitor-media-session`） |
| `src/hooks/useCapacitorShell.ts` | 系統列顏色、返回鍵 |
| `src/components/app/mobile-player/` | 迷你播放條與播放頁手勢 |

## 版本紀錄

- **v9**：修正「全部清空」會刪掉本地曲庫的手工整理（現在只清快取）；同步視覺設定時兩邊都改過會先詢問，不再用雲端舊設定覆蓋本地；通知欄 / 鎖屏可以拖動進度；切到沒有封面的歌時不再殘留上一首的封面。
- **v14**：播放頁沉浸式，收起狀態列和導航條、畫面鋪滿整個螢幕（含鏡頭挖孔那一條），從邊緣往內滑可暫時叫出；其他頁面照常顯示。音訊改用較大的緩衝，減少播放頁特效重時的斷續、嘶嘶聲。（v10～v13 是實機調整用的過渡版，沒有發布。）
- **v15**：探索拼貼在手機上不畫全螢幕顆粒紋理，甩動時不再掉到 20 多幀（實測從約 50 回到約 115 幀）。
- **v8**：合併上游最新 main（節拍特效等新功能）。
- **v7**：首頁 / 歌牆改用貼底迷你播放條；播放頁左右滑切歌、下滑離開。
- **v6**：修正通知欄、鎖屏、超級島沒有歌名與封面（Android WebView 沒有 `MediaMetadata`）。
- **v5**：通知欄、鎖屏、超級島媒體控制；收起桌面專用介面。
- **v4 以前**：Capacitor 外殼、預設後端與自訂伺服器、網格書庫、手機效能預設值。
