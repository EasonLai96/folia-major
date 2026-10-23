# Android V22 登入整合：驗證與交付紀錄

驗證日期：2026-10-24（Asia/Taipei）。基底：`4706313e7c880eb6dd608190d7bdacde6f579179`，版本 0.7.20／versionCode 22。此節記錄發佈前的 V22 基底驗證；當時保留未提交改動、未 reset／clean。後續依使用者要求以 v23 測試版發佈，見 [v23 發佈說明](android-v23-release.md)。

## 結論

- **YTM 真帳戶登入、加密保存、冷啟動帳戶驗證、遠端唯讀歷史及一首歌的實際播放已通過雷電測試。** 不是只看瀏覽器登入畫面或假帳戶，也不是把訪客當登入。
- 最初「WebView 已登入，Folia 仍登入失敗」的直接原因有兩項：WebView 可能只提供 secure SID cookies；此外原生帳戶請求缺少與簽章一致的 canonical YouTube Origin。兩者均已寫入正式原始碼並重建安裝。
- **汽水最新版本亦經使用者親自掃碼授權，真帳戶 Keystore 保存、force-stop 冷啟動驗證、曲庫與一首非試聽音訊播放通過。** UI 二次確認登出已成功，本機歷史未變；密文／key 清理由原生 fixture 與登出後實機狀態分別驗證。
- 自動測試不是全綠：本次相關 491 項通過；全量 9,958 項通過、3 項失敗、2 項略過，3 項失敗在未修改 V22 基底均可重現。Typecheck 仍有基底既存的兩項錯誤。

## 隔離與資料保留

| 套件 | 用途／狀態 |
| --- | --- |
| `top.izuna.foliamajor` | 使用者原 App，versionCode 21，lastUpdateTime 2026-10-23 19:40:21；驗證前後一致，未覆蓋、未清資料、未卸載 |
| `top.izuna.foliamajor.authpreview` | 人工帳戶與 UI 測試隔離版，versionCode 22；只用 `adb install -r` 更新 |
| `top.izuna.foliamajor.authstoragetest` | 第三隔離套件，僅跑會清除 fixture 的 Keystore／Cookie instrumentation；測試先 assert 套件 ID，不能拿已登入的預覽版當 fixture |

裝置：雷電 Android 14，ADB `127.0.0.1:5555`。未備份／匯出使用者 cookie、ticket、私鑰或原始歷史曲目。診斷僅記狀態、數量、欄位存在性；不交付帳戶截圖。

## 已驗證的 YTM 流程

1. 使用者在原生登入 WebView 完成 Google／YouTube 登入並按「完成」。保留系統 WebView UA，未移除 `wv` 等標記來規避嵌入瀏覽器政策。
2. 帳戶 API 的 GFEEDBACK `logged_in` 必須是 `1`，再正規化選定帳戶；`logged_in=0`、未識別帳戶、401／403 均不能通關。
3. Android WebView secure-only cookies 使用 `SAPISIDHASH`／`SAPISID1PHASH`／`SAPISID3PHASH`；帳戶請求固定 `Origin`／`X-Origin=https://www.youtube.com`，不帶 `https://localhost`。
4. 真帳戶請求 HTTP 200、`logged_in=1`、有帳戶 actions；驗證後原生加密保存成功。此時僅確認 no-backup 密文存在及長度，不讀出內容。
5. 安裝原始碼產物並 force-stop／重開後，沒有任何 runtime monkeypatch，帳戶歷史正常顯示 2 張卡、載入結束、無錯誤。標題為「YT Music · 帳號歷史（只讀）」。
6. 從真歷史卡點歌，HTML audio `readyState=4`、`paused=false`、進度超過 1 秒、`error` 無值；來源是 V22 內部檔案快取，時長約 226 秒。只驗一首歌，不宣稱所有地區／會員／格式可播；未聲稱新鮮 poToken 的取得一定發生（可能命中既有快取）。
7. UI 退出登入要二次確認。確認後帳戶歷史消失、登入入口恢復、原生密文消失，退出前後 `folia_recent_plays` 完全相同。
8. 實測發現 `.google.com` 父域 Cookie 在初版清理中殘留；補入 root `google.com` 過期清理，Secure host-only／domain cookies 皆設 Secure。更新 APK 後再次清理，CDP 僅檢查名稱與域：Google／YouTube auth cookies 剩餘 **0**。測試 fixture 同時證明不清別家平台 Cookie。
9. 登出後 force-stop／重開，原生 `restoreSession` 仍回 null、帳戶歷史仍不可見，沒有已登出帳戶復活。最終預覽版維持未登入，需重新登入使用。

