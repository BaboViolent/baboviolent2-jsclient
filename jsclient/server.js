#!/usr/bin/env node
// Zero-dependency dev server: serves public/ at / and the repo's Content/ at /content/.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuredServerUrls, probeServers } from './serverList.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = path.join(HERE, 'public');
const CONTENT_ROOT = path.resolve(HERE, '..', 'Content');
const PORT = Number(process.env.PORT) || 8080;
const CLIENT_VERSION = process.env.CLIENT_VERSION || 'development';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.tga': 'application/octet-stream',
  '.bvm': 'application/octet-stream',
  '.dko': 'application/octet-stream',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
};

/** Resolve `urlPath` under `root`, refusing anything that escapes it. */
function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath).split('?')[0];
  const resolved = path.resolve(root, '.' + path.posix.normalize(decoded));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-cache', ...headers });
  res.end(body);
}

async function serveFile(res, filePath) {
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return send(res, 404, 'Not found');
  }
  if (stat.isDirectory()) return serveFile(res, path.join(filePath, 'index.html'));
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(filePath).pipe(res);
}

// Map names are case-sensitive on disk and inconsistent in the wild; list them for the client.
async function listMaps(res) {
  try {
    const names = (await fsp.readdir(path.join(CONTENT_ROOT, 'main', 'maps')))
      .filter((f) => f.toLowerCase().endsWith('.bvm'))
      .sort();
    send(res, 200, JSON.stringify(names), { 'Content-Type': MIME['.json'] });
  } catch (err) {
    send(res, 500, JSON.stringify({ error: String(err) }), { 'Content-Type': MIME['.json'] });
  }
}

async function listServers(res) {
  const servers = await probeServers(configuredServerUrls());
  send(res, 200, JSON.stringify(servers), { 'Content-Type': MIME['.json'] });
}

http
  .createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    const url = req.url.split('?')[0];

    if (url === '/api/maps') return listMaps(res);
    if (url === '/api/servers') return void listServers(res);
    if (url === '/api/version') {
      return send(res, 200, JSON.stringify({ version: CLIENT_VERSION }), {
        'Content-Type': MIME['.json'],
      });
    }

    if (url.startsWith('/content/')) {
      const target = safeJoin(CONTENT_ROOT, url.slice('/content'.length));
      if (!target) return send(res, 403, 'Forbidden');
      return serveFile(res, target);
    }

    const target = safeJoin(PUBLIC_ROOT, url === '/' ? '/index.html' : url);
    if (!target) return send(res, 403, 'Forbidden');
    return serveFile(res, target);
  })
  .listen(PORT, () => {
    console.log(`BV2 js client  ->  http://localhost:${PORT}`);
    console.log(`content root   ->  ${CONTENT_ROOT}`);
  });
