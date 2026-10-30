// Kleine webserver die de map site/ serveert, zodat de tests de app kunnen
// openen zoals een browser dat doet. Start hem met: npm start
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PORT = Number(process.env.PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

http.createServer((req, res) => {
  const vraag = decodeURIComponent((req.url || '/').split('?')[0]);
  const relatief = vraag === '/' ? 'index.html' : vraag.replace(/^\/+/, '');
  const bestand = path.join(ROOT, relatief);

  // niets buiten site/ serveren
  if (!bestand.startsWith(ROOT)) {
    res.writeHead(403).end('Verboden');
    return;
  }
  fs.readFile(bestand, (fout, inhoud) => {
    if (fout) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Niet gevonden');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(bestand)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(inhoud);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`site/ staat op http://127.0.0.1:${PORT}/`);
});
