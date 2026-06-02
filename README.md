# 🎙️ 語音日記 · VoiceJournal

**用語音記錄生活，AI 幫你反思總結，讓每一天更有意義。**

VoiceJournal 是一個純前端的 PWA 語音日記 App，支援**語音辨識轉文字**、**AI 模板整理**、**AI 對話反思**、**錯誤模式分析**與**週報生成**。所有資料存在使用者裝置的瀏覽器本地（IndexedDB），不需後端、不需帳號，完全私密。

---

## ✨ 功能一覽

| 功能 | 說明 |
|------|------|
| 🎙️ 語音輸入 | 點擊麥克風直接說話，Web Speech API 即時轉文字 |
| ✨ AI 模板整理 | 選模板 + 一鍵讓 AI 把流水帳整理成結構化記錄 |
| 💬 AI 對話反思 | 針對每條記錄與 AI 深度對話，釐清盲點 |
| 🔁 錯誤模式分析 | AI 掃描所有錯誤復盤，找出重複踩的坑 |
| 📊 週報生成 | AI 自動總結本週亮點與待改進，產出行動計畫 |
| 🏷️ 智慧標籤 | AI 自動建議標籤，方便日後搜尋 |
| 🔍 搜尋 / 篩選 | 按關鍵字、分類、重要程度篩選；支援緊湊 / 卡片兩種列表模式 |
| 🗂️ 自訂模板 | 5 個預設模板，可自行新增、編輯、刪除 |
| 📤 備份與匯出 | JSON 完整備份 / 還原（合併或覆蓋模式）+ Markdown 匯出 |
| 📱 PWA 離線可用 | 可安裝到手機桌面，離線也能瀏覽與新增記錄 |
| 🌙 深色主題 | 護眼深色 UI，適合長期作為日常工具使用 |

---

## 🚀 快速上手

### 一、下載專案

```bash
git clone https://github.com/你的帳號/voice-journal.git
cd voice-journal
```

> 沒有 Git？點 GitHub 頁面上的綠色「Code」→「Download ZIP」，解壓後即可使用。

---

### 二、啟動應用

請根據你的環境選擇以下其中一種方式：

#### 手機使用：Netlify Drop 一鍵部署（推薦）

