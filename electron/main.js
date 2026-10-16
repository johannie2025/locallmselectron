'use strict';
/**
 * main.js — processus principal Electron, mode KIOSQUE.
 *
 * Défense en profondeur (aucune couche ne suffit seule) :
 *  1. kiosk + fullscreen + frameless + always-on-top
 *  2. before-input-event : bloque Alt+F4, Ctrl+W/Q/R/N/T/P, F4/F5/F11/F12, Échap…
 *  3. event 'close' annulé tant que l'admin n'a pas validé la sortie (admin:exit)
 *  4. Menu applicatif supprimé (plus d'accélérateurs), DevTools coupés en production
 *  5. Navigation, nouvelles fenêtres, permissions et TOUT trafic réseau bloqués (100 % hors-ligne)
 *  6. Instance unique + relance auto de la vue si le renderer plante
 *
 * Ce que l'appli NE PEUT PAS bloquer (niveau OS) : Ctrl+Alt+Suppr, touche Windows, Alt+Tab,
 * Win+L… → c'est le rôle de FrontFace Lockdown Tool (voir docs/FRONTFACE.md).
 */
const { app, BrowserWindow, Menu, protocol, session, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { loadConfig } = require('./config');
const { openDb } = require('./db');
const { createServices } = require('./ipc');

const DEV_URL = process.env.VITE_DEV_SERVER_URL || null;
const KIOSK = process.env.LMS_NO_KIOSK !== '1';
const DIST = path.resolve(__dirname, '..', 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json' };

// Schémas privilégiés : doivent être déclarés AVANT app.ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'lms-app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'lms-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let win = null;
let allowQuit = false;
let services = null;
let logFile = null;
const log = (msg) => { try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`); } catch { /* ignoré */ } };

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

  app.whenReady().then(() => {
    const config = loadConfig(app);
    fs.mkdirSync(path.join(config.dataDir, 'logs'), { recursive: true });
    logFile = path.join(config.dataDir, 'logs', 'lms.log');
    process.on('uncaughtException', (e) => log(`uncaught: ${e.stack || e}`));
    process.on('unhandledRejection', (e) => log(`unhandled: ${e}`));

    const db = openDb(path.join(config.dataDir, 'lms.sqlite'));
    services = createServices({ db, config, getWindow: () => win, quitApp: () => { allowQuit = true; app.quit(); }, log });

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
    // lms-media://f/<chemin relatif> : vidéos du dossier des cours (Range supporté → seek), session requise
    protocol.handle('lms-media', async (req) => {
      try {
        if (!services.isLoggedIn()) return new Response('Forbidden', { status: 403 });
        const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
        const abs = services.resolveMedia(rel);
        if (!abs) return new Response('Not found', { status: 404 });
        return await net.fetch(pathToFileURL(abs).toString(), { headers: req.headers, bypassCustomProtocolHandlers: true });
      } catch (e) { log(`media: ${e.message}`); return new Response('Error', { status: 500 }); }
    });

    // ----- Étanchéité réseau : tout http(s)/ws(s) est annulé (sauf serveur Vite en dev) -----
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] }, (d, cb) => {
      cb({ cancel: !(DEV_URL && d.url.startsWith(new URL(DEV_URL).origin)) });
    });
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    if (app.isPackaged) {
      session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
        cb({ responseHeaders: { ...d.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; img-src 'self' data: blob:; media-src lms-media: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-src 'none'"] } });
      });
    }

    createWindow();
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
  win.on('blur', () => { if (KIOSK && !allowQuit) setTimeout(() => win && !win.isDestroyed() && win.focus(), 100); });
  win.on('closed', () => { win = null; });

  // (5) Pas de navigation ni de pop-up
  win.webContents.on('will-navigate', (e, url) => { if (!(url.startsWith('lms-app://') || (DEV_URL && url.startsWith(DEV_URL)))) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // (6) Résilience
  win.webContents.on('render-process-gone', (_e, d) => { log(`render gone: ${d.reason}`); if (win && !win.isDestroyed()) win.reload(); });

  if (DEV_URL) win.loadURL(DEV_URL); else win.loadURL('lms-app://app/index.html');
}

// Windows : si la fenêtre disparaît sans sortie autorisée, on la recrée
app.on('window-all-closed', () => { if (allowQuit) app.quit(); else if (KIOSK) createWindow(); else app.quit(); });
app.on('before-quit', () => services?.stop());
