# Android v23：登入整合、原簽章覆蓋更新與建置

日期：2026-10-24。Android versionCode **23**；versionName／桌面 package 版本保持 **0.7.20**。這是 Android 獨立版本線，不觸發桌面或 Docker 發佈。

## 本次更新

- Android YouTube Music 改為必須登入；修正 secure-only Google Cookie 簽章與 YouTube Origin，保留 V22 正規化、音訊、BotGuard／poToken 路線。
- YTM／汽水的自訂持久會話採 Android Keystore AES-256-GCM；冷啟動須驗證，登出清除會話與密鑰。YTM 另清 Google／YouTube Cookie，不清其他平台 Cookie。
- 汽水使用 Android 原生抖音掃碼與車機協議，經 Omni 接入曲庫與播放器；不解密受保護音訊、不繞過會員／地區限制。
- YouTube 帳戶歷史為唯讀、與 Folia 本機播放紀錄分開；不自動寫入或刪除遠端歷史，不更換本機儲存鍵。
- 首頁歌單隱藏橫向捲動條，仍保留橫向捲動。

## 下載與簽章：先分清兩種 APK

**一般更新請下載 `Folia-0.7.20-android-v23.apk`。** 使用者已安全提供原簽章私鑰；比對 v22 憑證完全一致後，完成原包名 APK 簽署。原包名更新已在新建、無使用者資料的雷電實例通過 v22 → v23 `install -r`，設定、本機歷史與 IndexedDB fixture 保留。Release 仍維持公開測試 Pre-release，不代表所有裝置或平台能力已驗收。

| 類型 | 原包名更新（一般下載） | 隔離測試版（另附） |
| --- | --- | --- |
| 檔名 | `Folia-0.7.20-android-v23.apk` | `Folia-0.7.20-android-v23-authpreview.apk` |
| 套件 ID | `top.izuna.foliamajor` | `top.izuna.foliamajor.authpreview` |
| 用途 | 保留資料覆蓋 v22／同簽章相容舊版 | 與舊 App 並存，測試登入整合 |
| 簽章 | 與原 v22 相同的 debug key | 電腦測試環境另一把 debug key |
| 資料 | 同包名＋同簽章保留舊資料 | 獨立資料，不自動繼承舊 App |

