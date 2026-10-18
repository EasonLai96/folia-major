# Folia for Android

**讓歌詞成為風景，把 Folia 的沉浸式聽歌體驗帶到手機。**

基於 [Folia](https://github.com/chthollyphile/folia-major) 的非官方 Android 移植，使用 Capacitor 打包，提供可直接安裝的 APK，並加入系統媒體控制、手機播放條與操作手勢。

不用自行部署，下載安裝即可開始體驗；也能在設定中改用自己的後端伺服器。

[下載 Android APK](https://github.com/EasonLai96/folia-major/releases) · [Android 使用說明](https://github.com/EasonLai96/folia-major/blob/android/docs/android.md) · [版本更新紀錄](https://github.com/EasonLai96/folia-major/releases) · [上游 Folia](https://github.com/chthollyphile/folia-major)

> **社群非官方移植・公開測試中**
>
> Folia 的核心播放器、歌詞動畫與視覺設計來自上游團隊，本分支主要負責 Android 整合與手機體驗調整，並非上游官方 Android 發行版。
>
> Android 版本的問題請回報至本倉庫，不要直接向上游回報移植版特有的問題。

## Android 實機示範

[▶ 觀看 Android 實機示範（MP4）](https://github.com/EasonLai96/folia-major/blob/android/docs/media/folia-android-demo.mp4)

[下載原始影片](https://raw.githubusercontent.com/EasonLai96/folia-major/android/docs/media/folia-android-demo.mp4)

## 為什麼做 Android 版？

喜歡 Folia 的歌詞動畫，也希望在手機上直接打開就能聽。

這個分支在 Folia 原有體驗上，補上適合手機的使用方式：安裝 APK、從鎖屏控制播放、滑動切歌，以及更適合觸控的播放介面。

**保留 Folia 的視覺魅力，讓日常聽歌更順手。**

## 手機版特色

| 特色 | 說明 |
| --- | --- |
| 直接安裝 APK | 不用自行架站，也不用先將網頁加入主畫面 |
| 沉浸式歌詞 | 在手機上體驗 Folia 的全螢幕歌詞動畫與主題 |
| 系統媒體控制 | 通知欄與鎖屏顯示歌曲資訊，提供播放／暫停、上一首與下一首等控制 |
| HyperOS 超級島 | 支援相容機型的系統媒體展示，實際效果依裝置與系統版本而異 |
| 背景播放 | 切換到其他 App 後仍可繼續播放；實際行為可能受系統省電策略影響 |
| 迷你播放條 | 首頁與歌牆底部顯示封面、歌曲資訊與播放控制，點一下進入播放頁 |
| 手勢切歌 | 播放頁左滑下一首、右滑上一首、下滑離開 |
| 純畫面模式 | 輕點播放頁歌詞區域，收起進度與設定控制；再點一下恢復 |
| 手機效能預設 | 動畫預設 30 FPS、像素比上限 2，可依裝置效能自行調整 |
| 自訂後端 | 可在設定中改用自己的伺服器 |

> 功能可能隨版本調整，請以所下載版本的 Release 說明為準。不同品牌手機的背景播放與媒體控制表現可能不同。

## 下載與安裝

### 系統需求

- Android 7.0（API 24）以上。
- 建議 Android 10 以上。

### 安裝步驟

1. 開啟 [Releases 下載頁](https://github.com/EasonLai96/folia-major/releases)。
2. 選擇要安裝的 Android 版本，閱讀該版本的更新內容與已知問題。
3. 展開 **Assets**，下載名稱為 `Folia-*-android-*.apk` 的檔案。
4. 在手機上開啟 APK，依系統提示允許該來源「安裝未知應用程式」。
5. 完成安裝後開啟 Folia。

請下載 **`.apk` 安裝檔**，不是 `Source code` 原始碼壓縮檔。

### 更新提醒

目前發布的 APK 使用 **debug 簽名**。

- 簽名相同且版本符合更新條件時，可直接覆蓋安裝。
- 未來若改用不同的正式簽名，可能需要先移除舊版。
- 移除 App 可能清除本機資料，操作前請先備份重要設定與資料。
- 每次更新請先閱讀對應版本的 Release 說明。

## 和網頁版／PWA 有什麼不同？

Folia 原本就提供 Web 與 PWA 使用方式。本分支不是重新打造播放器，而是在既有功能上加入 Android 整合。

| 項目 | 本分支提供的體驗 |
| --- | --- |
| 安裝入口 | 直接下載 APK 安裝 |
| 預設後端 | 已配置公開後端，也可自行修改 |
| 系統整合 | 透過原生媒體整合提供通知欄與鎖屏控制 |
| 返回鍵 | 優先關閉面板或對話框；位於最外層時將 App 退到背景 |
| 觸控操作 | 手機迷你播放條、滑動切歌與下滑離開播放頁 |
| 介面調整 | 隱藏部分桌面專用介面，採用手機效能預設值 |

桌面版、Web 部署與上游完整功能介紹，請參考 [原版 Folia](https://github.com/chthollyphile/folia-major)。

## 音樂來源與已知限制

目前 Android 說明與已發布版本記錄的狀況如下：

| 來源／功能 | 狀況 |
| --- | --- |
| 網易雲音樂 | 已有搜尋、播放與登入的實機測試紀錄 |
| 酷狗音樂 | 已記錄可用 |
| QQ 音樂 | 預設公開後端目前有 501 錯誤，需要自行部署可用的 QQ 後端 |
| 較複雜的歌詞動畫 | 可能增加耗電、發熱或造成音訊與畫面不順 |
| 背景播放與媒體控制 | 可能受手機品牌、系統版本及省電設定影響 |

線上音樂來源的可用性也可能隨後端服務或第三方平台變動。請以 [Android 使用說明](https://github.com/EasonLai96/folia-major/blob/android/docs/android.md) 與各版本 Release 的紀錄為準。

若播放時不順，可以先降低動畫複雜度或幀率，再比較不同設定的表現。

## 後端與隱私

App 預設連線至上游作者公開部署的後端，也支援在設定中改用自己的伺服器。

**登入所使用的 cookie 會經過你設定的後端伺服器。** 使用預設設定時，資料會經過預設的公開後端；若希望自行掌握服務與資料流向，請使用自己信任或自行架設的後端。

相關部署說明：

- [上游部署指南](https://folia-site.cielaniska.top/guide/)
- [QQ 音樂部署說明](https://github.com/EasonLai96/folia-major/blob/android/docs/qq-music-deployment.md)

## 回報問題與協助測試

歡迎協助測試不同品牌手機上的安裝、背景播放、鎖屏控制與手勢操作。

請先確認使用版本與已知限制，再到 [本倉庫](https://github.com/EasonLai96/folia-major) 的 Issues 回報；若尚未開放 Issues，可先透過維護者提供的聯絡管道反映。

為了方便重現，請盡量附上：

- App 版本。
- 手機品牌與型號。
- Android 與系統版本，例如 HyperOS。
- 使用的音樂來源，以及是否使用自訂後端。
- 重現步驟。
- 預期結果與實際結果。
- 截圖或螢幕錄影，如有。

分享畫面或日誌前，請先遮蔽帳號、cookie、token 等敏感資訊。

**即使只是回報「這台手機可以正常使用」，也能幫助建立裝置相容性紀錄。**

## 自行建置

本分支的 Android 開發入口為 `android` 分支。

### 環境需求

- Node.js 24
- JDK 21
- Android SDK，包含 build-tools 36

### 建置指令

```bash
git clone --branch android https://github.com/EasonLai96/folia-major.git
cd folia-major

npm ci
npm run build:android:debug
```

APK 產物位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Android 預設後端由 `.env.android` 配置。更多建置細節與注意事項，請見 [Android 開發說明](https://github.com/EasonLai96/folia-major/blob/android/docs/android.md)。

## 上游與致謝

本專案基於 [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major)。

感謝上游作者與所有貢獻者打造 Folia 的播放器、歌詞動畫、主題與音樂整合功能。本分支主要新增 Android 外殼、原生媒體整合及手機介面調整，並不代表上述核心功能由本分支獨立開發。

- [上游原始碼](https://github.com/chthollyphile/folia-major)
- [上游使用指南](https://folia-site.cielaniska.top/guide/)
- [貢獻者名單](https://github.com/EasonLai96/folia-major/blob/android/CONTRIBUTORS.md)
- [上游完整介紹與致謝](https://github.com/chthollyphile/folia-major#readme)

## 授權與內容權利

本分支沿用上游的 **AGPL-3.0** 授權，詳細條款請參閱 [LICENSE](https://github.com/EasonLai96/folia-major/blob/android/LICENSE)。

音樂、歌詞、專輯封面等第三方內容的權利屬於各自權利人；程式碼授權不代表取得這些內容的使用或散布權利。

---

如果這個 Android 移植對你有幫助，歡迎給本倉庫一顆 Star、分享使用心得，也別忘了支持 [原版 Folia](https://github.com/chthollyphile/folia-major)。