## 已驗證的汽水流程

1. 使用者親自用抖音掃描隔離版的真 QR 並授權；`login_status` 回有效帳戶，UI QR 消失。no-backup 只出現約 5 KB 的 `folia_qishui_session.bin` 密文，未讀出憑據內容。
2. force-stop／重新啟動程序後，原生重新驗證帳戶成功；當前平台仍是汽水，UI 有 3 張卡（含既有歷史入口）。原生曲庫讀到 2 個集合、取一個集合讀回 1 首歌，非 fixture。
3. 原生 audio 回 HTTPS、`preview=false`；再由正常 UI 集合播放按鈕經 Omni／正式播放器實際播放，進度 1.19 秒、總長 117.397 秒、`readyState=3`、`error` 無值。驗證後暫停。這是單首標準明文音訊，不代表所有曲目／會員格式通過。
4. 從真正的帳戶視窗按退出，再二次確認；原生回成功、`login_status=null`，前後 `folia_recent_plays` 一致。早期自動化曾在動畫／非帳戶 modal 上 timeout，不能計成功；關閉該 modal 並重新開啟正確帳戶視窗後完成上述驗證。
5. 登出後密文消失；安裝最終隔離 APK（僅另修不實的舊註解／錯誤日誌與 TS 縮排）再 COLD 啟動，帳戶仍為空。密鑰刪除另由 instrumentation 實際驗證，不靠讀檔名推論。

## 儲存與安全邊界

