/**
 * app.js — 語音日記 App 主邏輯
 * 路由 / 列表 / 新增 / 詳情 / 模板 / 回顧 / 設置 / 備份
 */

import {
  initDB, Entries, Chats, Categories, Templates, Settings,
  exportAllData, importAllData,
} from './db.js';
import {
  generateSummary, extractPreview, chatWithEntry,
  summarizeConversation, suggestTags,
  analyzeErrorPatterns, generateWeeklyReport, testApiKey, getProvider,
} from './ai.js';
import { VoiceRecorder } from './voice.js';
import { DEFAULT_CATEGORIES, DEFAULT_TEMPLATES } from './templates.js';

// ─── 全局狀態 ────────────────────────────────────────────────
const state = {
  view: 'list',
  listMode: 'compact',        // compact | card
  filterCat: null,
  sortBy: 'newest',
  searchKw: '',
  currentEntryId: null,
  currentConvo: [],           // 當前條目的對話歷史
  bulkMode: false,
  selectedIds: new Set(),
  categories: [],
  templates: [],
  newEntry: {
    rawText: '',
    summary: '',
    preview: '',
    categoryId: null,
    templateId: null,
    tags: [],
    importance: 0,
  },
};

// ─── DOM 快取 ────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// ─── 工具函數 ─────────────────────────────────────────────────

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// 彈出確認對話框（自定義，取代醜陋的原生 confirm）
function showConfirm(message, onConfirm, confirmText = '確認刪除', cancelText = '取消') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="text-align:center">
      <div class="modal-handle"></div>
      <div style="font-size:17px;font-weight:700;margin-bottom:10px">⚠️ 確認操作</div>
      <div style="font-size:15px;color:var(--text-2);line-height:1.6;margin-bottom:20px">${message}</div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="confirm-cancel">${cancelText}</button>
        <button class="btn btn-danger" id="confirm-ok">${confirmText}</button>
      </div>
    </div>`;
  overlay.querySelector('#confirm-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#confirm-ok').onclick = () => { overlay.remove(); onConfirm(); };
  document.body.appendChild(overlay);
}


function fmtTime(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function markdownToHtml(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>')
    .replace(/^- \[ \] (.+)$/gm, '<div class="checkbox-item">☐ $1</div>')
    .replace(/^- \[x\] (.+)$/gm, '<div class="checkbox-item">☑ $1</div>')
    .replace(/\n/g, '<br>');
}

function showAiLoading(text = 'AI 正在思考...') {
  const el = document.createElement('div');
  el.className = 'ai-loading-overlay';
  el.id = 'ai-overlay';
  el.innerHTML = `<div class="ai-loading-icon">✨</div><div class="ai-loading-text">${text}</div>`;
  document.body.appendChild(el);
}

function hideAiLoading() {
  $('#ai-overlay')?.remove();
}

function getCatById(id) {
  return state.categories.find((c) => c.id === id);
}

function getTplById(id) {
  return state.templates.find((t) => t.id === id);
}

// ─── 視圖路由 ────────────────────────────────────────────────

function navigate(viewName, data = {}) {
  // 隱藏所有視圖
  $$('.view').forEach((v) => {
    v.style.display = 'none';
    v.classList.remove('active');
  });
  $$('.nav-btn').forEach((b) => b.classList.remove('active'));

  const view = $(`#view-${viewName}`);
  if (!view) return;

  // 顯示目標視圖
  view.style.display = 'flex';
  view.style.flexDirection = 'column';
  view.classList.add('active');

  $(`[data-view="${viewName}"]`)?.classList.add('active');

  state.view = viewName;

  // 頁面初始化
  switch (viewName) {
    case 'list':    renderList(); break;
    case 'new':     initNewEntry(data); break;
    case 'detail':  if (data.id) renderDetail(data.id); break;
    case 'templates': renderTemplates(); break;
    case 'review':  renderReview(); break;
    case 'data':    renderDataPage(); break;
    case 'settings': renderSettings(); break;
  }
}

// ─── 列表頁 ──────────────────────────────────────────────────

