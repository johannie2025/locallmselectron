'use strict';
/**
 * main.js — processus principal Electron (Wise Design Learning Systems).
 *
 * Mode KIOSQUE (comptes Windows standard ; fenêtre normale pour les comptes administrateurs Windows) :
 *  1. kiosk + fullscreen + frameless + always-on-top
 *  2. before-input-event : bloque Alt+F4, Ctrl+W/Q/R/N/T/P, F4/F5/F11/F12, Échap…
 *  3. event 'close' annulé tant qu'un admin n'a pas validé la sortie (écran de connexion ou panneau Admin)
 *  4. Menu applicatif supprimé, DevTools coupés en production
 *  5. Navigation, nouvelles fenêtres, permissions et TOUT trafic réseau bloqués (100 % hors-ligne)
 *  6. Instance unique + rechargement si le renderer plante
 *  7. Restrictions Windows (explorateur de lecteurs, Exécuter, Gestionnaire des tâches…) via winLockdown.js
 *  8. Blocage USB + démarrage automatique : posés par l'installeur (build/installer.nsh)
 *
 * Ce que l'appli ne peut pas bloquer seule : Ctrl+Alt+Suppr, Alt+Tab, Win+L. Voir docs/POSTE-WINDOWS.md.
 */
const { app, BrowserWindow, Menu, protocol, session, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { loadConfig } = require('./config');
const { openDb } = require('./db');
const { createServices } = require('./ipc');
const winLockdown = require('./winLockdown');

const DEV_URL = process.env.VITE_DEV_SERVER_URL || null;
let KIOSK = process.env.LMS_NO_KIOSK !== '1' && !process.argv.includes('--no-kiosk');
const DIST = path.resolve(__dirname, '..', 'dist');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json',
};