由 [android-v23 Release](https://github.com/EasonLai96/folia-major/releases/tag/android-v23) 下載。安裝檔不含測試帳戶、Cookie、ticket 或簽署私鑰。

- 原包名 APK SHA-256：`117aff2d892f6cbf0bd4f31cfdf3accc6b2f5439dbc4a5b1d1f6741d2ce5de7a`。
- 原包名憑證 SHA-256：`3e136205734f0143a086f82445300da7a9222acb22b1ce95a02842e836b8d75c`，與 v22 完全一致。
- 隔離 APK SHA-256：`c3f079078d6df71a357bad115ad924f56c4aded1e21d1af94254ffd23a16c5e9`。
- 隔離憑證 SHA-256：`9a2650c42071eef64f8a6a2e0d38a7197e3efb30256f85a2f9f67e4af2577d5f`，**不能覆蓋原 App**。
- 原雷電實例的使用者舊 App 仍為 versionCode 21、lastUpdateTime 2026-10-23 19:40:21，未覆蓋或清資料；覆蓋測試只在新實例進行。詳見 [升級驗證](android-v23-upgrade-validation.md)。

**若安裝提示簽章不符，不要卸載或清資料。** 不同來源 APK 可能使用其他簽章，應先核對；不能拿隔離版改個檔名就當原包名更新。

## 手機：用原金鑰建置可覆蓋更新版本

以下在原 Linux／手機建置環境、原倉庫根目錄執行。保留既有 Node 24、JDK 21、SDK、arm64 aapt2 override 與原簽章；不要從測試 APK 複製簽章，也不要提交／上傳金鑰。

### 1. 拉取原碼，先保留當地修改

```bash
git status --short
git remote -v
# 以下假設 fork 指向 https://github.com/EasonLai96/folia-major.git
# 若本機名稱不同，以實際指向自己 fork 的 remote 替換；不要誤用上游。
git fetch fork android --tags
# 本機必須在原 Android 工作分支，且沒有會被覆蓋的未保存修改。
# 若非 fast-forward，停止並人工整合，不使用 reset --hard 或強制覆蓋。
git merge --ff-only fork/android
git log -1 --oneline
```

### 2. 確認原簽章仍在且吻合 v22

原環境通常使用 `$HOME/.android/debug.keystore`。**檔案不存在就停止，不可讓 Gradle 自動新建金鑰當作正式更新。**

```bash
test -f "$HOME/.android/debug.keystore" || { echo '原金鑰不存在，停止正式建置'; exit 1; }
keytool -list -v -keystore "$HOME/.android/debug.keystore" -alias androiddebugkey
```

讓 keytool 互動詢問密碼，不把密碼放進對話、指令紀錄或 Git。原 v22 APK 憑證 SHA-256 必須是：

```text
3E:13:62:05:73:4F:01:43:A0:86:F8:24:45:30:0D:A7:A9:22:2A:CB:22:B1:CE:95:A0:28:42:E8:36:B8:D7:5C
```

這是**簽署憑證指紋**，不是 APK 檔案雜湊。不同就停止；APK 只有公開憑證，無法反推私鑰。若原環境使用自訂 signingConfig，檢查實際那把 key，而不是新改簽章。

### 3. 正式包名建置，不傳隔離參數

```bash
npm ci
npm run cap:sync:android
cd android
./gradlew :app:signingReport --console=plain
# 先確認 debug variant 的 Store 與 SHA-256 就是原金鑰。
./gradlew :app:assembleDebug --console=plain
cd ..
```

**不要帶 `-PfoliaTestApplicationId`**。預設包名保持 `top.izuna.foliamajor`；versionCode 已是 23。產物為 `android/app/build/outputs/apk/debug/app-debug.apk`。這裡的「正式覆蓋版」指相同原簽章的原包名更新；既有發佈策略本來就是 debug variant，不等於改成新的 release signing key。

建置後，以當地 SDK 的 `apksigner`／`aapt` 核對：

```bash
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs android/app/build/outputs/apk/debug/app-debug.apk
"$ANDROID_HOME/build-tools/36.0.0/aapt" dump badging android/app/build/outputs/apk/debug/app-debug.apk
sha256sum android/app/build/outputs/apk/debug/app-debug.apk
```

只在確認 **原包名、versionCode 23、原簽章指紋相同**後，才命名為 `Folia-0.7.20-android-v23.apk` 並進行保留資料的覆蓋安裝。手機 arm64 環境請沿用現有相容的 SDK 工具；不要為此移除原 App。

### 4. 驗收後才公開正式覆蓋 APK

- 覆蓋安裝後檢查舊設定、本機歷史／曲庫仍保留。
- 驗證登入、強制停止後恢復、實際播放、登出與重新啟動不復活。
- 發佈時附上正式 APK 的新 SHA-256、憑證一致證據及手機驗收結果；不能沿用隔離測試 APK 的雜湊。
- 原簽章覆蓋 APK 已完成簽署及獨立雷電升級驗證，現在可由本次 Release 取得；使用者自己的手機覆蓋與全功能驗收尚待完成，因此仍維持 Pre-release。原碼 tag `android-v23` 不移動；後續簽章／升級文件以 `android` 分支與 Release 說明更新。

## 已驗證與尚未驗證

V22 基底整合版已在雷電 Android 14 使用真帳戶通過：YTM 登入／保存／冷啟動／遠端歷史／單首播放／登出；汽水由使用者親自掃碼，通過保存／冷啟動／曲庫／單首非試聽播放／UI 登出。v23 僅提升 Android versionCode 並整理發佈文件，未改上述功能邏輯。

- v23 發佈前重跑相關 32 檔／491 項單元測試全部通過；Android Keystore／CookieManager 8 項 instrumentation 在同功能的 V22 基底整合版通過。
- v23 隔離 APK 已 `install -r` 成功，裝置端 `base.apk` SHA-256 與交付檔一致。原套件未變；啟動後原生橋正常、讀到有效汽水會話（隔離包自身資料保留），YTM 會話為空。未為發佈再次清除現有帳戶資料；前述登出驗收是先前明確執行的獨立測試。
- 完整 unit suite：9,958 項通過、3 項失敗、2 項略過；3 項均在未修改 V22 基底重現。Typecheck 有原本兩項 TS2578，沒有宣稱全綠。
- Android YTM 個人曲庫、推薦／電臺、喜歡／訂閱及歌單寫入仍不支援。
- 汽水長時間真續期、會員／地區、全部歌詞與主動寫操作未逐項驗收；Google 可拒絕特定帳戶的嵌入瀏覽器登入。
- YTM WebView 使用 Android CookieManager；自訂 Keystore session 不代表整個 WebView Cookie 資料庫也加密。Capacitor 全域 CookieHandler 可能自動附加同站 Cookie，不宣稱公開音訊／BotGuard transport 完全無 Cookie。

完整記錄：[原簽章覆蓋升級驗證](android-v23-upgrade-validation.md)、[真帳戶驗證與安全邊界](android-v22-validation.md)、[移植差異比較](android-auth-port-comparison.md)、[汽水來源與 MIT notice](qishui-android-port.md)。