async function renderList() {
  await loadCatsAndTpls();

  let entries = await Entries.getAll();

  // 搜索
  if (state.searchKw) {
    const kw = state.searchKw.toLowerCase();
    entries = entries.filter((e) =>
      (e.rawText||'').toLowerCase().includes(kw) ||
      (e.summary||'').toLowerCase().includes(kw) ||
      (e.preview||'').toLowerCase().includes(kw) ||
      (e.tags||[]).some((t) => t.toLowerCase().includes(kw))
    );
  }

  // 分類篩選
  if (state.filterCat) {
    entries = entries.filter((e) => e.categoryId === state.filterCat);
  }

  // 排序
  entries.sort((a, b) => {
    if (state.sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    if (state.sortBy === 'importance') return (b.importance||0) - (a.importance||0);
    return new Date(b.createdAt) - new Date(a.createdAt); // newest
  });

  // 渲染分類篩選條
  renderFilterBar();

  // 渲染條目列表
  const container = $('#entries-list');
  container.innerHTML = '';

  if (!entries.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📔</div>
        <div class="empty-title">${state.searchKw ? '沒有找到相關記錄' : '還沒有記錄'}</div>
        <div class="empty-desc">${state.searchKw ? '換個關鍵詞試試' : '點擊下方 + 開始你的第一條語音記錄'}</div>
      </div>`;
    return;
  }

  if (state.listMode === 'card') {
    entries.forEach((e) => container.appendChild(buildCardEntry(e)));
  } else {
    entries.forEach((e) => container.appendChild(buildCompactEntry(e)));
  }
}

function renderFilterBar() {
  const bar = $('#filter-bar');
  if (!bar) return;
  bar.innerHTML = `
    <button class="filter-chip ${!state.filterCat ? 'active' : ''}" data-cat="">全部</button>
    ${state.categories.map((c) =>
      `<button class="filter-chip ${state.filterCat===c.id ? 'active':''}" data-cat="${c.id}">
        ${c.emoji} ${c.name}
      </button>`
    ).join('')}
  `;
  bar.querySelectorAll('.filter-chip').forEach((btn) => {
    btn.onclick = () => {
      state.filterCat = btn.dataset.cat ? Number(btn.dataset.cat) : null;
      renderList();
    };
  });
}

function buildCompactEntry(e) {
  const cat = getCatById(e.categoryId);
  const stars = '⭐'.repeat(e.importance || 0);
  const div = document.createElement('div');
  div.className = 'entry-compact';
  div.innerHTML = `
    <div class="entry-cb" data-id="${e.id}"></div>
    <div class="dot" style="background:${cat?.color || '#666'}"></div>
    <div style="flex:1; min-width:0">
      <div class="ec-meta">
        <span>${fmtTime(e.createdAt)}</span>
        ${cat ? `<span class="badge badge-cat" style="background:${cat.color}22;color:${cat.color}">${cat.emoji} ${cat.name}</span>` : ''}
      </div>
      <div class="ec-preview">${e.preview || e.rawText?.slice(0,60) || '（無內容）'}</div>
    </div>
    ${stars ? `<div class="ec-stars">${stars}</div>` : ''}
  `;
  div.addEventListener('click', (ev) => {
    if (state.bulkMode) { toggleSelect(e.id, div); return; }
    navigate('detail', { id: e.id });
  });
  return div;
}

function buildCardEntry(e) {
  const cat = getCatById(e.categoryId);
  const stars = '⭐'.repeat(e.importance || 0);
  const div = document.createElement('div');
  div.className = 'entry-card';
  div.innerHTML = `
    <div class="ec-header">
      <span class="ec-time">${fmtTime(e.createdAt)}</span>
      ${cat ? `<span class="badge badge-cat ec-cat-badge" style="background:${cat.color}22;color:${cat.color}">${cat.emoji} ${cat.name}</span>` : ''}
      ${stars ? `<span style="margin-left:4px">${stars}</span>` : ''}
    </div>
    <div class="ec-body">
      <div class="ec-preview-card">${e.preview || e.rawText?.slice(0,80) || '（無內容）'}</div>
      <div class="ec-tags">
        ${(e.tags||[]).map((t) => `<span class="badge badge-tag">#${t}</span>`).join('')}
      </div>
    </div>
    <div class="ec-footer">
      ${e.chatCount ? `<span class="chat-count">💬 ${e.chatCount} 條對話</span>` : ''}
      <span style="margin-left:auto; color:var(--text-3); font-size:12px">查看詳情 →</span>
    </div>
  `;
  div.addEventListener('click', () => navigate('detail', { id: e.id }));
  return div;
}

function toggleSelect(id, el) {
  if (state.selectedIds.has(id)) {
    state.selectedIds.delete(id);
    el.querySelector('.entry-cb')?.classList.remove('checked');
  } else {
    state.selectedIds.add(id);
    el.querySelector('.entry-cb')?.classList.add('checked');
  }
  updateBulkBar();
}

function updateBulkBar() {
  const bar = $('#bulk-bar');
  if (!bar) return;
  if (state.selectedIds.size > 0) {
    bar.classList.add('show');
    $('#bulk-count').textContent = `已選 ${state.selectedIds.size} 條`;
  } else {
    bar.classList.remove('show');
  }
}

// ─── 新增記錄頁 ──────────────────────────────────────────────

let voiceRecorder = null;

function initNewEntry(data = {}) {
  // 重置狀態
  state.newEntry = { rawText:'', summary:'', preview:'', categoryId:null, templateId:null, tags:[], importance:0 };

  const textArea = $('#raw-text-area');
  if (textArea) textArea.value = '';

  renderCategoryChips();
  renderTemplateChips();
  clearAiResult();
  renderTagsInput();
  renderImportanceBtns();

  // 初始化語音識別
  if (voiceRecorder) {
    voiceRecorder.stop();
  }
  voiceRecorder = new VoiceRecorder({
    onStart: () => {
      $('#voice-btn').classList.add('recording');
      $('#voice-hint').textContent = '點擊停止錄音';
    },
    onResult: (final, interim) => {
      state.newEntry.rawText = final;
      const ta = $('#raw-text-area');
      if (ta) ta.value = final + (interim ? ` ${interim}` : '');
    },
    onEnd: () => {
      $('#voice-btn').classList.remove('recording');
      $('#voice-hint').textContent = '點擊開始語音輸入';
    },
    onError: (err) => {
      toast(`語音識別錯誤：${err}`, 'error');
      $('#voice-btn').classList.remove('recording');
    },
  });
}

function renderCategoryChips() {
  const wrap = $('#cat-chips');
  if (!wrap) return;
  wrap.innerHTML = state.categories.map((c) =>
    `<button class="template-chip" data-cat-id="${c.id}">
      ${c.emoji} ${c.name}
    </button>`
  ).join('');

  wrap.querySelectorAll('.template-chip').forEach((btn) => {
    btn.onclick = () => {
      state.newEntry.categoryId = Number(btn.dataset.catId);
      state.newEntry.templateId = null;
      wrap.querySelectorAll('.template-chip').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      renderTemplateChips();
    };
  });
}

function renderTemplateChips() {
  const wrap = $('#tpl-chips');
  if (!wrap) return;
  const tpls = state.templates.filter(
    (t) => !state.newEntry.categoryId || t.categoryId === state.newEntry.categoryId || t.categoryId == null
  );
  wrap.innerHTML = tpls.map((t) =>
    `<button class="template-chip" data-tpl-id="${t.id}">${t.name}</button>`
  ).join('');

  wrap.querySelectorAll('.template-chip').forEach((btn) => {
    btn.onclick = () => {
      state.newEntry.templateId = Number(btn.dataset.tplId);
      wrap.querySelectorAll('.template-chip').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
  });
}

function clearAiResult() {
  const box = $('#ai-result-box');
  if (box) box.style.display = 'none';
}

function renderTagsInput() {
  const wrap = $('#tags-wrap');
  if (!wrap) return;
  renderTags();
}

function renderTags() {
  const wrap = $('#tags-wrap');
  if (!wrap) return;
  const existing = wrap.querySelector('.tags-input');
  wrap.innerHTML = '';

  state.newEntry.tags.forEach((t) => {
    const span = document.createElement('div');
    span.className = 'tag-item';
    span.innerHTML = `#${t} <button>×</button>`;
    span.querySelector('button').onclick = () => {
      state.newEntry.tags = state.newEntry.tags.filter((x) => x !== t);
      renderTags();
    };
    wrap.appendChild(span);
  });

  const input = document.createElement('input');
  input.className = 'tags-input';
  input.placeholder = '輸入標籤 Enter 添加';
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = input.value.trim().replace(/^#/, '');
      if (val && !state.newEntry.tags.includes(val)) {
        state.newEntry.tags.push(val);
        renderTags();
      } else { input.value = ''; }
    }
  });
  wrap.appendChild(input);
}

