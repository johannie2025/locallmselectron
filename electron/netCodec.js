'use strict';
// Sérialisation JSON des réponses entre serveur et clients : les Buffers (PDF) passent en base64.
function encode(v) {
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __b64: Buffer.from(v).toString('base64') };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = encode(v[k]); return o; }
  return v;
}
function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    if (typeof v.__b64 === 'string' && Object.keys(v).length === 1) return new Uint8Array(Buffer.from(v.__b64, 'base64'));
    const o = {}; for (const k of Object.keys(v)) o[k] = decode(v[k]); return o;
  }
  return v;
}
module.exports = { encode, decode };
