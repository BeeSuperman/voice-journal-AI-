/**
 * ai.js — Gemini API 集成
 * 負責所有 AI 功能：模板總結、對話、錯誤分析
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEEPSEEK_API_BASE = 'https://api.deepseek.com/v1';

// 讀取當前 AI 提供商（gemini 或 deepseek）
export function getProvider() {
  return localStorage.getItem('ai_provider') || 'gemini';
}

// 從設置中讀取 API Key
function getApiKey() {
  const provider = getProvider();
  if (provider === 'deepseek') {
    return localStorage.getItem('deepseek_api_key') || '';
  }
  return localStorage.getItem('gemini_api_key') || '';
}

function getModel() {
  const provider = getProvider();
  if (provider === 'deepseek') {
    return localStorage.getItem('deepseek_model') || 'deepseek-chat';
  }
  // 驗證模型名稱是否合法，不合法就自動用預設值
  const VALID_GEMINI_MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ];
  const stored = localStorage.getItem('gemini_model');
  if (stored && VALID_GEMINI_MODELS.includes(stored)) return stored;
  // 不合法或未設置，清除並用預設值
  if (stored) localStorage.removeItem('gemini_model');
  return 'gemini-2.0-flash';
}

// ─── 錯誤訊息中文化 ──────────────────────────────────────────
function translateApiError(rawMessage = '', statusCode = 0) {
  const msg = rawMessage.toLowerCase();

  // 配額超限（你截圖的那個錯誤）
  if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource_exhausted')) {
    // 嘗試提取等待秒數
    const waitMatch = rawMessage.match(/retry in ([\d.]+)s/i);
    const waitSec = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) : null;
    return waitSec
      ? `⏳ API 使用額度暫時用完，請等待約 ${waitSec} 秒後再試。（免費版每分鐘有請求次數限制）`
      : '⏳ API 使用額度暫時用完，請稍等一分鐘後再試。（免費版每分鐘有請求次數限制）';
  }

  // API Key 無效或未授權
  if (msg.includes('api_key_invalid') || msg.includes('invalid api key') || statusCode === 400 && msg.includes('key')) {
    return '🔑 API Key 無效，請到「⚙️ 設置 → Gemini API Key」重新設置正確的密鑰。';
  }
  if (msg.includes('api key not valid') || statusCode === 400) {
    return '🔑 API Key 格式不正確，請確認複製完整（以 AIza 開頭）。';
  }

  // 權限問題
  if (msg.includes('permission') || msg.includes('forbidden') || statusCode === 403) {
    return '🚫 API Key 無使用權限，請確認你的 Google AI Studio 帳號已啟用 Gemini API。';
  }

  // 未授權（未登入或 Key 被吊銷）
  if (msg.includes('unauthorized') || statusCode === 401) {
    return '🔒 授權失敗，請重新設置你的 Gemini API Key。';
  }

  // 請求內容問題（安全過濾）
  if (msg.includes('safety') || msg.includes('blocked')) {
    return '⚠️ 本次內容被 AI 安全系統攔截，請嘗試調整表達方式。';
  }

  // 服務不可用
  if (msg.includes('service unavailable') || msg.includes('unavailable') || statusCode === 503) {
    return '🌐 Gemini 伺服器暫時無法使用，請稍後再試。';
  }

  // 超時
  if (msg.includes('timeout') || msg.includes('deadline')) {
    return '⌛ 請求超時，請檢查網路連線後再試。';
  }

  // 網路問題（fetch 本身失敗，不是 API 回傳的錯）
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) {
    return '📡 網路連線失敗，請確認手機已連接網路，然後再試。';
  }

  // 沒有 API Key
  if (msg.includes('請先在設置中填入')) {
    return msg; // 已經是中文，直接返回
  }

  // 模型不存在（通常是 localStorage 裡面存了不合法的模型名稱）
  if (statusCode === 404) {
    localStorage.removeItem('gemini_model'); // 自動清除錯誤的模型設定
    return '🔄 AI 模型名稱已自動重置為預設值，請再點一次「測試」按鈕即可正常使用！';
  }

  // 其他未識別的錯誤
  return `❌ AI 服務發生錯誤，請稍後再試。（錯誤代碼：${statusCode || '未知'}）`;
}

// 通用請求函數（自動路由 Gemini / DeepSeek）
async function callGemini(messages, systemPrompt = '') {
  const provider = getProvider();
  const apiKey = getApiKey();

  if (!apiKey) {
    const name = provider === 'deepseek' ? 'DeepSeek' : 'Gemini';
    throw new Error(`請先在「⚙️ 設置 → ${name} API Key」中填入你的 API Key，才能使用 AI 功能。`);
  }

  return provider === 'deepseek'
    ? callDeepSeek(messages, systemPrompt, apiKey)
    : callGeminiApi(messages, systemPrompt, apiKey);
}

// ─── Gemini ──────────────────────────────────────────────────
// 按照優先順序嘗試不同模型，直到成功為止
const GEMINI_FALLBACK_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

async function callGeminiApi(messages, systemPrompt, apiKey) {
  const preferred = getModel();
  // 把偏好模型排在最前面
  const modelsToTry = [preferred, ...GEMINI_FALLBACK_MODELS.filter(m => m !== preferred)];

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const body = {
    contents,
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  };

  let lastError = '';
  for (const model of modelsToTry) {
    const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (networkErr) {
      throw new Error('📡 網路連線失敗，請確認手機已連接網路，然後再試。');
    }

    if (res.status === 404) {
      // 這個模型不可用，自動嘗試下一個
      lastError = `模型 ${model} 不可用`;
      continue;
    }

    if (!res.ok) {
      let errMsg = '';
      try { const err = await res.json(); errMsg = err.error?.message || ''; } catch {}
      throw new Error(translateApiError(errMsg, res.status));
    }

    // 成功！記下這個可用的模型，下次直接用
    localStorage.setItem('gemini_model', model);

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      const reason = data.candidates?.[0]?.finishReason;
      if (reason === 'SAFETY') throw new Error('⚠️ 本次內容被 AI 安全系統攔截，請嘗試調整表達方式。');
      throw new Error('❌ AI 返回了空回覆，請重試。');
    }
    return text;
  }

  // 所有模型都失敗了
  throw new Error('❌ 所有 AI 模型均無法使用，請稍等 10-15 分鐘後重試（Google 帳單激活需要時間同步）。');
}


// ─── DeepSeek（OpenAI 相容格式）─────────────────────────────
async function callDeepSeek(messages, systemPrompt, apiKey) {
  const model = getModel();
  const url = `${DEEPSEEK_API_BASE}/chat/completions`;

  const allMessages = [];
  if (systemPrompt) allMessages.push({ role: 'system', content: systemPrompt });
  allMessages.push(...messages.map((m) => ({
    role: m.role === 'ai' ? 'assistant' : m.role,
    content: m.content,
  })));

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages: allMessages, temperature: 0.7, max_tokens: 2048 }),
    });
  } catch {
    throw new Error('📡 網路連線失敗，請確認手機已連接網路，然後再試。');
  }

  if (!res.ok) {
    let errMsg = '';
    try { const err = await res.json(); errMsg = err.error?.message || ''; } catch {}
    if (res.status === 402) throw new Error('💳 DeepSeek 帳戶餘額不足，請前往 platform.deepseek.com 儲值後再試。');
    if (res.status === 401) throw new Error('🔑 DeepSeek API Key 無效，請到「⚙️ 設置」重新填寫正確的密鑰。');
    if (res.status === 429) throw new Error('⏳ DeepSeek 請求太頻繁，請稍等幾秒鐘再試。');
    throw new Error(translateApiError(errMsg, res.status));
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('❌ DeepSeek 返回了空回覆，請重試。');
  return text;
}

// ─── 功能 1：根據原始文字 + 模板，生成結構化總結 ──────────

export async function generateSummary(rawText, templatePrompt) {
  const systemPrompt = `你是一個專業的個人成長助手，幫助用戶整理和反思日常記錄。
請用繁體中文回答。輸出要結構清晰、重點突出，使用粗體標記重要內容。
今天的日期和時間是：${new Date().toLocaleString('zh-TW')}`;

  const userMessage = `以下是用戶的語音記錄（可能有口語化表達，請自動修正）：

---
${rawText}
---

${templatePrompt}

注意：
1. 嚴格按照模板格式輸出
2. **快速摘要**必須在15字以內，是整篇記錄最精華的一句話
3. 如果原文信息不夠填某個欄位，寫「（待補充）」`;

  return callGemini([{ role: 'user', content: userMessage }], systemPrompt);
}

// ─── 功能 2：從總結中提取快速摘要（一行預覽）────────────────

export function extractPreview(summaryText) {
  // 找到「快速摘要」行
  const match = summaryText.match(/快速摘要[（(]15字內[）)]?\s*\n([^\n]+)/);
  if (match) return match[1].trim().replace(/^[*_]+|[*_]+$/g, '');

  // 如果沒有找到，取第一行非空內容（去掉 markdown）
  const lines = summaryText.split('\n')
    .map((l) => l.replace(/[*_#>-]/g, '').trim())
    .filter(Boolean);
  return lines[0]?.slice(0, 25) || '（無摘要）';
}

// ─── 功能 3：AI 對話（針對某條記錄的追問）───────────────────

export async function chatWithEntry(entry, conversationHistory, userMessage) {
  const systemPrompt = `你是用戶的個人成長助手。
用戶有一條日記記錄，你需要根據這條記錄和用戶對話，幫助用戶深度反思、找到改進方案。
請用繁體中文回答，回答要具體、有洞見，不要泛泛而談。
今天的日期：${new Date().toLocaleDateString('zh-TW')}

【這條記錄的內容】
分類：${entry.categoryName || '未分類'}
時間：${new Date(entry.createdAt).toLocaleString('zh-TW')}
原始記錄：${entry.rawText || '（無）'}
AI 總結：${entry.summary || '（無）'}`;

  const messages = [...conversationHistory, { role: 'user', content: userMessage }];
  return callGemini(messages, systemPrompt);
}

// ─── 功能 4：對話後一鍵套模板整理 ──────────────────────────

export async function summarizeConversation(conversationHistory, templatePrompt) {
  const systemPrompt = `你是用戶的個人成長助手，請用繁體中文回答。`;

  const convoText = conversationHistory
    .map((m) => `【${m.role === 'user' ? '用戶' : 'AI'}】${m.content}`)
    .join('\n\n');

  const userMessage = `以下是一段對話記錄：

---
${convoText}
---

請把這段對話的核心內容提煉出來，並按照以下模板格式輸出：

${templatePrompt}`;

  return callGemini([{ role: 'user', content: userMessage }], systemPrompt);
}

// ─── 功能 5：AI 自動建議標籤 ────────────────────────────────

export async function suggestTags(text) {
  const prompt = `根據以下文字，用繁體中文生成 3 個簡短標籤（每個2-4字）。
只輸出標籤，用逗號分隔，不要其他內容。

文字：${text.slice(0, 500)}`;

  const result = await callGemini([{ role: 'user', content: prompt }]);
  return result.split(/[,，]/).map((t) => t.trim()).filter(Boolean).slice(0, 3);
}

// ─── 功能 6：錯誤模式分析 ────────────────────────────────────

export async function analyzeErrorPatterns(errorEntries) {
  if (!errorEntries.length) return '暫無錯誤復盤記錄，開始記錄你的第一條錯誤復盤吧！';

  const entriesText = errorEntries.map((e, i) =>
    `[${i + 1}] 時間：${new Date(e.createdAt).toLocaleDateString('zh-TW')}\n內容：${e.summary || e.rawText}`
  ).join('\n\n---\n\n');

  const prompt = `以下是用戶的 ${errorEntries.length} 條錯誤復盤記錄：

${entriesText}

請分析：
1. 找出重複出現的錯誤模式（相似的根本原因）
2. 統計每種模式出現了多少次、最近一次是什麼時候
3. 給出針對性的改進建議

輸出格式：

**📊 錯誤模式分析報告**
共分析了 ${errorEntries.length} 條記錄

**🔁 重複錯誤模式**
1. **[錯誤類型名稱]**（出現 X 次）
   - 最近一次：[日期] [簡述]
   - 改進建議：

**💡 總體建議**
（基於所有模式給出最重要的1-2條建議）`;

  return callGemini([{ role: 'user', content: prompt }]);
}

// ─── 功能 7：週報生成 ────────────────────────────────────────

export async function generateWeeklyReport(entries) {
  if (!entries.length) return '本週暫無記錄。';

  const entriesText = entries.map((e) =>
    `[${new Date(e.createdAt).toLocaleDateString('zh-TW')}][${e.categoryName || '未分類'}] ${e.preview || e.rawText?.slice(0, 100)}`
  ).join('\n');

  const prompt = `以下是用戶本週的 ${entries.length} 條日記記錄：

${entriesText}

請生成一份簡潔的週報，包含：

**📅 本週回顧（${new Date().toLocaleDateString('zh-TW')}）**

**📈 本週亮點**
（這週做得好的 2-3 件事）
1. 
2. 

**📉 本週待改進**
（這週的問題或遺憾）
- 

**🎯 下週行動計劃**
1. 
2. 

**一句話評價本週：**`;

  return callGemini([{ role: 'user', content: prompt }]);
}

// ─── 測試 API Key ────────────────────────────────────────────

export async function testApiKey(apiKey, provider = 'gemini') {
  if (provider === 'deepseek') {
    // DeepSeek 測試
    let res;
    try {
      res = await fetch(`${DEEPSEEK_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: '請回覆「連接成功」三個字' }],
          max_tokens: 20,
        }),
      });
    } catch {
      throw new Error('📡 網路連線失敗，請確認手機已連接網路，然後再試。');
    }
    if (!res.ok) {
      let errMsg = '';
      try { const err = await res.json(); errMsg = err.error?.message || ''; } catch {}
      if (res.status === 402) throw new Error('💳 DeepSeek 帳戶餘額不足，請前往 platform.deepseek.com 儲值後再試。');
      if (res.status === 401) throw new Error('🔑 DeepSeek API Key 無效，請確認正確填寫（以 sk- 開頭）。');
      throw new Error(translateApiError(errMsg, res.status));
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '連接成功✅';
  }

  // Gemini 測試 — 自動嘗試多個模型直到成功
  const failedModels = []; // 記錄每個模型的失敗原因
  for (const model of GEMINI_FALLBACK_MODELS) {
    let res;
    try {
      res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: '請回覆「連接成功」三個字' }] }],
        }),
      });
    } catch {
      throw new Error('📡 網路連線失敗，請確認手機已連接網路，然後再試。');
    }

    if (res.status === 404) {
      failedModels.push(`${model}: HTTP 404（模型不存在或地區不支援）`);
      continue; // 這個模型不可用，試下一個
    }

    if (!res.ok) {
      let errMsg = '';
      try { const err = await res.json(); errMsg = err.error?.message || ''; } catch {}
      // 非 404 錯誤（401/403/400 等）代表 Key 本身有問題，立即拋出
      throw new Error(translateApiError(errMsg, res.status));
    }

    // 成功！把這個可用的模型存起來
    localStorage.setItem('gemini_model', model);
    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '連接成功';
    return `✅ 連接成功（使用 ${model}）：${reply}`;
  }

  // 所有模型都 404 — 提供詳細診斷
  const diagDetail = failedModels.join('\n');
  throw new Error(
    `❌ 所有 Gemini 模型均回傳 404，可能原因：\n` +
    `1. 🕐 API Key 剛建立，請等待 5～15 分鐘後重試\n` +
    `2. 💳 Google 帳號未完成 Billing 設定（需綁定信用卡）\n` +
    `3. 🌐 目前 IP 地區不支援 Gemini API，請使用 VPN\n\n` +
    `診斷詳情：\n${diagDetail}`
  );
}