function renderImportanceBtns() {
  const wrap = $('#importance-wrap');
  if (!wrap) return;
  [0,1,2,3].forEach((n) => {
    const btn = wrap.querySelector(`[data-imp="${n}"]`);
    if (!btn) return;
    btn.classList?.remove('selected');
  });
}

// AI 生成總結
async function handleAiGenerate() {
  const ta = $('#raw-text-area');
  const text = ta?.value?.trim() || state.newEntry.rawText?.trim();
  if (!text) { toast('請先輸入或錄製內容', 'error'); return; }

  const tpl = getTplById(state.newEntry.templateId);
  if (!tpl) { toast('請先選擇模板', 'error'); return; }

  state.newEntry.rawText = text;

  showAiLoading('AI 正在套用模板整理...');
  try {
    const summary = await generateSummary(text, tpl.aiPrompt);
    state.newEntry.summary = summary;
    state.newEntry.preview = extractPreview(summary);

    const box = $('#ai-result-box');
    if (box) {
      box.style.display = 'block';
      const content = box.querySelector('.ai-result-content');
      if (content) content.innerHTML = markdownToHtml(summary);
    }

    // 自動建議標籤
    if (!state.newEntry.tags.length) {
      const tags = await suggestTags(text);
      state.newEntry.tags = tags;
      renderTags();
    }

    toast('✨ AI 總結完成', 'success');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    hideAiLoading();
  }
}

// 保存記錄
async function handleSaveEntry() {
  const rawText = $('#raw-text-area')?.value?.trim() || state.newEntry.rawText;
  if (!rawText && !state.newEntry.summary) {
    toast('請輸入內容', 'error'); return;
  }

  const cat = state.newEntry.categoryId
    ? getCatById(state.newEntry.categoryId)
    : null;

  try {
    const id = await Entries.add({
      rawText,
      summary:    state.newEntry.summary,
      preview:    state.newEntry.preview || rawText.slice(0, 30),
      categoryId: state.newEntry.categoryId,
      categoryName: cat?.name || null,
      templateId: state.newEntry.templateId,
      tags:       state.newEntry.tags,
      importance: state.newEntry.importance || 0,
      chatCount:  0,
    });
    toast('✅ 記錄已保存', 'success');
    navigate('list');
  } catch (e) {
    toast('保存失敗：' + e.message, 'error');
  }
}

// ─── 詳情頁 ──────────────────────────────────────────────────

