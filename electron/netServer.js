'use strict';
/**
 * Serveur réseau local (mode « serveur ») : expose, aux postes clients jumelés, les mêmes fonctions que celles utilisées
 * par l'interface locale (RPC JSON) + le streaming des vidéos/PDF avec Range. Un poste client = un jeton + une session propre.
 * Transport : HTTP en clair sur le réseau local (pas de TLS) → à réserver à un réseau de confiance, voir docs/RESEAU.md.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { encode } = require('./netCodec');

const MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.pdf': 'application/pdf' };
const MAX_BODY = 8 * 1024 * 1024; // logo en data-URL ≤ 4 Mo, quiz…

function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(Object.assign(new Error('TOO_BIG'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function startNetServer({ store, dispatch, newHolder, mediaPath, treeVersion, port, name = 'Serveur', version = '', log = () => {} }) {
  const sessions = new Map(); // id client → holder de session
  const fails = new Map(); // ip → { n, until } (jumelage)
  const status = { listening: false, port, error: null };
  const ipOf = (req) => String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const send = (res, code, obj) => {
    const b = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(b) });
    res.end(b);
  };
  const auth = (req) => {
    const c = store.findClient(req.headers['x-wls-token']);
    if (!c) return null;
    store.touch(c.id, ipOf(req));
    const boot = String(req.headers['x-wls-boot'] || '');
    let h = sessions.get(c.id);
    if (!h || h.boot !== boot) { h = { ...newHolder(), boot }; sessions.set(c.id, h); } // le client a redémarré : on repart sans session
    return { client: c, holder: h };
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'GET' && url.pathname === '/wls/ping') return send(res, 200, { ok: true, name, version });

      if (req.method === 'POST' && url.pathname === '/wls/pair') {
        const ip = ipOf(req);
        const f = fails.get(ip);
        if (f && f.until > Date.now()) return send(res, 429, { ok: false, error: 'TOO_MANY_ATTEMPTS' });
        let body; try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { ok: false, error: 'BAD_REQUEST' }); }
        if (!store.checkPairCode(body.code)) {
          const n = (f ? f.n : 0) + 1;
          fails.set(ip, n >= 5 ? { n: 0, until: Date.now() + 30000 } : { n, until: 0 });
          return send(res, 403, { ok: false, error: 'BAD_PAIR_CODE' });
        }
        fails.delete(ip);
        const c = store.addClient(body.name, ip);
        log(`net: poste jumelé « ${String(body.name).slice(0, 40)} » (${ip})`);
        return send(res, 200, { ok: true, token: c.token, name, version });
      }

      const a = auth(req);
      if (!a) return send(res, 401, { ok: false, error: 'NET_UNPAIRED' });

      if (req.method === 'GET' && url.pathname === '/wls/state') return send(res, 200, { ok: true, treeVersion: treeVersion() });

      if (req.method === 'POST' && url.pathname === '/wls/rpc') {
        let body; try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, e.status || 400, { ok: false, error: e.status === 413 ? 'TOO_BIG' : 'BAD_REQUEST' }); }
        if (typeof body.channel !== 'string' || body.channel.length > 80 || !Array.isArray(body.args)) return send(res, 400, { ok: false, error: 'BAD_REQUEST' });
        return send(res, 200, encode(await dispatch(body.channel, body.args, a.holder)));
      }

      if (req.method === 'GET' && url.pathname === '/wls/media') {
        const abs = mediaPath(a.holder, url.searchParams.get('p') || '');
        if (!abs) return send(res, 403, { ok: false, error: 'FORBIDDEN' });
        const size = fs.statSync(abs).size;
        const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
        let start = 0; let end = size - 1; let code = 200;
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
        if (m && (m[1] || m[2])) {
          if (m[1] === '') { start = Math.max(0, size - Number(m[2])); } else { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])); }
          if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
          code = 206;
        }
        const h = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' };
        if (code === 206) h['Content-Range'] = `bytes ${start}-${end}/${size}`;
        res.writeHead(code, h);
        return pipeline(fs.createReadStream(abs, { start, end }), res, () => {});
      }
      return send(res, 404, { ok: false, error: 'NOT_FOUND' });
    } catch (e) {
      log(`net: ${e.stack || e.message}`);
      if (!res.headersSent) send(res, 500, { ok: false, error: 'UNKNOWN' }); else res.destroy();
    }
  });
  server.on('error', (e) => { status.listening = false; status.error = e.code || e.message; log(`net: serveur arrêté (${status.error})`); });
  server.listen(port, '0.0.0.0', () => { status.listening = true; log(`net: serveur à l'écoute sur le port ${port}`); });
  return { status: () => ({ ...status, clients: sessions.size }), close: () => new Promise((r) => server.close(() => r())), server };
}

module.exports = { startNetServer };