- YTM 與汽水各用不同的 Android Keystore AES-256-GCM key；12-byte 隨機 IV 由 Keystore provider 產生，密文以 AtomicFile 存 no-backup 目錄。讀取不會新建密鑰；解密／格式失敗會拒用，不把損毀資料當登入成功。
- YTM cookie／UA 有長度及可列印 ASCII 檢查，拒絕 CRLF header injection；帳戶 public ID 為摘要，不使用 email 或 token。
- 汽水 accessCode、ticket、憑證、guard EC 私鑰只在原生側；以 PKCS#8 放進 Keystore 加密的 session payload。非敏感 device ID 才存普通 preferences，冷啟動的 session 要重新問平台驗證。
- YTM 原生登入 WebView 仍使用 Android CookieManager；**此紀錄不宣稱整個 WebView Cookie 資料庫也由自訂 Keystore 加密**。自訂持久會話是加密密文；使用者登出時另針對 Google／YouTube Cookie 做清理。未使用 `removeAllCookies`。
- Save／clear FIFO 及 generation／revision guards 避免舊驗證、舊登入或續期在登出後寫回。加密儲存失敗必須報失敗，不暗中變成訪客或聲稱下次可恢復。
- YTM 明確傳入的帳戶 headers 僅送 `music.youtube.com`、`www.youtube.com` 精確 HTTPS 主機，拒絕 userinfo／非 443 端口／偽子域；明確帶帳戶請求不跟隨 redirect。汽水另有主機、路徑、CDN 域界限 allowlist。
- Capacitor 的全域 Java CookieHandler 與 WebView 共用 cookie jar；本次未改 framework 此行為。因此音訊／BotGuard 路線的「公開」表示沒有刻意傳入會話 header，**不保證同站原生 HTTP 絕不自動附加瀏覽器 cookie**；沒有將此包裝成完全隔離的無 Cookie transport。跨站不刻意轉送帳戶 header 的測試仍通過，但不是封包級匿名性證明。
- [Capacitor 設定](../capacitor.config.ts#L11-L13) 關閉 framework raw payload logging（debug 也關）；避免 bridge／cookie logger 印出憑據。應用自己的去敏日誌仍可使用。
- Debug APK 有一般 Android debug 可檢查性，不能當防 root／防注入／防 XSS 的保證。Keystore 不代表能防止已控制執行中 App 的攻擊者。

## 歷史與能力宣告

- 遠端歷史只呼叫 `/browse` 的 `FEmusic_history`／continuation，不發送播放回報、不新增／刪除遠端歷史。播放／重新整理歷史不自動修改帳戶記錄。
- 原有本機歷史仍用 `folia_recent_plays`，provider＋account 分隔、原有保留規則不變，未換鍵、未搬移或刪使用者記錄。UI 在有資料時以「最近播放（Folia 本機）」獨立顯示；空本機區塊按既有行為不畫。
- Android YTM 宣告：登入、搜尋、播放、歌詞、公開歌單／專輯／藝人目錄及帳戶歷史。個人歌單庫、使用者專輯庫、推薦／電臺、喜歡、訂閱、歌單寫操作仍是 false／unsupported；不為了顯示選單假造能力。
- 汽水有 native 對應的搜尋、目錄、曲庫、推薦／FM、歌詞及明確使用者動作的收藏／歌單寫入；不是所有宣告都已逐項真帳戶驗收。專輯庫不宣告支援，不解密受保護音訊、不繞過付費或地區限制。

## 首頁橫向捲動條

[Grid3DSlider](../src/library/suites/grid/home/Grid3DSlider.tsx#L764-L776) 保留 `overflow-x-auto`，加既有 `hide-scrollbar` 及 `scrollbarWidth: none`，未移除拖動／wheel／scroll handlers。

雷電 WebView 的正式 UI 產物以 **記憶體假資料**填入 6 張歌單卡（不是汽水真帳戶驗證）：

- clientWidth 450，scrollWidth 1890，存在真實橫向溢出；
- computed `overflow-x=auto`、`::-webkit-scrollbar display=none`；
- 改變 scrollLeft 後位置確實改變，仍可捲動；
- fixture 結束 reload，原 active provider 恢復；原生沒有假帳戶／session 寫入。

## 測試結果與證據

以下 `.log` 名稱是本次本機驗證紀錄的索引，未把完整本機診斷或帳戶資料上傳 GitHub；不是倉庫內下載連結。可重跑命令見下節，原生 fixture 必須使用第三隔離套件。v23 的安裝與簽章說明另見 [發佈說明](android-v23-release.md)。

| 驗證 | 結果 | 記錄 |
| --- | --- | --- |
| YTM／汽水／歷史／Omni／登入契約 focused | 32 檔、491 項通過 | `focused-delivery.log` |
| 完整 unit suite | 879 檔通過、3 檔失敗、1 檔略過；9,958 項通過、3 項失敗、2 項略過 | `all-unit-delivery.log` |
| 既存失敗對照 | 未修改 V22 基底重現同 3 失敗；其餘 71 項通過 | `baseline-failure-reproduction.log` |
| Typecheck | 仍僅基底既有的兩項 TS2578 | `typecheck-delivery.log` |
| Android instrumentation | 真 Keystore／CookieManager 8 項通過 | `android-storage-cookie-instrumentation.log` |
| Web build／cap sync／APK | 成功 | `android-web-delivery.log`、`android-sync-delivery.log`、`android-apk-delivery.log` |
| 實際音訊播放 | 通過一次；內部快取、readyState 4、進度前進 | `preview-audio-verification.log` |
| 登出後本機記錄保留／Cookie 清理 | 通過 | `preview-logout-confirmed.log`、`preview-root-cookie-verified.log` |
| 汽水真帳戶冷啟動／曲庫 | 通過 | `qishui-account-coldstart.log`、`qishui-library-coldstart.log` |
| 汽水真音訊播放 | 一首非試聽標準音訊通過 | `qishui-audio-resolution.log`、`qishui-audio-ui-verification.log` |
| 汽水 UI 登出／冷啟動不復活 | 通過，本機歷史未變 | `qishui-logout-confirmed.log`、`qishui-logout-coldstart.log`、`qishui-logout-files.log` |
| 橫向條隱藏與保留捲動 | 正式 WebView 產物＋記憶體 fixture 通過 | `preview-scrollbar-fixture.log` |
| git diff --check | 通過 | 未做自動格式化／整樹改寫 |

全量既存失敗：

1. [modSignature.test.ts](../test/unit/mod-system/modSignature.test.ts#L137-L140)：Windows symlink 權限 EPERM。
2. [loginFailurePlatforms.test.ts](../test/unit/onlineMusic/loginFailurePlatforms.test.ts#L428)：QQ fake-timer no-answer timeout。
3. [qqSearch.test.ts](../test/unit/onlineMusic/qqSearch.test.ts)：QQ anonymous mock 回傳 undefined，results.map 失敗。

另外完整 suite 提示 1 個 obsolete stored-settings snapshot，未擅自更新。本次新增平台造成的登入平台列表斷言已同步更新並重跑通過，未略過。早期 build／instrumentation／測試 timeout 的失敗不被算成成功；以上表格只指明列的重跑結果。

原生測試涵蓋：YTM 加密 round-trip／clear／tamper／CRLF、Google root＋Secure domain Cookie erasure 不碰其他 provider、汽水加密與 key erase、穩定 device ID／還原需驗證、canonical signing／ECDSA 真驗章、CDN 域界限與非有限到期時間拒絕。

## 交付 APK

- `Folia-V22-authpreview-20261024.apk`
- package：`top.izuna.foliamajor.authpreview`，versionCode 22，versionName 0.7.20，debug 簽章。
- SHA-256：`608E3EA27AA1D524F7EEB828658518EB141C8E54F6B6C98D5448953EEC379C10`；16,331,362 bytes。
- 已在雷電以 `install -r` 安裝最終檔，安裝後 `base.apk` 的裝置端 SHA-256 與上述完全一致；最後更新 2026-10-24 00:51:29。兩平台登出狀態、空 no-backup、Google／YouTube auth cookies 0 均再次確認。
- 上述是本機歷史驗證產物，不在 GitHub 另上傳 V22 重複測試 APK。後續公開版本為 v23，下載與手機原金鑰建置正式覆蓋版見 [v23 發佈說明](android-v23-release.md)。不可為了安裝要求刪舊 App 資料。

## 重跑命令

在專案根目錄執行；SDK 路徑依本機設定。預覽版與 fixture 必須分開建置／安裝，且先保存預覽 APK，不可把 fixture 產物交付成預覽版。

```powershell
npm run test:unit -- test/unit/ytm test/unit/qishui test/unit/login/loginView.test.ts test/unit/login/loginDiagnosticReport.test.ts test/unit/login/loginModuleKnowsNoPlatform.test.ts test/unit/onlineMusic/ytmAndroidHistory.test.ts test/unit/onlineMusic/accountHistoryModel.test.ts test/unit/onlineMusic/omniListeningHistory.test.ts test/unit/onlineMusic/omniArchitecture.test.ts --maxWorkers=2 --testTimeout=20000
npm run test:unit -- --testTimeout=20000 --maxWorkers=2
npm run typecheck
npm run build:capacitor
npx cap sync android
.\android\gradlew.bat -p android :app:assembleDebug '-PfoliaTestApplicationId=top.izuna.foliamajor.authpreview' --console=plain
# fixture 僅安裝到 authstoragetest，不清真帳戶預覽版
.\android\gradlew.bat -p android :app:assembleDebug :app:assembleDebugAndroidTest '-PfoliaTestApplicationId=top.izuna.foliamajor.authstoragetest' --console=plain
adb -s 127.0.0.1:5555 shell am instrument -w -r -e class top.izuna.foliamajor.YtmSessionStoreInstrumentedTest,top.izuna.foliamajor.qishui.QishuiSessionInstrumentedTest top.izuna.foliamajor.authstoragetest.test/androidx.test.runner.AndroidJUnitRunner
```

## 尚待人工驗收

- 汽水真帳戶登入／冷啟動／單首音訊／登出已通過；歌詞／會員／地區限制及使用者主動寫操作尚未逐項回歸。
- 長時間跨到期窗口的 ticket／憑證真續期尚未等候實測；短流程與 revision guards 的原生／mock 測試不能等同長時間上游續期保證。
- Google 仍可拒絕某些帳戶在嵌入瀏覽器登入；不保證所有帳戶可用。
- 不宣稱雷電測試涵蓋所有 ROM／硬體，既有耳機暫停、常亮、鎖屏媒體控制等不在這次登入測試中重驗。
- 播放驗證時遇到既有 visualizer 背景遮擋「返回主頁」點擊；透過既有 DOM handler 返回完成後續檢查，未把這項別處 UI 問題說成已修復。
