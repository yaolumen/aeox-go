const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'demo');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };

http.createServer((req, res) => {
  const file = req.url === '/' ? 'index.html' : req.url.split('?')[0];
  const fp = path.join(DIR, file);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' });
    res.end(data);
  });
}).listen(8080, () => console.log('Demo server: http://localhost:8080'));
