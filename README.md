# 🎙️ 語音日記 · VoiceJournal

**用語音記錄生活，AI 幫你反思總結，讓每一天更有意義。**

VoiceJournal 是一個全端（前端為主）的 PWA 語音日記應用，支援**語音辨識轉文字**、**AI 總結整理**、**模板化記錄**、**錯誤模式分析**與**週報生成**。所有資料都存在你裝置的瀏覽器本地（IndexedDB），不需註冊帳號，完全私密。

---

## 📸 功能一覽

| 功能 | 說明 |
|------|------|
| 🎙️ 語音輸入 | 點擊麥克風直接說話，自動轉成文字 |
| ✨ AI 模板整理 | 選模板 + 一鍵讓 AI 把流水帳變成結構化記錄 |
| 💬 AI 對話反思 | 針對每條記錄與 AI 深度對話，釐清盲點 |
| 🔁 錯誤模式分析 | AI 掃描所有錯誤復盤，找出重複踩的坑 |
| 📊 週報生成 | AI 自動總結本週亮點與待改進，產出行動計畫 |
| 🏷️ 智慧標籤 | AI 自動建議標籤，方便日後搜尋 |
| 🔍 搜尋 / 篩選 | 按關鍵字、分類、重要性篩選記錄 |
| 📤 備份與匯出 | 支援 JSON 完整備份 / 還原，也支援 Markdown 匯出 |
| 📱 PWA 離線可用 | 可安裝到手機桌面，離線也能瀏覽記錄 |
| 🌙 深色主題 | 護眼的深色 UI，適合作為日常工具 |

---

## 🚀 從 0 到使用（完整教學）

### 第一步：下載專案

```bash
git clone https://github.com/你的帳號/voice-journal.git
cd voice-journal
```

> 沒有 Git？直接點 GitHub 頁面上的綠色「Code」→「Download ZIP」，解壓縮即可。

### 第二步：啟動應用

請根據你的情況選擇以下一種方式。

---

#### 手機端使用：用 Netlify Drop 一鍵部署（✅ 手機使用推薦）

這個方法不需要安裝任何東西，把專案資料夾丟上網路就能在手機上打開。

**電腦端操作：**

