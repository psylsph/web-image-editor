const http = require('http');
const fs = require('fs');
const path = require('path');

const hostname = 'localhost';
const port = 8080;

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(process.cwd(), filePath);

  const extname = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('404: File not found.');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`);
      }
     } else {
       const headers = {
         'Content-Type': contentType,
         'Cross-Origin-Opener-Policy': 'same-origin',
         'Cross-Origin-Embedder-Policy': 'require-corp'
       };
       res.writeHead(200, headers);
       res.end(content, 'utf-8');
     }
  });
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});