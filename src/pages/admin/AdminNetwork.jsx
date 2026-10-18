import { useCallback, useEffect, useState } from 'react';
import { api, errText } from '../../api.js';
import { useI18n } from '../../i18n/index.jsx';
import { useUi } from '../../components/ui.jsx';

/** Réseau local (super-administrateur) : poste autonome, serveur du centre, ou client d'un serveur. */
export default function AdminNetwork() {
  const { t, fmtDateTime } = useI18n();
  const { toast, confirm } = useUi();
  const [cfg, setCfg] = useState(null);
  const [mode, setMode] = useState('standalone');
  const [name, setName] = useState('');
  const [port, setPort] = useState(47800);
  const [code, setCode] = useState(null);
  const [pair, setPair] = useState({ server: '', code: '', name: '' });
  const [dirty, setDirty] = useState(false);
  const load = useCallback(async () => {
    const c = await api('net:getConfig');
    setCfg(c); setMode(c.configuredMode); setName(c.name || ''); setPort(c.port);
  }, []);
  useEffect(() => { load().catch((e) => toast(errText(e, t), 'err')); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cfg?.mode !== 'server') return undefined; const x = setInterval(() => load().catch(() => {}), 10000); return () => clearInterval(x); }, [cfg?.mode, load]);
  if (!cfg) return null;
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); await load(); } catch (e) { toast(errText(e, t), 'err'); } };
  const restart = async () => { if (await confirm(t('net.restartQ'))) run(() => api('net:restart')); };
  const isClient = cfg.mode === 'client';

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="card space-y-3 lg:col-span-2">
        <h3 className="font-semibold">🖧 {t('net.title')}</h3>
        <p className="text-sm text-slate-300">{t('net.help')}</p>
        <div className="text-sm"><span className="text-slate-400">{t('net.current')} : </span><b>{t(`net.mode.${cfg.mode}`)}</b>
          {isClient && <span className="text-slate-300"> — {cfg.serverAddr}</span>}</div>
        {dirty && <div className="rounded-lg bg-amber-500/15 border border-amber-400/40 p-3 text-sm flex flex-wrap items-center gap-3">{t('net.restartNeeded')}<button className="btn-primary btn-sm" onClick={restart}>🔄 {t('net.restart')}</button></div>}
      </div>

      {isClient ? (
        <div className="card space-y-3 lg:col-span-2">
          <p>{t('net.clientInfo', { server: cfg.serverAddr })}</p>
          <button className="btn-ghost btn-sm" onClick={() => run(async () => { await api('net:setMode', { mode: 'standalone' }); setDirty(true); })}>{t('net.saveStandalone')}</button>
        </div>
      ) : (
        <>
          <div className="card space-y-3">
            <label className="label">{t('net.mode')}</label>
            <div className="flex flex-wrap gap-4 text-sm">
              {['standalone', 'server', 'client'].map((m) => (
                <label key={m} className="flex items-center gap-2"><input type="radio" name="netmode" checked={mode === m} onChange={() => setMode(m)} /> {t(`net.mode.${m}`)}</label>
              ))}
            </div>
            {mode === 'standalone' && (
              <button className="btn-primary" disabled={cfg.configuredMode === 'standalone'} onClick={() => run(async () => { await api('net:setMode', { mode: 'standalone' }); setDirty(true); }, t('common.saved'))}>{t('net.saveStandalone')}</button>
            )}
            {mode === 'server' && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2"><label className="label">{t('net.serverName')}</label><input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></div>
                  <div><label className="label">{t('net.port')}</label><input className="input" type="number" min="1024" max="65535" value={port} onChange={(e) => setPort(e.target.value)} /></div>
                </div>
                <button className="btn-primary" onClick={() => run(async () => { await api('net:setMode', { mode: 'server', name, port: Number(port) }); setDirty(true); }, t('common.saved'))}>🖧 {t('net.saveServer')}</button>
              </div>
            )}
            {mode === 'client' && (
              <div className="space-y-3">
                <div><label className="label">{t('net.serverAddr')}</label><input className="input font-mono" value={pair.server} placeholder="192.168.1.10:47800" onChange={(e) => setPair({ ...pair, server: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="label">{t('net.code')}</label><input className="input font-mono uppercase" value={pair.code} placeholder="XXXX-XXXX" maxLength={9} onChange={(e) => setPair({ ...pair, code: e.target.value })} /></div>
                  <div><label className="label">{t('net.pcName')}</label><input className="input" value={pair.name} maxLength={40} onChange={(e) => setPair({ ...pair, name: e.target.value })} /></div>
                </div>
                <button className="btn-primary" disabled={!pair.server || !pair.code}
                  onClick={() => run(async () => { const r = await api('net:pair', pair); setPair({ server: '', code: '', name: pair.name }); setDirty(true); toast(t('net.paired', { server: r.serverAddr })); })}>🔗 {t('net.pair')}</button>
              </div>
            )}
          </div>

          {cfg.configuredMode === 'server' && (
            <div className="card space-y-3">
              <h4 className="font-semibold">{t('net.addresses')}</h4>
              <div className="font-mono text-sm space-y-0.5 select-text">{cfg.addresses.length ? cfg.addresses.map((a) => <div key={a}>{a}:{cfg.port}</div>) : '—'}</div>
              <div className={`text-xs ${cfg.listening?.listening ? 'text-emerald-300' : 'text-amber-300'}`}>
                {cfg.listening?.listening ? `✔ ${t('net.listening')} (${cfg.listening.port})` : `⚠ ${t('net.notListening')}${cfg.listening?.error ? ` — ${cfg.listening.error}` : ''}`}
              </div>
              <div className="border-t border-white/10 pt-3 space-y-2">
                <button className="btn-ghost" onClick={() => run(async () => { const r = await api('net:newPairCode'); setCode(r.code); })}>🔑 {t('net.newCode')}</button>
                {code && (
                  <div className="rounded-lg bg-slate-950/70 p-3 text-center">
                    <div className="text-xs text-slate-400">{t('net.pairCode')}</div>
                    <div className="font-mono text-3xl tracking-widest select-text">{code}</div>
                    <div className="text-xs text-slate-400 mt-1">{t('net.codeHelp')}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {cfg.configuredMode === 'server' && (
            <div className="card lg:col-span-2 space-y-2">
              <h4 className="font-semibold">{t('net.clients')}</h4>
              {!cfg.clients.length ? <p className="text-sm text-slate-400">{t('net.noClients')}</p> : (
                <table className="w-full text-sm">
                  <thead><tr><th className="th">{t('common.name')}</th><th className="th">IP</th><th className="th">{t('net.lastSeen')}</th><th /></tr></thead>
                  <tbody>{cfg.clients.map((c) => (
                    <tr key={c.id} className="border-t border-white/10"><td className="py-2">{c.name}</td><td className="font-mono">{c.addr}</td><td className="text-slate-400">{fmtDateTime(c.lastSeen)}</td>
                      <td className="text-right"><button className="btn-danger btn-sm" onClick={async () => { if (await confirm(t('net.revokeQ', { name: c.name }), { danger: true })) run(() => api('net:revokeClient', c.id)); }}>{t('net.revoke')}</button></td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