1. 打開瀏覽器，前往 [app.netlify.com/drop](https://app.netlify.com/drop)
2. 在檔案總管中打開 `voice-journal` 資料夾
3. 把整個 `voice-journal` 資料夾**拖曳**到瀏覽器視窗中
4. 等待幾秒鐘，畫面上會出現一個網址，類似：

```
https://friendly-kitsune-abc123.netlify.app
```

**手機端操作：**

5. 拿起你的手機，打開瀏覽器（建議用 Chrome）
6. 輸入上面那串網址（或直接掃 Netlify 頁面上的 QR Code）
7. 語音日記就在手機上跑起來了！🎉

然後繼續看第三步設定 AI 就可以開始使用。

> **這串網址會永久有效嗎？** Netlify Drop 給的是臨時網址，如果要長期使用，建議註冊免費的 Netlify 帳號，把同一個資料夾上傳到正式 Site。或者每次更新後重新拖曳一次也會得到新網址。
>
> **語音辨識在手機上能用嗎？** 可以，Android Chrome 和 iOS Safari 都支援 Web Speech API。

---

#### 電腦端開發測試

#### 選項 A：用 Node.js 啟動（✅ 電腦開發推薦）

```bash
node server.js
```

終端機會顯示：

```
✅ 語音日記 App 已啟動！
📱 打開瀏覽器訪問：http://localhost:3000
🛑 停止服務器：按 Ctrl+C
```

> 需要先安裝 Node.js（[下載位址](https://nodejs.org/)，下載 LTS 版本即可）。

#### 選項 B：用 VS Code Live Server

1. 在 VS Code 安裝 **Live Server** 擴充功能
2. 在 `index.html` 上按右鍵 → **Open with Live Server**

#### 選項 C：用 Python（如果電腦有 Python）

```bash
# Python 3
python -m http.server 3000
```

然後開啟瀏覽器訪問 `http://localhost:3000`。

> ⚠️ **注意**：直接用瀏覽器打開 `index.html`（`file://` 協定）可能導致語音辨識和 Service Worker 無法正常運作，建議使用以上任一伺服器方式啟動。

### 第三步：設定 AI（才能使用總結、對話、週報功能）

VoiceJournal 使用 Google Gemini API（免費方案）作為 AI 引擎。

1. 打開應用後，點擊右下角 **⚙️ 設置**
2. 點擊 **🔑 Gemini API Key（免費）**
3. 前往 [aistudio.google.com](https://aistudio.google.com) → 點擊 **「Get API key」**
4. 點擊 **「Create API Key」** → 選擇或建立 Google Cloud 專案 → 複製金鑰
5. 回到 App 貼上 API Key → 點擊 **「測試」** → 顯示「連接成功」即完成

> **關於 DeepSeek（進階選項）**：設定頁也可以切換到 DeepSeek API，需要去 [platform.deepseek.com](https://platform.deepseek.com) 註冊並儲值（最低約 $2 美元），適合需要更高用量上限的使用者。

### 第四步：開始你的第一條語音記錄

1. 點擊底部中央的 **「＋」** 按鈕
2. 點擊 **🎙️ 麥克風** 按鈕開始錄音，說話內容會自動轉成文字
3. 或是直接在文字框中打字輸入
4. 選擇 **分類**（事件記錄 / 思考感悟 / 待辦任務 / 錯誤復盤 / 學習筆記）
5. 選擇一個 **模板**（例如「標準事件記錄」）
6. 點擊 **✨ AI 套模板整理**，AI 會自動將內容整理成結構化格式
7. 可手動調整標籤和重要程度
8. 點擊 **「保存」** 完成記錄 🎉

### 第五步：探索更多功能

| 想做的事 | 操作方法 |
|---------|---------|
| 🔍 搜尋記錄 | 在列表頁頂部搜尋框輸入關鍵字或標籤 |
| 🗂️ 管理模板 | 點底部「🗂️ 模板」，可自訂自己的模板 |
| 💬 與 AI 對話 | 點擊任一記錄進入詳情頁，在底部輸入問題 |
| 🔄 回顧中心 | 點底部「🔄 回顧」，查看歷史上的今天、錯誤分析、週報 |
| 💾 備份資料 | 點「⚙️ 設置」→「備份 & 恢復」→ 下載 JSON 備份 |
| 📱 安裝到手機 | 在 Chrome 中訪問 → 右上角選單 →「加入主畫面」 |

---

## 🏗️ 專案架構

```
voice-journal/
├── index.html          # 主頁面（單頁應用，所有視圖都在這裡）
├── styles.css          # 深色主題設計系統（CSS 變數 + 組件樣式）
├── manifest.json       # PWA 清單（可安裝到手機桌面）
├── sw.js               # Service Worker（離線支援）
├── server.js           # 本機開發伺服器（Node.js）
├── icons/              # PWA 圖示（192x192, 512x512）
└── js/
    ├── app.js          # 🧠 應用主邏輯（路由、列表、詳情、設置）
    ├── db.js           # 🗄️ IndexedDB 資料層（CRUD、備份還原）
    ├── ai.js           # 🤖 AI 整合層（Gemini + DeepSeek API）
    ├── voice.js        # 🎙️ 語音辨識（Web Speech API 封裝）
    └── templates.js    # 📋 預設分類與模板資料
```

### 各模組簡介

| 檔案 | 職責 |
|------|------|
| `app.js` | 視圖路由、事件綁定、列表渲染、表單處理、批量操作 |
| `db.js` | IndexedDB 初始化、5 個物件儲存（entries / chats / categories / templates / settings） |
| `ai.js` | Gemini / DeepSeek API 呼叫、模板總結、AI 對話、錯誤分析、週報生成、API Key 測試 |
| `voice.js` | Web Speech API 封裝、連續辨識、中/英/簡體中文切換 |
| `templates.js` | 5 個預設分類 + 5 個預設模板的初始資料 |

---

## 🛠️ 使用技術

| 技術 | 用途 |
|------|------|
| **HTML5** + **CSS3** | 響應式 UI、CSS 變數設計系統、Flexbox 佈局 |
| **Vanilla JavaScript (ES Modules)** | 零框架、純原生 JS，模組化設計 |
| **IndexedDB** | 瀏覽器本地資料庫，所有資料儲存在使用者裝置 |
| **Web Speech API** | 瀏覽器原生語音辨識，不需第三方服務 |
| **Google Gemini API** | AI 文字生成（模板整理、對話、分析） |
| **DeepSeek API** | 替代 AI 引擎（OpenAI 相容格式） |
| **PWA (Service Worker)** | 離線快取、可安裝到手機桌面 |
| **Node.js** | 僅用於本機開發伺服器（`server.js`） |

### 設計亮點

- **零依賴**：不依賴任何 npm 套件或前端框架，下載即可運作
- **全端但全在客戶端**：資料庫、AI、語音辨識全部在瀏覽器完成
- **漸進式增強**：不設定 API Key 仍可手動記錄，AI 是選配功能
- **台灣在地化**：繁體中文介面、中文語音辨識、在地化錯誤提示

---

## ⚙️ 技術規格

- 瀏覽器支援：Chrome（最佳）、Edge、Safari
- 語音辨識需要：Chrome（桌面 / Android）或 Safari（iOS）
- 無需後端伺服器、無需資料庫、無需註冊帳號

---

## 📝 開發者備註

這個專案從頭到尾都是一個人獨立完成，從 UI 設計、資料庫設計、AI 整合到 PWA 離線支援。選擇不使用框架，是因為想證明純 Vanilla JS 也能做出結構清晰、可維護的完整應用。

如果你是面試官，以下幾點或許值得一看：

- **`js/app.js`** — 視圖路由 + 狀態管理 + 事件系統，約 1400 行，結構清楚
- **`js/ai.js`** — 雙 AI 引擎抽象層、自動降級、錯誤訊息中文化
- **`js/voice.js`** — 語音辨識的封裝與錯誤處理
- **`styles.css`** — 完整深色主題設計系統，純 CSS 變數驅動

---

## 📄 授權

MIT License
