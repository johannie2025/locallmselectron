export const api = (channel, ...args) => window.lms.call(channel, ...args);

const MESSAGES = {
  BAD_CREDENTIALS: 'Identifiant ou mot de passe incorrect.',
  AUTH_REQUIRED: 'Session expirée, reconnectez-vous.',
  PASSWORD_TOO_SHORT: 'Le mot de passe doit contenir au moins 6 caractères.',
  MODULE_LOCKED: 'Ce module est verrouillé.',
  NO_QUIZ: 'Aucun test disponible pour ce module.',
  USER_EXISTS: 'Cet identifiant existe déjà.',
  BAD_USERNAME: 'Identifiant invalide (3-40 caractères : lettres, chiffres, . _ - @).',
  SELF_FORBIDDEN: 'Action impossible sur votre propre compte.',
  FILE_NOT_FOUND: 'Fichier introuvable.',
};
export const errText = (e) => MESSAGES[e?.message] || e?.message || 'Erreur inconnue';
