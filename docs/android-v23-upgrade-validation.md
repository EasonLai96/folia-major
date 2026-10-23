# Android v23 原簽章與保留資料覆蓋驗證

日期：2026-10-24（Asia/Taipei）。功能原碼與既有 `android-v23` tag 相同；後續提交只更新發佈文件，不移動公開 tag。原簽章由使用者從原手機環境安全提供，金鑰與密碼不在 Git、Release 或 APK 內。

## APK 與簽章

| 項目 | 原 v22 發佈 APK | v23 原包名更新 APK |
| --- | --- | --- |
| 檔名 | `Folia-0.7.20-android-v22.apk` | `Folia-0.7.20-android-v23.apk` |
| applicationId | `top.izuna.foliamajor` | `top.izuna.foliamajor` |
| versionCode／versionName | 22／0.7.20 | 23／0.7.20 |
| 憑證 SHA-256 | `3e136205734f0143a086f82445300da7a9222acb22b1ce95a02842e836b8d75c` | 完全相同 |
| APK SHA-256 | `1cc9792a1319f03b884529b2077f81ecbf73ddf51ba7bc5623d1d7c69a070c1f` | `117aff2d892f6cbf0bd4f31cfdf3accc6b2f5439dbc4a5b1d1f6741d2ce5de7a` |

使用 Android SDK 36 `apksigner verify --verbose --print-certs` 驗證：一個 signer、RSA 2048、v2／v3 簽章通過。`zipalign -c -P 16 4` 通過。與已測試的 v23 隔離版相比，共 1,903 個 Web／Dex 檔案逐位元組相同；不同部分是包名資源／manifest 與 APK 簽章，不是另一份登入功能實作。

## 測試隔離：不使用使用者舊 App

- 原雷電 instance 0（`127.0.0.1:5555`）的舊 App 保持 versionCode 21，lastUpdateTime 2026-10-23 19:40:21；其 authpreview 保持 versionCode 23、lastUpdateTime 2026-10-24 01:15:19。未覆蓋、清資料或卸載。
- **另建乾淨 instance 1：`Folia-v23-upgrade-check`，`127.0.0.1:5557`。** 起始沒有 Folia 套件，不複製原實例、不匯入使用者帳戶。
- instance 1 先安裝公開的 v22 原 APK，再加入明確的合成資料 fixture。不是把使用者真帳戶資料抽出備份。

## 實際覆蓋升級

1. instance 1 安裝 v22 後，首次安裝時間為 2026-10-24 01:32:00。
2. 在 v22 的正式 `https://localhost` WebView 寫入合成 fixture：
   - `home_layout_style=grid`、`player_volume=0.37`；
   - 原儲存鍵 `folia_recent_plays` 中加入一筆合成本機播放紀錄；
   - 一個額外 localStorage 保留標記；
   - 一個獨立 IndexedDB 資料庫／object store 保留標記。
3. force-stop 後，以 **`adb -s 127.0.0.1:5557 install -r`** 安裝 v23 原簽章 APK。未 uninstall、未 `pm clear`、未更換包名；安裝回 `Success`，沒有 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`。
4. 升級後 versionCode 23，lastUpdateTime 2026-10-24 01:33:14，**firstInstallTime 仍為 01:32:00**。
5. 重新開啟 v23：上述四個 localStorage 值序列化後 SHA-256 升級前後完全一致，設定與本機歷史仍存在；IndexedDB 標記仍在。
6. 再 force-stop／重新啟動，重新檢查仍完全一致。原生 YTM／汽水 plugin 可正常回覆未登入狀態，React root 已掛載。
7. 裝置端安裝的 `base.apk` SHA-256 與交付 v23 檔案完全一致。

合成資料的比較摘要：

```text
packageId: top.izuna.foliamajor
versionCode: 23
localStorageByteIdentical: true
settingsExpected: true
localHistoryPresent: true
indexedDbMarker: v22-idb-retained
qishuiBridgeReady: true
ytmBridgeReady: true
uiRootPresent: true
```

## 能證明與不能證明的範圍

這個測試證明：實際發佈 v22 → 原簽章 v23 可經 Android 正常覆蓋安裝，且在這個 Android 14 測試實例保留 WebView 的設定、本機歷史及 IndexedDB。沒有拿不同簽章新安裝冒充升級，也沒有為測試刪使用者資料。

不代表所有手機、其他來源簽章或資料版本都已驗證。未把真帳戶放到新實例重新登入；真帳戶登入／冷啟動／音訊／登出證據仍是相同 Web／Dex 功能在隔離版的先前驗證，詳見 [完整驗證](android-v22-validation.md)。使用者自己手機的覆蓋安裝、會員／地區、長時間續期與所有寫操作仍待驗收，因此 GitHub 保持 Pre-release。

## 下載

到 [android-v23 Release](https://github.com/EasonLai96/folia-major/releases/tag/android-v23) 下載 **`Folia-0.7.20-android-v23.apk`**。`authpreview` 是並存隔離版，不是原 App 更新；兩者 SHA-256 均列在 Release 的 `SHA256SUMS.txt`。

簽章不符時停止，不要求解除安裝／清除資料。原碼／手機建置步驟見 [v23 說明](android-v23-release.md)。