async function renderDetail(id) {
  const entry = await Entries.get(id);
  if (!entry) return;

  state.currentEntryId = id;
  state.currentConvo = [];

  const cat = getCatById(entry.categoryId);
  const stars = '⭐'.repeat(entry.importance || 0);

  // 頂部
  const title = $('#detail-topbar-title');
  if (title) title.textContent = cat ? `${cat.emoji} ${cat.name}` : '記錄詳情';

  // 元信息
  const meta = $('#detail-meta');
  if (meta) {
    meta.innerHTML = `
      <span style="font-size:13px;color:var(--text-3)">${fmtTime(entry.createdAt)}</span>
      ${cat ? `<span class="badge badge-cat" style="background:${cat.color}22;color:${cat.color}">${cat.emoji} ${cat.name}</span>` : ''}
      ${stars ? `<span>${stars}</span>` : ''}
      ${(entry.tags||[]).map((t) => `<span class="badge badge-tag">#${t}</span>`).join('')}
    `;
  }

  // 正文（AI 總結優先，沒有則顯示原始文字）
  const content = $('#detail-content');
  if (content) {
    if (entry.summary) {
      content.innerHTML = `<div class="md-render">${markdownToHtml(entry.summary)}</div>`;
    } else {
      content.innerHTML = `<div style="color:var(--text-2)">${entry.rawText || '（無內容）'}</div>`;
    }
    if (entry.rawText && entry.summary) {
      content.innerHTML += `
        <details style="margin-top:14px">
          <summary style="font-size:13px;color:var(--text-3);cursor:pointer;padding:6px 0">📝 查看原始記錄</summary>
          <div style="margin-top:8px;font-size:14px;color:var(--text-3);line-height:1.7">${entry.rawText}</div>
        </details>`;
    }
  }

  // 加載對話歷史
  const chats = await Chats.getByEntry(id);
  state.currentConvo = chats.map((c) => ({ role: c.role, content: c.content }));
  renderChatMessages();
}

function renderChatMessages() {
  const wrap = $('#chat-messages');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!state.currentConvo.length) {
    wrap.innerHTML = `
      <div style="text-align:center;padding:20px;color:var(--text-3);font-size:13px">
        選中文字或直接輸入問題，與 AI 深入探討這條記錄
      </div>`;
    return;
  }

  state.currentConvo.forEach((m) => {
    const div = document.createElement('div');
    div.className = `chat-msg ${m.role}`;
    div.innerHTML = `
      <div class="chat-bubble">${m.role === 'ai'
        ? markdownToHtml(m.content)
        : m.content.replace(/</g, '&lt;')
      }</div>`;
    wrap.appendChild(div);
  });

  wrap.scrollTop = wrap.scrollHeight;
}

async function handleChatSend() {
  const input = $('#chat-input');
  const msg = input?.value?.trim();
  if (!msg || !state.currentEntryId) return;

  input.value = '';
  state.currentConvo.push({ role: 'user', content: msg });
  renderChatMessages();

  // 保存用戶消息
  await Chats.add(state.currentEntryId, 'user', msg);

  showAiLoading('AI 思考中...');
  try {
    const entry = await Entries.get(state.currentEntryId);
    const cat = getCatById(entry.categoryId);
    const aiReply = await chatWithEntry(
      { ...entry, categoryName: cat?.name },
      state.currentConvo.slice(0, -1),
      msg
    );
    state.currentConvo.push({ role: 'ai', content: aiReply });
    renderChatMessages();

    // 保存 AI 回覆
    await Chats.add(state.currentEntryId, 'ai', aiReply);

    // 更新對話數
    await Entries.update(state.currentEntryId, { chatCount: (entry.chatCount||0) + 1 });

  } catch (e) {
    toast(e.message, 'error');
  } finally {
    hideAiLoading();
  }
}

// 對話後一鍵套模板
async function handleApplyTemplate() {
  if (!state.currentConvo.length) {
    toast('還沒有對話內容', 'error'); return;
  }

  const entry = await Entries.get(state.currentEntryId);
  const tpls = state.templates.filter(
    (t) => !entry.categoryId || t.categoryId === entry.categoryId || t.categoryId == null
  );

  if (!tpls.length) {
    toast('找不到相關模板', 'error'); return;
  }

  // 如果只有一個模板直接用，否則彈選擇
  const tpl = tpls.length === 1 ? tpls[0] : await selectTemplate(tpls);
  if (!tpl) return;

  showAiLoading('正在整理對話並套用模板...');
  try {
    const summary = await summarizeConversation(state.currentConvo, tpl.aiPrompt);
    const preview = extractPreview(summary);

    // 更新記錄
    await Entries.update(state.currentEntryId, { summary, preview });
    toast('✅ 模板已套用，總結已更新', 'success');

    // 刷新詳情頁
    renderDetail(state.currentEntryId);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    hideAiLoading();
  }
}

// 選擇模板（彈窗）
function selectTemplate(tpls) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-handle"></div>
        <div class="modal-title">選擇套用的模板</div>
        ${tpls.map((t) => `
          <div class="settings-item" data-tpl-id="${t.id}" style="cursor:pointer;border-radius:var(--radius-sm);margin-bottom:6px;background:var(--surface2)">
            <div class="settings-info">
              <div class="settings-label">${t.name}</div>
            </div>
            <div class="settings-arrow">→</div>
          </div>`).join('')}
        <button class="btn btn-ghost btn-block" id="tpl-cancel">取消</button>
      </div>`;

    overlay.querySelectorAll('[data-tpl-id]').forEach((el) => {
      el.onclick = () => {
        const tpl = tpls.find((t) => t.id === Number(el.dataset.tplId));
        overlay.remove();
        resolve(tpl);
      };
    });
    overlay.querySelector('#tpl-cancel').onclick = () => {
      overlay.remove(); resolve(null);
    };
    document.body.appendChild(overlay);
  });
}

// ─── 模板管理頁 ──────────────────────────────────────────────