// Schémas privilégiés : doivent être déclarés AVANT app.ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'lms-app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'lms-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let win = null;
let allowQuit = false;
let topSuspended = false; // vrai pendant l'impression : la boîte de dialogue système doit pouvoir passer au premier plan
let services = null;
let logFile = null;
const log = (msg) => { try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`); } catch { /* ignoré */ } };

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.wisedesign.wls');
    const config = loadConfig(app);
    fs.mkdirSync(path.join(config.dataDir, 'logs'), { recursive: true });
    logFile = path.join(config.dataDir, 'logs', 'wls.log');
    process.on('uncaughtException', (e) => log(`uncaught: ${e.stack || e}`));
    process.on('unhandledRejection', (e) => log(`unhandled: ${e}`));

    // Kiosque : 'auto' = plein écran verrouillé pour les comptes Windows standard, fenêtre normale pour les admins Windows
    if (config.kiosk === false) KIOSK = false;
    else if (config.kiosk === 'auto' && app.isPackaged && process.platform === 'win32') KIOSK = !(await winLockdown.isWindowsAdmin());

    const db = openDb(path.join(config.dataDir, 'lms.sqlite'));
    services = createServices({
      db, config, log,
      getWindow: () => win,
      setOnTop: (on) => { topSuspended = !on; if (KIOSK && win && !win.isDestroyed()) win.setAlwaysOnTop(on, on ? 'screen-saver' : 'normal'); },
      quitApp: async (maintenance) => {
        if (maintenance) await winLockdown.revert(config.dataDir).catch((e) => log(`revert: ${e.message}`));
        allowQuit = true; app.quit();
      },
    });

    Menu.setApplicationMenu(null); // supprime les accélérateurs par défaut (Ctrl+R, Ctrl+Shift+I…)

    // ----- Protocoles -----
    // lms-app://app/… : sert le build React (origine « standard » → workers, fetch et CSP fonctionnent)
    protocol.handle('lms-app', async (req) => {
      const u = new URL(req.url);
      let p = decodeURIComponent(u.pathname);
      if (p === '/' || !p) p = '/index.html';
      const abs = path.join(DIST, p);
      if (!abs.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
      try {
        const r = await net.fetch(pathToFileURL(abs).toString(), { bypassCustomProtocolHandlers: true });
        const headers = new Headers(r.headers);
        const mime = MIME[path.extname(abs).toLowerCase()];
        if (mime) headers.set('content-type', mime);
        return new Response(r.body, { status: r.status, headers });
      } catch { return new Response('Not found', { status: 404 }); }
    });
    // lms-media://f/<chemin relatif> : vidéos/audios du dossier des cours (Range supporté → seek), session + licence + inscription requises
    protocol.handle('lms-media', async (req) => {
      try {
        const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
        const abs = services.resolveMedia(rel);
        if (!abs) return new Response('Forbidden', { status: 403 });
        return await net.fetch(pathToFileURL(abs).toString(), { headers: req.headers, bypassCustomProtocolHandlers: true });
      } catch (e) { log(`media: ${e.message}`); return new Response('Error', { status: 500 }); }
    });

    // ----- Étanchéité réseau : tout http(s)/ws(s) est annulé (sauf serveur Vite en dev) -----
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] }, (d, cb) => {
      cb({ cancel: !(DEV_URL && d.url.startsWith(new URL(DEV_URL).origin)) });
    });
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    // Aucun téléchargement possible (le bouton « télécharger » des lecteurs vidéo/audio est aussi masqué dans l'interface)
    session.defaultSession.on('will-download', (e) => e.preventDefault());
    if (app.isPackaged) {
      session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
        cb({ responseHeaders: { ...d.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; img-src 'self' data: blob:; media-src lms-media: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-src 'none'"] } });
      });
    }

    // Dossier des cours + dossier de personnalisation (créés s'ils n'existent pas)
    try { fs.mkdirSync(path.join(services.getCourseRoot(), '_branding'), { recursive: true }); } catch (e) { log(`mkdir cours: ${e.message}`); }

    createWindow();

    // Restrictions Windows pour le compte courant (comptes standard seulement en mode 'auto')
    if (app.isPackaged) {
      winLockdown.apply(config.dataDir, config.lockdown, log).then((r) => log(`lockdown: ${JSON.stringify(r)}`)).catch((e) => log(`lockdown: ${e.message}`));
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    show: false,
    fullscreen: KIOSK,
    kiosk: KIOSK,
    frame: !KIOSK,
    alwaysOnTop: KIOSK,
    autoHideMenuBar: true,
    title: 'Wise Design Learning Systems',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });
  if (KIOSK) win.setAlwaysOnTop(true, 'screen-saver');
  else win.maximize();
  win.once('ready-to-show', () => win.show());

  // (2) Raccourcis bloqués au niveau de la page (Alt+F4 est de toute façon neutralisé par (3))
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !KIOSK) return;
    const k = (input.key || '').toLowerCase();
    const ctrl = input.control || input.meta;
    const blocked =
      (input.alt && ['f4', 'arrowleft', 'arrowright', 'home'].includes(k)) ||
      (ctrl && ['w', 'q', 'r', 'n', 't', 'p', 'o', 's', 'u', 'f', '+', '-', '=', '0'].includes(k)) ||
      (ctrl && input.shift && ['i', 'j', 'c', 'r', 'n', 'w'].includes(k)) ||
      ['f1', 'f3', 'f4', 'f5', 'f6', 'f7', 'f10', 'f11', 'f12', 'escape', 'browserback', 'browserforward'].includes(k);
    if (blocked) event.preventDefault();
  });

  // (3) Fermeture impossible sans validation admin
  win.on('close', (e) => { if (!allowQuit && KIOSK) e.preventDefault(); });
  win.on('leave-full-screen', () => { if (KIOSK && !allowQuit) win.setFullScreen(true); });
  win.on('minimize', () => { if (KIOSK) win.restore(); });
  win.on('blur', () => { if (KIOSK && !allowQuit && !topSuspended) setTimeout(() => win && !win.isDestroyed() && !topSuspended && win.focus(), 100); });
  win.on('closed', () => { win = null; });

  // (5) Pas de navigation ni de pop-up
  win.webContents.on('will-navigate', (e, url) => { if (!(url.startsWith('lms-app://') || (DEV_URL && url.startsWith(DEV_URL)))) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // (6) Résilience
  win.webContents.on('render-process-gone', (_e, d) => { log(`render gone: ${d.reason}`); if (win && !win.isDestroyed()) win.reload(); });

  if (DEV_URL) win.loadURL(DEV_URL); else win.loadURL('lms-app://app/index.html');
}

// Si la fenêtre disparaît sans sortie autorisée, on la recrée
app.on('window-all-closed', () => { if (allowQuit) app.quit(); else if (KIOSK) createWindow(); else app.quit(); });
app.on('before-quit', () => services?.stop());
