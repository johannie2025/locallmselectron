import { COMPANY, PHONES } from '../brand.js';
import { useI18n } from '../i18n/index.jsx';

/** Mention de copyright de l'éditeur : non modifiable par la personnalisation du centre. */
export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="relative z-10 py-2 px-4 text-center text-[11px] text-slate-300/90 bg-slate-950/50 backdrop-blur no-print">
      © {new Date().getFullYear()} {COMPANY} — {t('brand.role')} · WhatsApp : {PHONES.join(' / ')}
    </footer>
  );
}
