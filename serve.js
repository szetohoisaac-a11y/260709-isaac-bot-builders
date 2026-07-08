const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function resolveSafe(root, urlPath) {
  const decoded = decodeURIComponent(String(urlPath).split('?')[0]);
  const rel = decoded === '/' ? '/index.html' : decoded;
  const normRoot = path.resolve(root);
  const full = path.resolve(path.join(normRoot, rel));
  if (full !== normRoot && !full.startsWith(normRoot + path.sep)) return null;
  return full;
}

function start(root = process.cwd(), port = Number(process.env.PORT) || 5050) {
  const server = http.createServer((req, res) => {
    const file = resolveSafe(root, req.url || '/');
    if (!file) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Forbidden');
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<h1>404</h1><p>Not found. Check the file name.</p>');
      }
      res.writeHead(200, { 'Content-Type': contentType(file) });
      res.end(data);
    });
  });
  server.listen(port, () => {
    console.log(`Bot Brawl gallery → http://localhost:${port}`);
  });
  return server;
}

if (require.main === module) start();
module.exports = { contentType, resolveSafe, start };
