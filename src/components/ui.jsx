import { createPortal } from 'react-dom';
import { createContext, useCallback, useContext, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';

/** Rendue dans <body> (portail) : un parent avec backdrop-filter (l'en-tête) ferait sinon de la fenêtre un élément « fixe » enfermé dans l'en-tête, derrière le contenu. */
export function Modal({ title, onClose, children, wide }) {
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 backdrop-blur-sm p-4 no-print" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`card !bg-slate-900 w-full ${wide ? 'max-w-4xl' : 'max-w-md'} max-h-[90vh] overflow-auto animate-pop`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          {onClose && <button className="text-slate-400 hover:text-white text-xl leading-none" onClick={onClose} aria-label="close">✕</button>}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Bar({ value, color = 'bg-emerald-500', className = '' }) {
  return (
    <div className={`h-2 rounded bg-slate-700 overflow-hidden ${className}`}>
      <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Empty({ children }) { return <div className="text-center text-slate-400 py-10">{children}</div>; }

function PromptBody({ d, onDone }) {
  const { t } = useI18n();
  const [v, setV] = useState('');
  return (
    <Modal title={d.title} onClose={() => onDone(null)}>
      <form onSubmit={(e) => { e.preventDefault(); onDone(v); }} className="space-y-4">
        {d.label && <label className="label">{d.label}</label>}
        <input className="input" type={d.type} autoFocus value={v} onChange={(e) => setV(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => onDone(null)}>{t('common.cancel')}</button>
          <button className="btn-primary">{t('common.ok')}</button>
        </div>
      </form>
    </Modal>
  );
}

const UiCtx = createContext(null);
/** Notifications (toasts) + boîtes de dialogue confirm/prompt (window.prompt n'existe pas sous Electron). */
export function UiProvider({ children }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState([]);
  const [dlg, setDlg] = useState(null);
  const toast = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setToasts((x) => [...x, { id, msg, type }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 3800);
  }, []);
  const confirm = useCallback((message, { danger = false } = {}) => new Promise((res) => setDlg({ kind: 'confirm', message, danger, res })), []);
  const prompt = useCallback((title, { type = 'text', label = '' } = {}) => new Promise((res) => setDlg({ kind: 'prompt', title, type, label, res })), []);
  const done = (v) => { dlg.res(v); setDlg(null); };
  return (
    <UiCtx.Provider value={{ toast, confirm, prompt }}>
      {children}
      {dlg?.kind === 'confirm' && (
        <Modal title={t('common.confirm')} onClose={() => done(false)}>
          <p className="mb-5 text-slate-200">{dlg.message}</p>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => done(false)}>{t('common.cancel')}</button>
            <button className={dlg.danger ? 'btn-danger' : 'btn-primary'} onClick={() => done(true)} autoFocus>{t('common.ok')}</button>
          </div>
        </Modal>
      )}
      {dlg?.kind === 'prompt' && <PromptBody d={dlg} onDone={done} />}
      <div className="fixed bottom-14 right-4 z-[60] space-y-2 no-print">
        {toasts.map((x) => (
          <div key={x.id} className={`animate-fade-up rounded-lg px-4 py-2 shadow-lg text-sm ${x.type === 'err' ? 'bg-rose-700' : 'bg-emerald-700'}`}>{x.msg}</div>
        ))}
      </div>
    </UiCtx.Provider>
  );
}
export const useUi = () => useContext(UiCtx);