async function renderTemplates() {
  await loadCatsAndTpls();

  const container = $('#templates-list');
  if (!container) return;
  container.innerHTML = '';

  // 按分類分組
  const groups = [
    { cat: null, name: '通用模板', emoji: '📄' },
    ...state.categories.map((c) => ({ cat: c.id, name: c.name, emoji: c.emoji, color: c.color })),
  ];

  groups.forEach((g) => {
    const tpls = state.templates.filter((t) =>
      g.cat === null ? t.categoryId == null : t.categoryId === g.cat
    );
    if (!tpls.length) return;

    const section = document.createElement('div');
    section.className = 'template-group';
    section.innerHTML = `
      <div class="template-group-header">
        <span>${g.emoji}</span>
        <span>${g.name}</span>
        <span class="badge badge-tag">${tpls.length}</span>
      </div>
      ${tpls.map((t) => `
        <div class="template-item" data-tpl-id="${t.id}">
          <div class="template-item-info">
            <div class="template-item-name">${t.name}</div>
            <div class="template-item-sub">使用次數：${t.useCount||0}</div>
          </div>
          <div class="template-item-actions">
            <button class="icon-btn edit-tpl" data-id="${t.id}" title="編輯">✏️</button>
            ${!t.isDefault ? `<button class="icon-btn danger del-tpl" data-id="${t.id}" title="刪除">🗑️</button>` : ''}
          </div>
        </div>`).join('')}
    `;
    container.appendChild(section);
  });

  // 事件
  container.querySelectorAll('.edit-tpl').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      showTemplateEditor(Number(btn.dataset.id));
    };
  });
  container.querySelectorAll('.del-tpl').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      showConfirm(
        '確認要刪除這個模板嗎？',
        async () => {
          await Templates.delete(Number(btn.dataset.id));
          await loadCatsAndTpls();
          renderTemplates();
          toast('模板已刪除', 'info');
        },
        '確認刪除'
      );
    };
  });
}

