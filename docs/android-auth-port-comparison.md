# Folia Android 移植差異查核

查核日期：2026-10-23；驗證更新：2026-10-24。前半段保留修改前的固定提交比較；本次原始碼與雷電隔離驗證結果見末節及 [Android V22 驗證報告](android-v22-validation.md)。不把靜態能力或 mock 通過當成真帳戶實測。

## 比較基準

| 專案 | 固定提交 | 定位 |
| --- | --- | --- |
| 使用者 V22 | [EasonLai96/folia-major @4706313](https://github.com/EasonLai96/folia-major/commit/4706313e7c880eb6dd608190d7bdacde6f579179) | 0.7.20、Capacitor、既有訪客 YTM 音訊播放、手機模組市場 |
| 指定參考 | [Nishino0525Nanase/folia-android @8c0974f](https://github.com/Nishino0525Nanase/folia-android/commit/8c0974f5fcdb7d77afe0e1ef74526bec34bfb159) | 0.7.21、較完整 Android 原生整合、汽水與 YTM 登入實驗路徑 |
| 其他移植 | [Timingyyds/folia-android @440ce5d](https://github.com/Timingyyds/folia-android/commit/440ce5dbc084c2c5d6ec937cd99ae3a25b705429) | 原生曲庫、前台媒體服務 |
| 最新上游 | [chthollyphile/folia-major @1f6d0f4](https://github.com/chthollyphile/folia-major/commit/1f6d0f468f5bc81b23a8b40ad7ca96ccd4b1ecbe) | 桌面 0.7.22，改採 MIT qishui-music-api 的車機協議 |

## 核心結論

1. 不能把「對方有汽水選項」視為「Android 汽水登入可用」。指定參考的 qishuiTransport 在 Android 明確回傳 canSignIn:false。
2. 指定參考的 YTM 有登入與帳戶資料路徑，但 ytmInPageRuntime 將 audio、mix 與部分寫操作列為 unsupported。直接覆蓋 V22 會失去既有播放能力。
3. 使用者要求刪除 Android YTM 訪客入口：本次目標是登入必需、保留既有音訊管線，不再提供匿名搜尋／播放選項。
4. 原生平台差異、授權與安全限制必須逐項移植；不整包覆蓋、不更換套件識別、不抄入對方簽章或憑證。

## 功能差異（修改前）

| 項目 | 使用者 V22 | Nishino 指定參考 | 意義／處理 |
| --- | --- | --- | --- |
| Android YTM 搜尋／播放 | youtubei.js、原生 HTTP、BotGuard、下載至內部快取後播放 | 頁內搜尋／目錄有實作；audio 明確 unsupported | 保留 V22 音訊實作 |
| Android YTM 登入 | 沒有，訪客模式 | 原生登入 Activity，取 Google／YouTube Cookie；帳戶與資料庫讀取 | 選擇性移植並補強安全邊界；Google 可能拒絕嵌入瀏覽器 |
| YTM 寫操作 | 不支援 | 部分明確 unsupported | 不冒稱支援收藏／歌單編輯 |
| 汽水 Android | 無 provider | provider＋隱藏 WebView 簽名宿主，但新登入被停用 | 不直接解禁、不把失敗入口當成果 |
| 汽水新上游 | 尚未整合 | 舊 PC Web 安全元件路徑 | 優先評估最新 MIT 車機協議，避免 Windows 二進位與加密音訊解密 |
| 網易／QQ／酷狗 | 設定的後端；部分 Android 直連修正 | 打包協議＋原生 HTTP，README 宣稱不需第三方後端 | 屬另一批大型遷移，不隨登入整包套用 |
| 本地曲庫 | 主要 Web 選檔，未完整 MediaStore／SAF | FoliaNativePlugin 有 MediaStore 查詢及 ACTION_OPEN_DOCUMENT/TREE | 對方在原生曲庫較完整，非本次登入功能範圍 |
| 通知／鎖屏 | Capacitor media-session | 自訂 FoliaPlaybackService 與插件 | 不更換播放器架構以免破壞現有媒體控制 |
| 耳機拔出暫停 | V22 已加入，使用者實機回報通過 | 需另核對服務完整策略 | 保留 V22 行為 |
| 保持亮屏 | 可見播放頁／拼貼頁且播放中 | 可選播放常亮 | V22 超過系統休眠時間的實機確認尚未完成 |
| 動態壁紙／疊層／音樂鎖屏 | 無上述完整原生服務 | WallpaperService、疊層 WebView、鎖屏 Activity | 對方原生桌面／鎖屏整合較多，需要 ROM 權限，不能當一般 UI 小功能移植 |
| ColorOS 原生歌詞 | 無 | lyricInfo metadata bridge | 僅特定 ROM，不保證所有 Android |
| 狀態列歌詞 | 無原生 Lyricon bridge | Lyricon plugin | 依賴另裝中心服務與相容版本 |
| 模組市場 | V17 起有 Android client-only 安裝與簽章驗證 | README 著重桌面模組；Android 實作未完整驗證 | 不以 README 推論對方也有與 V22 相同的手機模組支援 |
| Android 套件 ID | top.izuna.foliamajor | io.github.nishino0525nanase.folia | 是不同 App，不能直接覆蓋／共享資料 |
| 版本策略 | Android versionCode 22 | 由 package 版本計算 | 本次保留使用者版本體系；完成測試後再決定發版 |

## 其他移植：Timingyyds

其 FoliaCorePlugin 有實際 MediaStore 欄位查詢及 SAF 文件／目錄選擇；LocalAudioServer 有本機音訊輸出。FoliaPlaybackService 刻意不處理音訊焦點改變，README 稱「歌曲永不讓位」。這不是所有場景都適合的策略：來電、導航、其他音訊與使用者暫停都要明確設計，不直接抄入 V22。

## 必須避免照搬的安全設定

- Nishino 的 YtmSignInActivity 去掉 UA WebView 標記以嘗試避開 Google 拒絕。本次不帶入這項規避；被拒絕就如實顯示，不能宣稱登入保證成功。
- 對方原生通用 HTTP 橋會使用 CookieManager；移植時需採精確主機 allowlist、憑證僅送到對應 HTTPS 主機、帶帳戶請求不跟隨重導向。
- 不複製 app-wide 明文 HTTP 開放設定。
- 不複製官方 Windows bdms.node／metasecml.dll。它們不是 Android 元件，且再散布權利不能僅憑 repository 的 AGPL 標籤推定。
- 不使用加密音訊解密實作；僅接受平台提供的未加密可播資源，保留會員／地區／試聽限制。
- 登出須清會話並拒收舊請求結果；Cookie、ticket、私鑰及完整簽名網址不得寫入日誌或報告。

## 可重現的主要程式碼證據

以下連結固定在本次比較提交，避免後續 main 更新造成結論失去依據。

- [Nishino qishuiTransport：Android canSignIn:false](https://github.com/Nishino0525Nanase/folia-android/blob/8c0974f5fcdb7d77afe0e1ef74526bec34bfb159/src/services/onlineMusic/qishuiTransport.ts#L43-L57)
- [Nishino YTM 頁內實作與不支援操作](https://github.com/Nishino0525Nanase/folia-android/blob/8c0974f5fcdb7d77afe0e1ef74526bec34bfb159/src/services/onlineMusic/ytm/ytmInPageRuntime.ts#L31)
- [Nishino YTM 登入 Activity](https://github.com/Nishino0525Nanase/folia-android/blob/8c0974f5fcdb7d77afe0e1ef74526bec34bfb159/android/app/src/main/java/top/izuna/foliamajor/YtmSignInActivity.java)
- [V22 YTM 訪客與音訊實作](https://github.com/EasonLai96/folia-major/blob/4706313e7c880eb6dd608190d7bdacde6f579179/src/services/onlineMusic/ytm/android/ytmAndroidBridge.ts)
- [Nishino 原生曲庫](https://github.com/Nishino0525Nanase/folia-android/blob/8c0974f5fcdb7d77afe0e1ef74526bec34bfb159/android/app/src/main/java/top/izuna/foliamajor/FoliaNativePlugin.java)
- [Nishino 原生鎖屏歌詞](https://github.com/Nishino0525Nanase/folia-android/blob/8c0974f5fcdb7d77afe0e1ef74526bec34bfb159/android/app/src/main/java/top/izuna/foliamajor/coloros/ColorOsLyricBridge.java)
- [Timing 音訊焦點策略](https://github.com/Timingyyds/folia-android/blob/440ce5dbc084c2c5d6ec937cd99ae3a25b705429/android/app/src/main/java/top/izuna/foliamajor/FoliaPlaybackService.java#L91-L109)
- [上游汽水整合](https://github.com/chthollyphile/folia-major/tree/1f6d0f468f5bc81b23a8b40ad7ca96ccd4b1ecbe/src/services/onlineMusic/qishui)
- [MIT 汽水協議](https://github.com/GSQZ/qishui-music-api)

## 本次取捨更新

依使用者逐檔查核與確認，增加以下要求：

- 原參考頁內 runtime 會把部分 youtubei.js 原始物件直接交回；這不符合 V22 的 YtmWirePage、YtmWireSong、歌詞 mainText 契約。本次不套用該 runtime，延用 V22 正規化並補登入／歷史資料的對應測試。
- YTM 登入不採記憶體限定：Android Keystore AES-256-GCM 保存授權會話，真帳戶冷啟動還原／驗證、登出後不可還原已通過雷電隔離測試。汽水也已接入 Keystore；使用者本次親自掃碼後，真帳戶冷啟動驗證、曲庫、單首音訊及登出已通過。
- 使用者已選擇「兩者分開顯示」：YouTube 帳戶歷史（遠端唯讀）與 Folia 本機播放紀錄分開；不自動寫入或刪除遠端歷史，不更名或破壞既有本機儲存鍵。
- Google 拒絕嵌入瀏覽器仍是實際相容性風險；未經登入實測，不宣稱支援全部帳戶。

## 驗證紀錄（2026-10-24 更新）

- Android Web build、Capacitor sync、原生 Java／隔離 APK 建置成功；早期編譯及平台命名失敗已修正並重跑，非忽略檢查。
- YTM 真帳戶登入故障已修：WebView secure-only cookies 的簽章與 canonical YouTube Origin 必須同時具備。正式原始碼重建後，不靠 runtime patch 即可冷啟動讀回帳戶，讀取 2 張遠端歷史卡並實際播放一首歌。
- 保留 V22 正規化、目錄、音訊／poToken／sandbox 原始碼；新增門禁，不再提供 Android YTM 訪客使用。個人曲庫、推薦及寫入功能沒有假設已移植，介面會明示不支援。
- 遠端歷史唯讀；Folia 本機歷史仍用原儲存鍵。UI 登出後本機紀錄原樣保留。發現 Google 父域 Cookie 清理殘留後已修正，最終 Google／YouTube auth cookies 剩餘 0，冷啟動也無會話。
- 首頁捲動條在雷電正式 UI 產物用記憶體 fixture 驗證：WebKit scrollbar display none、overflow-x auto、真實溢出且 scrollLeft 可改變。這不是汽水帳戶測試。
- 本次相關測試 32 檔／491 項通過；Android Keystore／CookieManager instrumentation 8 項通過，使用第三隔離 fixture 套件。
- 全量 9,958 項通過、3 項失敗、2 項略過。3 項失敗（Windows symlink、QQ fake-timer、QQ 搜尋 mock）均在未修改 V22 基底重現；沒有宣稱全綠。Typecheck 仍僅原始 V22 的兩項未使用 @ts-expect-error。
- 原 App 套件仍 versionCode 21、最後更新 2026-10-23 19:40:21，未覆蓋、清資料或卸載。只更新 authpreview；會清 fixture 的測試只跑 authstoragetest。
- 汽水原生儲存、ECDSA 真驗章、冷啟動需驗證及 key erase 的 fixture 通過；本次重新取得使用者掃碼授權，真帳戶冷啟動、曲庫、單首非試聽音訊、UI 登出及冷啟動不復活均通過。長時間真續期、會員／地區及寫操作未逐項驗收。
- 完整命令、失敗重現、交付 APK SHA-256、安全邊界及未驗證項目見 [驗證報告](android-v22-validation.md)。