1. 前往 [app.netlify.com/drop](https://app.netlify.com/drop)
2. 把整個 `voice-journal` 資料夾**拖曳**到瀏覽器視窗
3. 等幾秒後取得網址（如 `https://xxx.netlify.app`）
4. 手機用瀏覽器打開該網址即可使用，建議可以添加至桌面長期使用。




> 語音辨識在 Android Chrome 與 iOS Safari 均支援。

#### 電腦開發測試

**Node.js（推薦）**
```bash
node server.js
# 打開瀏覽器訪問 http://localhost:3000
```

**Python**
```bash
python -m http.server 3000
# 打開瀏覽器訪問 http://localhost:3000
```

**VS Code Live Server**：在 `index.html` 上按右鍵 → Open with Live Server

> ⚠️ 請勿直接用瀏覽器開啟 `file://` 路徑——語音辨識與 Service Worker 在 `file://` 下無法正常運作。

---

### 三、設定 AI

點擊右下角 **⚙️ 設置** → **🔑 Gemini API Key（免費）**，依畫面指示取得並填入 API Key。

**取得 Gemini API Key：**
1. 前往 [aistudio.google.com](https://aistudio.google.com)
2. 點擊「Get API key」→「Create API Key」
3. 複製 Key（以 `AIza` 開頭）貼入 App，點「測試」確認連線成功

**進階：切換到 DeepSeek**（更高用量上限，需儲值）
- 前往 [platform.deepseek.com](https://platform.deepseek.com) 申請 API Key
- 在設置頁切換 AI 提供商即可

> 不設定 API Key 也能手動記錄，AI 功能為選配。

---

### 四、開始記錄

1. 點擊底部中央 **「＋」** 按鈕
2. 點擊 **🎙️** 開始說話，或直接打字
3. 選擇**分類**與**模板**
4. 點擊 **✨ AI 套模板整理**
5. 調整標籤、重要程度，點擊**保存**

---

## 🏗️ 專案架構

```
voice-journal/
├── index.html          # 主應用（單頁，含所有視圖）
├── styles.css          # 深色主題設計系統（CSS 變數 + 元件樣式）
├── manifest.json       # PWA 清單（可安裝到手機桌面）
├── sw.js               # Service Worker（離線快取）
├── server.js           # 本機開發用 Node.js 伺服器
├── landing/            # 產品介紹頁（靜態行銷頁面）
│   └── index.html
└── js/
    ├── app.js          # 應用主邏輯（路由、列表、詳情、設置、備份）
    ├── db.js           # IndexedDB 資料層（CRUD + 備份還原）
    ├── ai.js           # AI 整合層（Gemini + DeepSeek + 錯誤處理）
    ├── voice.js        # 語音辨識（Web Speech API 封裝）
    └── templates.js    # 預設分類與模板初始資料
```

### 模組說明

| 檔案 | 職責 |
|------|------|
| `app.js` | 視圖路由、事件綁定、列表渲染、表單處理、批量操作（~1400 行） |
| `db.js` | IndexedDB 初始化，管理 5 個物件儲存：entries / chats / categories / templates / settings |
| `ai.js` | Gemini / DeepSeek 雙引擎抽象、自動降級、錯誤訊息中文化 |
| `voice.js` | Web Speech API 封裝、連續辨識、多語言切換 |
| `templates.js` | 5 個預設分類 + 5 個預設模板 |

---

## 🛠️ 技術棧

| 技術 | 用途 |
|------|------|
| HTML5 + CSS3 | 響應式 UI、CSS 變數設計系統、Flexbox 佈局 |
| Vanilla JS (ES Modules) | 零框架、純原生 JS，模組化結構 |
| IndexedDB | 瀏覽器本地資料庫，資料完全存在使用者裝置 |
| Web Speech API | 瀏覽器原生語音辨識，免第三方服務 |
| Google Gemini API | AI 生成（模板整理、對話、分析）；支援 2.0-flash / 1.5-flash 自動降級 |
| DeepSeek API | 替代 AI 引擎（OpenAI 相容格式） |
| PWA / Service Worker | 離線快取、可安裝到桌面 |
| Node.js | 僅用於本機開發伺服器 |

### 設計亮點

- **零依賴**：無任何 npm 套件，下載即可運作
- **全在客戶端**：資料庫、AI 呼叫、語音辨識全在瀏覽器完成
- **漸進式增強**：不設 API Key 仍可手動記錄
- **自動降級**：Gemini 模型不可用時自動嘗試次要模型
- **繁體中文在地化**：介面、語音、錯誤提示全中文化

---

## 🔒 資料隱私與安全

### 資料儲存位置

所有日記內容儲存於**你自己裝置的瀏覽器 IndexedDB**，不會上傳至任何伺服器。

### 什麼時候資料會被清空？

| 情況 | 結果 |
|------|------|
| 清除瀏覽器「所有資料」/ 網站資料 | 全部消失 |
| Chrome 設定 → 隱私 → 清除瀏覽資料 | 全部消失 |
| 無痕 / 隱私模式下使用後關閉視窗 | 全部消失 |
| 磁碟空間不足，瀏覽器自動回收 | 可能消失 |
| 換瀏覽器或換裝置 | 看不到（資料不互通） |
| 正常關閉分頁或電腦 | 安全，資料保留 |

> 建議定期至設置頁使用 **JSON 備份**功能，避免資料意外遺失。

### 誰看得到我的資料？

DevTools（F12）→ Application → IndexedDB 可直接瀏覽所有記錄，**前提是對方必須能實際操作你的裝置**。

**高風險情境：**
- 他人借用你的電腦並開啟 DevTools
- 共用電腦且未清除瀏覽器資料
- 電腦遭惡意軟體遠端控制

**中風險情境：**
- 已安裝具惡意行為的瀏覽器擴充套件（Extension）

**不會發生的洩露方式：**
- 網路傳輸攔截（資料從不離開裝置）
- 其他網站偷讀（瀏覽器 Same-Origin 政策隔離）

> 本 App 適合記錄日常流水帳、學習復盤、工作想法。**請勿儲存密碼、身份證字號、金融帳號等高敏感資訊。**

---

## ⚙️ 瀏覽器相容性

| 功能 | Chrome | Edge | Safari (iOS) |
|------|--------|------|--------------|
| 核心功能 | ✅ | ✅ | ✅ |
| 語音辨識 | ✅ | ✅ | ✅ |
| PWA 安裝 | ✅ | ✅ | ✅ |

---

## 📄 授權

MIT License
