# 汽水 Android 原生協議移植（開發中）

本次在 V22 基底新增 Android 原生汽水平台，經 Omni 路由。不是把 Nishino 的新登入停用旗標改成啟用：該快照的簽名宿主仍有缺口，改採最新 Folia 上游使用的 qishui-music-api 車機協議並翻譯成 Java。

## 來源

- Folia adapter 設計參考：[chthollyphile/folia-major，1f6d0f4](https://github.com/chthollyphile/folia-major/tree/1f6d0f468f5bc81b23a8b40ad7ca96ccd4b1ecbe/src/services/onlineMusic/qishui)，AGPL-3.0。
- Java 協議、QR、ticket-guard、目錄與播放規則移植自 [GSQZ/qishui-music-api](https://github.com/GSQZ/qishui-music-api)，MIT（完整聲明如下）。
- 比較參考：[Nishino0525Nanase/folia-android，8c0974f](https://github.com/Nishino0525Nanase/folia-android/commit/8c0974f5fcdb7d77afe0e1ef74526bec34bfb159)。未複製它的 Windows 原生元件或加密音訊解密模組。

## 接入與限制

- 原生 FoliaQishuiPlugin 註冊於 MainActivity；Java 實作集中於 qishui 套件。
- 前端實作集中於 services/onlineMusic/qishui，以 providerRegistry 登記，UI 不直接接觸 API。
- 使用者主動取得抖音掃碼授權；私鑰、ticket 與憑證留在原生程序，不交給 WebView，不讀取其他 App 資料。
- API 僅允許列舉的 HTTPS 主機／路徑，不跟隨重導向，有連線／讀取時限及回覆長度限制。
- 汽水會話已改為 Android Keystore AES-256-GCM 加密，私鑰／ticket／accessCode 均在 no-backup 密文檔中，非敏感 device ID 單獨持久化。冷啟動須重新驗證帳戶，登出刪除密文與 Keystore key；儲存／key erase 另有 Android instrumentation 驗證。
- 僅選擇上游回傳的未加密標準音訊；拒絕受保護音訊，不解密，不越過會員／地區／試聽權限。
- 2026-10-24 使用者親自掃碼後，最新持久化版本在雷電通過真帳戶保存、force-stop 冷啟動驗證、曲庫讀取、UI 二次確認登出及再啟動不復活。上游長時間續期、會員／地區及寫操作仍未逐項驗收，平台可隨時變更協議或撤回客戶端授權。
- 真 WebView 由正常 UI／Omni／播放器播放一首約 117 秒、非試聽的標準明文音訊，進度前進且無 media error；不只取得 URL。此為單首驗證，不保證所有曲目／格式可播。

## 驗證注意

已修正簽名路徑重複前綴、公用 token 重試分類、登出／續期 revision 競態、共用續期、CDN 子域判斷、缺少收藏歌單的空值及 NaN 到期時間。原生儲存測試限用 authstoragetest 第三隔離套件，不能用清理 fixture 的測試覆蓋已登入的 authpreview。完整驗證與未通過項目見 [Android V22 驗證](android-v22-validation.md)。

## MIT notice — qishui-music-api

MIT License

Copyright (c) 2026 sayqz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
