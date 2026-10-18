export const api = (channel, ...args) => window.lms.call(channel, ...args);

/** Message d'erreur localisé : les codes renvoyés par le processus principal sont traduits via t('err.CODE'). */
export const errText = (e, t) => {
  const code = e?.message || '';
  if (/^[A-Z_]+$/.test(code)) { const s = t(`err.${code}`); if (s !== `err.${code}`) return s; }
  return code || t('err.UNKNOWN');
};