function showTemplateEditor(id = null) {
  const tpl = id ? getTplById(id) : null;
  const cats = state.categories;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-title">${id ? '編輯模板' : '新增模板'}</div>
      <div class="input-group">
        <label class="input-label">模板名稱</label>
        <input class="input" id="tpl-name-input" placeholder="例：深度事件分析" value="${tpl?.name||''}">
      </div>
      <div class="input-group">
        <label class="input-label">所屬分類</label>
        <select class="input" id="tpl-cat-select">
          <option value="">通用（所有分類可用）</option>
          ${cats.map((c) => `<option value="${c.id}" ${tpl?.categoryId===c.id?'selected':''}>${c.emoji} ${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="input-group">
        <label class="input-label">AI 提示詞（告訴 AI 如何填寫模板）</label>
        <textarea class="textarea" id="tpl-prompt-input" rows="6" placeholder="例：請根據輸入內容，按照以下格式整理...">${tpl?.aiPrompt||''}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="tpl-cancel">取消</button>
        <button class="btn btn-primary" id="tpl-save">保存</button>
      </div>
    </div>`;

  overlay.querySelector('#tpl-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#tpl-save').onclick = async () => {
    const name = overlay.querySelector('#tpl-name-input').value.trim();
    const catId = overlay.querySelector('#tpl-cat-select').value;
    const prompt = overlay.querySelector('#tpl-prompt-input').value.trim();

    if (!name || !prompt) { toast('請填寫名稱和提示詞', 'error'); return; }

    const data = { name, categoryId: catId ? Number(catId) : null, aiPrompt: prompt, template: '' };
    if (id) {
      await Templates.update(id, data);
    } else {
      await Templates.add(data);
    }

    overlay.remove();
    await loadCatsAndTpls();
    renderTemplates();
    toast('模板已保存 ✅', 'success');
  };

  document.body.appendChild(overlay);
}

// ─── 回顧頁 ──────────────────────────────────────────────────

async function renderReview() {
  const today = new Date();
  const monthDay = `${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  // 更新日期顯示
  const dateEl = $('#review-date');
  if (dateEl) dateEl.textContent = today.toLocaleDateString('zh-TW', { year:'numeric', month:'long', day:'numeric', weekday:'long' });

  // 歷史上的今天
  const historical = await Entries.getHistoricalOnDate(monthDay);
  const pastEntries = historical.filter((e) => fmtDate(e.createdAt) !== fmtDate(today.toISOString()));

  const historyWrap = $('#history-today-list');
  if (historyWrap) {
    if (!pastEntries.length) {
      historyWrap.innerHTML = '<div style="padding:14px;color:var(--text-3);font-size:14px">暫無歷史上的今天記錄</div>';
    } else {
      historyWrap.innerHTML = pastEntries.map((e) => {
        const cat = getCatById(e.categoryId);
        return `
          <div class="review-entry-item" data-id="${e.id}">
            <div class="dot" style="background:${cat?.color||'#666'};width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:6px"></div>
            <div>
              <div style="font-size:12px;color:var(--text-3)">${fmtDate(e.createdAt)} · ${cat?.name||'未分類'}</div>
              <div style="font-size:14px;color:var(--text);margin-top:2px">${e.preview||e.rawText?.slice(0,50)||'...'}</div>
            </div>
          </div>`;
      }).join('');

      historyWrap.querySelectorAll('.review-entry-item').forEach((el) => {
        el.onclick = () => navigate('detail', { id: Number(el.dataset.id) });
      });
    }
  }
}

// ─── 數據管理頁 ──────────────────────────────────────────────

async function renderDataPage() {
  const entries = await Entries.getAll();
  const cats = await Categories.getAll();

  const numEl = $('#stat-entries');
  if (numEl) numEl.textContent = entries.length;

  const dayEl = $('#stat-days');
  if (dayEl && entries.length) {
    const dates = new Set(entries.map((e) => fmtDate(e.createdAt)));
    dayEl.textContent = dates.size;
  }
}

async function handleExportBackup() {
  showAiLoading('打包備份數據...');
  try {
    const data = await exportAllData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journal_backup_${fmtDate(new Date().toISOString())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`✅ 已導出 ${data.data.entries.length} 條記錄`, 'success');
  } catch (e) {
    toast('導出失敗：' + e.message, 'error');
  } finally {
    hideAiLoading();
  }
}

async function handleImportBackup(file, mode) {
  if (!file) return;
  showAiLoading('正在導入...');
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    if (!backup.data) throw new Error('備份文件格式不正確，請選擇之前從本 App 導出的 .json 備份文件');

    const count = await importAllData(backup, mode);
    await loadCatsAndTpls();
    toast(`✅ 成功導入 ${count} 條記錄`, 'success');
    navigate('list');
  } catch (e) {
    toast('導入失敗：' + e.message, 'error');
  } finally {
    hideAiLoading();
  }
}

function showImportModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-title">📥 導入備份</div>
      <div style="font-size:14px;color:var(--text-2);margin-bottom:16px;line-height:1.6">
        選擇之前導出的 <code style="background:var(--surface2);padding:2px 6px;border-radius:4px">.json</code> 備份文件
      </div>
      <div class="input-group">
        <label class="input-label">恢復模式</label>
        <select class="input" id="import-mode">
          <option value="merge">合併模式（保留現有數據，只加入備份中的新內容）</option>
          <option value="overwrite">覆蓋模式（清空現有數據，完全還原備份）</option>
        </select>
      </div>
      <input type="file" id="import-file" accept=".json" style="display:none">
      <div class="modal-actions">
        <button class="btn btn-secondary" id="import-cancel">取消</button>
        <button class="btn btn-primary" id="import-choose">選擇文件</button>
      </div>
      <div style="font-size:12px;color:var(--red);margin-top:10px;display:none" id="overwrite-warning">
        ⚠️ 覆蓋模式會清空所有現有數據，此操作不可撤銷！
      </div>
    </div>`;

  overlay.querySelector('#import-mode').onchange = (e) => {
    overlay.querySelector('#overwrite-warning').style.display =
      e.target.value === 'overwrite' ? 'block' : 'none';
  };
  overlay.querySelector('#import-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#import-choose').onclick = () => {
    overlay.querySelector('#import-file').click();
  };
  overlay.querySelector('#import-file').onchange = (e) => {
    const file = e.target.files[0];
    const mode = overlay.querySelector('#import-mode').value;
    overlay.remove();
    handleImportBackup(file, mode);
  };

  document.body.appendChild(overlay);
}

// ─── 設置頁 ──────────────────────────────────────────────────

async function renderSettings() {
  const provider = getProvider();
  const apiKey = localStorage.getItem('gemini_api_key') || '';
  const dsKey = localStorage.getItem('deepseek_api_key') || '';
  const model = localStorage.getItem('gemini_model') || 'gemini-2.0-flash';

  const keyEl = $('#api-key-value');
  if (keyEl) keyEl.textContent = apiKey ? '已設置 ✅' : '未設置';

  const modelEl = $('#model-value');
  if (modelEl) modelEl.textContent = model;

  // 更新 provider 顯示
  const providerEl = $('#provider-value');
  if (providerEl) {
    providerEl.textContent = provider === 'deepseek'
      ? `🤖 DeepSeek${dsKey ? ' ✅' : ' ❌未設置'}`
      : `✨ Gemini Flash${apiKey ? ' ✅' : ' ❌未設置'}`;
  }

  const entries = await Entries.getAll();
  const statEl = $('#stats-value');
  if (statEl) {
    const days = new Set(entries.map((e) => fmtDate(e.createdAt))).size;
    statEl.textContent = `${entries.length} 條 · ${days} 天`;
  }
}

function showApiKeyModal() {
  const current = localStorage.getItem('gemini_api_key') || '';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-title">🔑 設置 Gemini API Key</div>
      <div style="font-size:13px;color:var(--text-2);margin-bottom:14px;line-height:1.7">
        免費獲取：訪問 <strong>aistudio.google.com</strong><br>
        → 點擊「Get API key」→ 複製 key → 貼到下方
      </div>
      <div class="input-group">
        <input class="input" id="api-key-input" type="text" placeholder="AIza..." value="${current}">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="key-cancel">取消</button>
        <button class="btn btn-teal" id="key-test">測試</button>
        <button class="btn btn-primary" id="key-save">保存</button>
      </div>
    </div>`;

  overlay.querySelector('#key-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#key-save').onclick = () => {
    const key = overlay.querySelector('#api-key-input').value.trim();
    if (!key) { toast('請輸入 API Key', 'error'); return; }
    localStorage.setItem('gemini_api_key', key);
    overlay.remove();
    renderSettings();
    toast('API Key 已保存', 'success');
  };
  overlay.querySelector('#key-test').onclick = async () => {
    const key = overlay.querySelector('#api-key-input').value.trim();
    if (!key) { toast('請輸入 API Key', 'error'); return; }
    showAiLoading('測試連接...');
    try {
      localStorage.setItem('gemini_api_key', key);
      const r = await testApiKey(key, 'gemini');
      toast('🎉 Gemini 連接成功：' + r, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      hideAiLoading();
    }
  };

  document.body.appendChild(overlay);
}

// DeepSeek 設置彈窗
function showDeepSeekModal() {
  const provider = getProvider();
  const currentKey = localStorage.getItem('deepseek_api_key') || '';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-title">🤖 DeepSeek AI 設置</div>
      <div style="font-size:13px;color:var(--text-2);margin-bottom:14px;line-height:1.7">
        免費📝 申請：<strong>platform.deepseek.com</strong><br>
        → 註冊 → API Keys → Create → 複製 <code style="background:var(--surface2);padding:2px 6px;border-radius:4px">sk-...</code> 貼到下方<br>
        💰 儲值最低 <strong>$2 美元（約 ¥15）</strong>，夠用幾千篇日記
      </div>
      <div class="input-group">
        <label class="input-label">DeepSeek API Key</label>
        <input class="input" id="ds-key-input" type="text" placeholder="sk-..." value="${currentKey}">
      </div>
      <div class="input-group">
        <label class="input-label">目前使用的 AI 提供商</label>
        <select class="input" id="ds-provider-select">
          <option value="gemini" ${provider !== 'deepseek' ? 'selected' : ''}>✨ Gemini Flash（免費，每分鐘有次數限制）</option>
          <option value="deepseek" ${provider === 'deepseek' ? 'selected' : ''}>🤖 DeepSeek（付費，幾乎無限制，超便宜）</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="ds-cancel">取消</button>
        <button class="btn btn-teal" id="ds-test">測試連接</button>
        <button class="btn btn-primary" id="ds-save">保存</button>
      </div>
    </div>`;

  overlay.querySelector('#ds-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#ds-save').onclick = () => {
    const key = overlay.querySelector('#ds-key-input').value.trim();
    const prov = overlay.querySelector('#ds-provider-select').value;
    if (prov === 'deepseek' && !key) {
      toast('切換到 DeepSeek 請先填入 API Key', 'error'); return;
    }
    if (key) localStorage.setItem('deepseek_api_key', key);
    localStorage.setItem('ai_provider', prov);
    overlay.remove();
    renderSettings();
    const provName = prov === 'deepseek' ? '🤖 DeepSeek' : '✨ Gemini Flash';
    toast(`已切換到 ${provName}`, 'success');
  };
  overlay.querySelector('#ds-test').onclick = async () => {
    const key = overlay.querySelector('#ds-key-input').value.trim();
    if (!key) { toast('請先填入 DeepSeek API Key', 'error'); return; }
    showAiLoading('測試 DeepSeek 連接...');
    try {
      localStorage.setItem('deepseek_api_key', key);
      const r = await testApiKey(key, 'deepseek');
      toast('🎉 DeepSeek 連接成功！' + r, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      hideAiLoading();
    }
  };

  document.body.appendChild(overlay);
}

// ─── 錯誤模式分析 ────────────────────────────────────────────

async function handleErrorAnalysis() {
  const all = await Entries.getAll();
  const errorCat = state.categories.find((c) => c.name.includes('錯誤'));
  const errorEntries = errorCat
    ? all.filter((e) => e.categoryId === errorCat.id)
    : all.filter((e) => (e.tags||[]).some((t) => t.includes('錯誤')));

  showAiLoading('AI 分析錯誤模式...');
  try {
    const result = await analyzeErrorPatterns(errorEntries);
    showResultModal('🔁 錯誤模式分析', result);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    hideAiLoading();
  }
}

async function handleWeeklyReport() {
  const now = new Date();
  const weekAgo = new Date(now - 7 * 86400000).toISOString();
  const all = await Entries.getAll();
  const weekEntries = all.filter((e) => e.createdAt >= weekAgo);

  showAiLoading('AI 生成週報...');
  try {
    const result = await generateWeeklyReport(weekEntries.map((e) => ({
      ...e,
      categoryName: getCatById(e.categoryId)?.name
    })));
    showResultModal('📅 本週回顧', result);
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    hideAiLoading();
  }
}

function showResultModal(title, content) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-height:85vh">
      <div class="modal-handle"></div>
      <div class="modal-title">${title}</div>
      <div class="ai-result-content md-render" style="max-height:65vh;overflow-y:auto">
        ${markdownToHtml(content)}
      </div>
      <div style="margin-top:16px">
        <button class="btn btn-secondary btn-block" id="result-close">關閉</button>
      </div>
    </div>`;
  overlay.querySelector('#result-close').onclick = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ─── 初始化 ──────────────────────────────────────────────────

async function loadCatsAndTpls() {
  state.categories = await Categories.getAll();
  state.templates = await Templates.getAll();
}

async function seedDefaultData() {
  const cats = await Categories.getAll();
  if (cats.length) return; // 已有數據，跳過

  // 插入默認分類（帶固定 id）
  const store = indexedDB.open('VoiceJournalDB');
  // 用普通方式插入
  for (const cat of DEFAULT_CATEGORIES) {
    try { await Categories.add(cat); } catch {}
  }
  for (const tpl of DEFAULT_TEMPLATES) {
    try { await Templates.add(tpl); } catch {}
  }
}

// 設置所有事件監聽
function setupEventListeners() {
  // 底部導航
  $$('.nav-btn[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });

  // 新增按鈕
  $('#nav-add-btn')?.addEventListener('click', () => navigate('new'));

  // 返回按鈕（頂部）
  $$('.back-btn').forEach((btn) => {
    btn.addEventListener('click', () => navigate('list'));
  });

  // 列表視圖切換
  $('#toggle-compact')?.addEventListener('click', () => {
    state.listMode = 'compact';
    localStorage.setItem('listMode', 'compact');
    $('#toggle-compact').classList.add('active');
    $('#toggle-card').classList.remove('active');
    renderList();
  });
  $('#toggle-card')?.addEventListener('click', () => {
    state.listMode = 'card';
    localStorage.setItem('listMode', 'card');
    $('#toggle-card').classList.add('active');
    $('#toggle-compact').classList.remove('active');
    renderList();
  });

  // 排序
  $('#sort-select')?.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    renderList();
  });

  // 搜索
  let searchTimer;
  $('#search-input')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.searchKw = e.target.value;
      renderList();
    }, 300);
  });

  // 新增頁：語音按鈕
  $('#voice-btn')?.addEventListener('click', () => voiceRecorder?.toggle());

  // 新增頁：原始文字手動輸入
  $('#raw-text-area')?.addEventListener('input', (e) => {
    state.newEntry.rawText = e.target.value;
  });

  // AI 生成按鈕
  $('#ai-generate-btn')?.addEventListener('click', handleAiGenerate);

  // 重新生成
  $('#ai-regenerate-btn')?.addEventListener('click', handleAiGenerate);

  // 保存記錄
  $('#save-entry-btn')?.addEventListener('click', handleSaveEntry);

  // 重要程度按鈕
  $$('.imp-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = Number(btn.dataset.imp);
      state.newEntry.importance = val;
      $$('.imp-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // 詳情頁：對話發送
  $('#chat-send-btn')?.addEventListener('click', handleChatSend);
  $('#chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  });

  // 詳情頁：一鍵套模板
  $('#apply-template-btn')?.addEventListener('click', handleApplyTemplate);

  // 詳情頁：刪除
  $('#delete-entry-btn')?.addEventListener('click', () => {
    showConfirm(
      '刪除後無法恢復，連同所有 AI 對話紀錄一起刪除。',
      async () => {
        await Entries.delete(state.currentEntryId);
        toast('已刪除', 'info');
        navigate('list');
      },
      '確認刪除'
    );
  });


  // 模板頁：新增模板
  $('#add-template-btn')?.addEventListener('click', () => showTemplateEditor(null));

  // 回顧頁：錯誤分析
  $('#error-analysis-btn')?.addEventListener('click', handleErrorAnalysis);

  // 回顧頁：週報
  $('#weekly-report-btn')?.addEventListener('click', handleWeeklyReport);

  // 數據頁：導出
  $('#export-btn')?.addEventListener('click', handleExportBackup);

  // 數據頁：導入
  $('#import-btn')?.addEventListener('click', showImportModal);

  // 設置頁：API Key
  $('#api-key-item')?.addEventListener('click', showApiKeyModal);

  // 設置頁：DeepSeek / 切換 AI 提供商
  $('#deepseek-item')?.addEventListener('click', showDeepSeekModal);


  // 全選
  const setupSelectAllBtn = (btnId) => {
    $(btnId)?.addEventListener('click', () => {
      if (!state.bulkMode) {
        state.bulkMode = true;
        // 先確保所有 checkbox 可見
        $$('.entry-cb').forEach((cb) => cb.classList.add('show'));
      } else {
        // 全選所有
        const cbs = $$('.entry-cb');
        const allChecked = state.selectedIds.size === cbs.length;
        if (allChecked) {
          state.selectedIds.clear();
          cbs.forEach((cb) => cb.classList.remove('checked'));
        } else {
          cbs.forEach((cb) => {
            const id = Number(cb.dataset.id);
            if (id) { state.selectedIds.add(id); cb.classList.add('checked'); }
          });
        }
        updateBulkBar();
      }
    });
  };
  setupSelectAllBtn('#select-all-btn');
  setupSelectAllBtn('#select-all-btn2');

  // 批量導出
  $('#bulk-export-btn')?.addEventListener('click', async () => {
    if (!state.selectedIds.size) { toast('請先選擇記錄', 'error'); return; }
    const all = await Entries.getAll();
    const selected = all.filter((e) => state.selectedIds.has(e.id));
    const json = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data: { entries: selected, chats:[], categories:[], templates:[], settings:[] } }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `journal_selected_${fmtDate(new Date().toISOString())}.json`;
    a.click();
    toast(`已導出 ${selected.length} 條`, 'success');
  });

  // 讀取保存的視圖偏好
  const savedMode = localStorage.getItem('listMode') || 'compact';
  state.listMode = savedMode;
  if (savedMode === 'card') {
    $('#toggle-card')?.classList.add('active');
    $('#toggle-compact')?.classList.remove('active');
  } else {
    $('#toggle-compact')?.classList.add('active');
  }
}

// ─── 啟動 ────────────────────────────────────────────────────

async function main() {
  await initDB();
  await seedDefaultData();
  await loadCatsAndTpls();

  setupEventListeners();

  // 暴露 navigate 給 HTML 內的 script 調用
  window.__navigate = navigate;

  // 暴露 Markdown 導出
  window.__exportMarkdown = async () => {
    const all = await Entries.getAll();
    const cats = state.categories;
    const lines = all.map((e) => {
      const cat = cats.find((c) => c.id === e.categoryId);
      return [
        `# ${e.preview || '（無標題）'}`,
        `**時間**：${fmtTime(e.createdAt)}`,
        `**分類**：${cat ? cat.emoji + cat.name : '未分類'}`,
        `**標籤**：${(e.tags||[]).map((t)=>'#'+t).join(' ') || '無'}`,
        '',
        e.summary || e.rawText || '（無內容）',
        '',
        '---',
        '',
      ].join('\n');
    });
    const content = `# 語音日記導出\n導出時間：${new Date().toLocaleString('zh-TW')}\n共 ${all.length} 條\n\n---\n\n` + lines.join('\n');
    const blob = new Blob([content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `journal_${fmtDate(new Date().toISOString())}.md`;
    a.click();
    toast(`✅ 已導出 ${all.length} 條記錄為 Markdown`, 'success');
  };

  navigate('list');

  // 註冊 PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

main().catch(console.error);
