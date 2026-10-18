'use strict';
const { decode } = require('./netCodec');
const { normalizeAddress } = require('./netStore');

/** Client du serveur du centre (mode « client ») : toutes les fonctions de données passent par le serveur. */
function createNetClient({ store, bootId, fetchImpl = (...a) => fetch(...a) }) {
  const base = () => `http://${store.get().server}`;
  const headers = (extra = {}) => ({ 'X-WLS-Token': store.get().token, 'X-WLS-Boot': bootId, ...extra });
  async function req(p, init = {}, timeout = 15000) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeout);
    try { return await fetchImpl(base() + p, { ...init, signal: ac.signal }); } finally { clearTimeout(t); }
  }
  return {
    /** Renvoie toujours une enveloppe { ok, data | error } (jamais d'exception). */
    async call(channel, args = []) {
      try {
        const r = await req('/wls/rpc', { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ channel, args }) });
        if (r.status === 401) return { ok: false, error: 'NET_UNPAIRED' };
        const j = await r.json();
        return j.ok ? { ok: true, data: decode(j.data) } : { ok: false, error: j.error || 'UNKNOWN' };
      } catch { return { ok: false, error: 'SERVER_UNREACHABLE' }; }
    },
    /** Flux média (Range transmis tel quel) ; lève si le serveur est injoignable. */
    media: (rel, range) => req(`/wls/media?p=${encodeURIComponent(rel)}`, { headers: headers(range ? { Range: range } : {}) }, 30000),
    async state() { try { const r = await req('/wls/state', { headers: headers() }, 5000); return r.ok ? await r.json() : null; } catch { return null; } },
  };
}

/** Jumelage : échange du code à usage unique contre un jeton propre à ce poste. Lève un code d'erreur i18n. */
async function pairWithServer(address, code, name, fetchImpl = (...a) => fetch(...a)) {
  const addr = normalizeAddress(address);
  if (!addr) throw new Error('BAD_ADDRESS');
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 8000);
  let r;
  try { r = await fetchImpl(`http://${addr}/wls/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name }), signal: ac.signal }); }
  catch { throw new Error('SERVER_UNREACHABLE'); } finally { clearTimeout(t); }
  let j = {}; try { j = await r.json(); } catch { /* réponse non JSON */ }
  if (!j.ok) throw new Error(/^[A-Z_]+$/.test(j.error || '') ? j.error : 'SERVER_UNREACHABLE');
  return { server: addr, token: j.token, serverName: j.name };
}

module.exports = { createNetClient, pairWithServer };
