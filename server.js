// 簡易本地服務器，用於運行 Voice Journal App
// 運行：node server.js 或 node_modules/.bin/http-server

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const PORT = 3000;

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(__dirname, urlPath);

  if (!fs.existsSync(filePath)) {
    // SPA fallback
    const index = path.join(__dirname, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(index));
    return;
  }

  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'text/plain';
  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
  });
  res.end(fs.readFileSync(filePath));
});

server.listen(PORT, () => {
  console.log(`\n✅ 語音日記 App 已啟動！`);
  console.log(`📱 打開瀏覽器訪問：http://localhost:${PORT}`);
  console.log(`🛑 停止服務器：按 Ctrl+C\n`);
});
