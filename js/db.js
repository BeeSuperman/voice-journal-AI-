/**
 * db.js — IndexedDB 存儲層
 * 所有本地數據的讀寫都通過這個模塊
 */

const DB_NAME = 'VoiceJournalDB';
const DB_VERSION = 1;

let db = null;

// 初始化數據庫
export function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // 日記記錄
      if (!db.objectStoreNames.contains('entries')) {
        const store = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('categoryId', 'categoryId');
        store.createIndex('importance', 'importance');
      }

      // 每條記錄的 AI 對話歷史
      if (!db.objectStoreNames.contains('chats')) {
        const store = db.createObjectStore('chats', { keyPath: 'id', autoIncrement: true });
        store.createIndex('entryId', 'entryId');
      }

      // 分類
      if (!db.objectStoreNames.contains('categories')) {
        const store = db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
        store.createIndex('order', 'order');
      }

      // 模板
      if (!db.objectStoreNames.contains('templates')) {
        const store = db.createObjectStore('templates', { keyPath: 'id', autoIncrement: true });
        store.createIndex('categoryId', 'categoryId');
      }

      // 設置 (key-value)
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── 通用 CRUD 工具 ─────────────────────────────

function tx(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(storeName, indexName, query) {
  return new Promise((resolve, reject) => {
    const store = tx(storeName);
    const req = indexName ? store.index(indexName).getAll(query) : store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Entries ───────────────────────────────────

export const Entries = {
  async add(entry) {
    const now = new Date().toISOString();
    const data = { ...entry, createdAt: now, updatedAt: now };
    const store = tx('entries', 'readwrite');
    return promisify(store.add(data));
  },

  async get(id) {
    return promisify(tx('entries').get(id));
  },

  async getAll() {
    return getAll('entries');
  },

  async update(id, changes) {
    const store = tx('entries', 'readwrite');
    const entry = await promisify(store.get(id));
    if (!entry) throw new Error('找不到這條記錄，可能已被刪除');
    const updated = { ...entry, ...changes, updatedAt: new Date().toISOString() };
    return promisify(store.put(updated));
  },

  async delete(id) {
    // 同時刪除對話記錄
    await Chats.deleteByEntry(id);
    return promisify(tx('entries', 'readwrite').delete(id));
  },

  async search(keyword) {
    const all = await this.getAll();
    const kw = keyword.toLowerCase();
    return all.filter((e) =>
      (e.rawText || '').toLowerCase().includes(kw) ||
      (e.summary || '').toLowerCase().includes(kw) ||
      (e.preview || '').toLowerCase().includes(kw) ||
      (e.tags || []).some((t) => t.toLowerCase().includes(kw))
    );
  },

  // 獲取同一天的歷史記錄（用於回顧）
  async getHistoricalOnDate(monthDay) {
    const all = await this.getAll();
    return all.filter((e) => {
      const d = new Date(e.createdAt);
      const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return md === monthDay;
    });
  },
};

// ─── Chats ─────────────────────────────────────

export const Chats = {
  async add(entryId, role, content) {
    const data = { entryId, role, content, createdAt: new Date().toISOString() };
    return promisify(tx('chats', 'readwrite').add(data));
  },

  async getByEntry(entryId) {
    return getAll('chats', 'entryId', entryId);
  },

  async deleteByEntry(entryId) {
    const all = await this.getByEntry(entryId);
    const store = tx('chats', 'readwrite');
    return Promise.all(all.map((c) => promisify(store.delete(c.id))));
  },
};

// ─── Categories ────────────────────────────────

export const Categories = {
  async add(cat) {
    const all = await this.getAll();
    const data = { ...cat, order: all.length };
    return promisify(tx('categories', 'readwrite').add(data));
  },

  async getAll() {
    const cats = await getAll('categories');
    return cats.sort((a, b) => a.order - b.order);
  },

  async update(id, changes) {
    const store = tx('categories', 'readwrite');
    const cat = await promisify(store.get(id));
    return promisify(store.put({ ...cat, ...changes }));
  },

  async delete(id) {
    return promisify(tx('categories', 'readwrite').delete(id));
  },
};

// ─── Templates ─────────────────────────────────

export const Templates = {
  async add(tpl) {
    return promisify(tx('templates', 'readwrite').add(tpl));
  },

  async getAll() {
    return getAll('templates');
  },

  async getByCategoryId(categoryId) {
    // null categoryId = 通用模板
    const all = await this.getAll();
    return all.filter((t) => t.categoryId === categoryId || t.categoryId == null);
  },

  async update(id, changes) {
    const store = tx('templates', 'readwrite');
    const tpl = await promisify(store.get(id));
    return promisify(store.put({ ...tpl, ...changes }));
  },

  async delete(id) {
    return promisify(tx('templates', 'readwrite').delete(id));
  },
};

// ─── Settings ──────────────────────────────────

export const Settings = {
  async get(key, defaultVal = null) {
    const rec = await promisify(tx('settings').get(key));
    return rec ? rec.value : defaultVal;
  },

  async set(key, value) {
    return promisify(tx('settings', 'readwrite').put({ key, value }));
  },

  async getAll() {
    const all = await getAll('settings');
    return Object.fromEntries(all.map((r) => [r.key, r.value]));
  },
};

// ─── 全量備份 / 恢復 ────────────────────────────

export async function exportAllData() {
  const [entries, chats, categories, templates, settings] = await Promise.all([
    Entries.getAll(),
    getAll('chats'),
    Categories.getAll(),
    Templates.getAll(),
    getAll('settings'),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { entries, chats, categories, templates, settings },
  };
}

export async function importAllData(backup, mode = 'merge') {
  const { entries, chats, categories, templates, settings } = backup.data;

  if (mode === 'overwrite') {
    // 清空所有數據
    await Promise.all(
      ['entries', 'chats', 'categories', 'templates', 'settings'].map((store) =>
        promisify(tx(store, 'readwrite').clear())
      )
    );
  }

  // 重新插入（overwrite 直接插，merge 跳過重複）
  const insertAll = async (storeName, items) => {
    const store = tx(storeName, 'readwrite');
    for (const item of items) {
      if (mode === 'merge') {
        // merge 模式：存在相同 id 的跳過
        try { await promisify(store.add(item)); } catch {}
      } else {
        await promisify(store.put(item));
      }
    }
  };

  await insertAll('categories', categories);
  await insertAll('templates', templates);
  await insertAll('entries', entries);
  await insertAll('chats', chats);
  await insertAll('settings', settings);

  return entries.length;
}
