import { useState } from 'react';
import { Modal } from './ui.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useBrand } from '../brand/BrandProvider.jsx';
import { APP_NAME, APP_VERSION, COMPANY, PHONES } from '../brand.js';

/** Bouton « Wise Design » + fenêtre de présentation de l'éditeur et de ses contacts (login et application). */
export default function AboutButton({ className = '' }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const { wiseLogo } = useBrand();
  return (
    <>
      <button className={`btn-ghost btn-sm ${className}`} onClick={() => setOpen(true)}>ℹ️ {COMPANY}</button>
      {open && (
        <Modal title={t('about.title')} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <div className="text-center"><span className="logo-badge"><img src={wiseLogo} alt={COMPANY} className="h-16 w-auto" /></span></div>
            <p className="text-slate-200 leading-relaxed">{t('about.intro')}</p>
            <p className="italic text-slate-300">« {t('about.tagline')} »</p>
            <div>
              <div className="label">{t('about.services')}</div>
              <div className="flex flex-wrap gap-2">
                {['about.s1', 'about.s2', 'about.s3', 'about.s4', 'about.s5'].map((k) => (
                  <span key={k} className="rounded-full bg-brand/25 border border-brand/40 px-3 py-1 text-sm">{t(k)}</span>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-slate-900/70 p-3">
              <div className="label">{t('about.contact')}</div>
              {PHONES.map((p) => <div key={p} className="font-mono text-lg">WhatsApp : {p}</div>)}
            </div>
            <p className="text-xs text-slate-400">{APP_NAME} · v{APP_VERSION} · © {new Date().getFullYear()} {COMPANY}</p>
          </div>
        </Modal>
      )}
    </>
  );
}
