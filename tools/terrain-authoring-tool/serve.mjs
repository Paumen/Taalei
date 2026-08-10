
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const POORT = Number(process.env.POORT ?? 8932);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
};

export function maakServer() {
  return http.createServer((req, res) => {
    let pad = decodeURIComponent(req.url.split('?')[0]);
    if (pad.endsWith('/')) pad += 'index.html';

    const bestand = path.normalize(path.join(ROOT, pad));

    if (!bestand.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }

    try {
      if (!existsSync(bestand) || !statSync(bestand).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(bestand)] ?? 'application/octet-stream' });
      createReadStream(bestand).pipe(res);
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  maakServer().listen(POORT, () => {
    console.log(`terrain authoring tool op http://127.0.0.1:${POORT}/tools/terrain-authoring-tool/`);
  });
}
