// Service Worker — 讓 App 可離線使用
const CACHE_NAME = 'voice-journal-v7';
// 動態計算基礎路徑，相容 root 與 subdirectory 部署（如 GitHub Pages）
const BASE = self.location.pathname.replace(/\/sw\.js$/, '');
const ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/styles.css?v=6`,
  `${BASE}/js/db.js`,
  `${BASE}/js/ai.js`,
  `${BASE}/js/voice.js`,
  `${BASE}/js/templates.js`,
  `${BASE}/js/app.js?v=6`,
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // AI API 請求不走緩存，直接網絡
  if (e.request.url.includes('generativelanguage.googleapis.com')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
