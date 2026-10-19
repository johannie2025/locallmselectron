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
 *  8. Applications externes (Word, Excel…) : la fenêtre se masque, un bouton « Retour » reste affiché (voir enterExternal)
 *  9. Blocage USB + démarrage automatique : posés par l'installeur (build/installer.nsh)
 *
 * Ce que l'appli ne peut pas bloquer seule : Ctrl+Alt+Suppr, Alt+Tab, Win+L. Voir docs/POSTE-WINDOWS.md.
 */
const { app, BrowserWindow, Menu, protocol, session, net, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { execFile, spawn } = require('child_process');
const os = require('os');
const { loadConfig } = require('./config');
const { openDb } = require('./db');
const { createServices } = require('./ipc');
const winLockdown = require('./winLockdown');
const { createNetStore } = require('./netStore');
const { startNetServer } = require('./netServer');
const { createNetClient } = require('./netClient');
const crypto = require('crypto');

const DEV_URL = process.env.VITE_DEV_SERVER_URL || null;
let KIOSK = process.env.LMS_NO_KIOSK !== '1' && !process.argv.includes('--no-kiosk');
// Mode « cybercafé » : l'application EST le shell Windows du compte (valeur Winlogon\Shell, posée par scripts/Comptes-Windows.ps1).
// Pas de bureau ni de barre des tâches : kiosque forcé, et « quitter » = fermer la session (sinon écran noir).
const SHELL = process.argv.includes('--shell');
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
let netClient = null; // mode client : toutes les données viennent du serveur du centre
let netServer = null; // mode serveur
let logFile = null;
let external = null; // { dock, children:Set, startedAt } pendant qu'une application externe (Word, Excel…) est ouverte
const DOCK_HTML = (name) => `<!doctype html><meta charset="utf-8"><body style="margin:0;font:600 13px system-ui,sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;gap:10px;height:100vh;padding:0 10px;border:2px solid #38bdf8;box-sizing:border-box;-webkit-app-region:no-drag;user-select:none"><button onclick="dock.back()" style="cursor:pointer;background:#0ea5e9;color:#fff;border:0;border-radius:8px;padding:7px 12px;font:700 13px system-ui">◀ Wise Design Learning Systems</button><span style="opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${String(name).replace(/[<>&"]/g, '')}</span></body>`;
function enterExternal({ name, child }) {
  if (!KIOSK || !win || win.isDestroyed()) return; // fenêtre normale : les applications s'ouvrent simplement à côté
  topSuspended = true;
  if (!external) {
    const dock = new BrowserWindow({
      width: 460, height: 46, frame: false, resizable: false, minimizable: false, maximizable: false, skipTaskbar: true, alwaysOnTop: true, show: false,
      webPreferences: { preload: path.join(__dirname, 'dockPreload.js'), contextIsolation: true, sandbox: true, devTools: false },
    });
    dock.setAlwaysOnTop(true, 'screen-saver');
    dock.on('close', (e) => { if (!allowQuit && external) e.preventDefault(); });
    external = { dock, children: new Set(), startedAt: Date.now() };
    win.setAlwaysOnTop(false);
    win.hide();
    dock.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(DOCK_HTML(name)));
    dock.once('ready-to-show', () => { const { workArea } = require('electron').screen.getPrimaryDisplay(); dock.setPosition(Math.round(workArea.x + workArea.width / 2 - 230), workArea.y + 4); dock.showInactive(); });
  }
  if (child && child.pid) {
    external.children.add(child.pid);
    child.on('exit', () => {
      if (!external) return;
      external.children.delete(child.pid);
      // retour automatique à la fermeture du dernier programme (si la fermeture n'est pas instantanée : relais vers une instance existante)
      if (!external.children.size && Date.now() - external.startedAt > 3000) exitExternal();
    });
  }
}
function exitExternal() {
  if (!external) return;
  const { dock } = external;
  external = null;
  try { dock.destroy(); } catch { /* déjà fermée */ }
  topSuspended = false;
  if (win && !win.isDestroyed()) { win.show(); win.setAlwaysOnTop(true, 'screen-saver'); win.focus(); }
}
ipcMain.on('dock:back', (e) => { if (external && e.sender === external.dock.webContents) exitExternal(); });
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
    if (SHELL) KIOSK = true;
    else if (config.kiosk === false) KIOSK = false;
    else if (config.kiosk === 'auto' && app.isPackaged && process.platform === 'win32') KIOSK = !(await winLockdown.isWindowsAdmin());

    const db = openDb(path.join(config.dataDir, 'lms.sqlite'));
    // Réseau local : le mode (autonome / serveur / client) est choisi par le super-administrateur (Paramètres > Réseau)
    const netStore = createNetStore(config.dataDir);
    const netMode = netStore.get().mode;
    if (netMode === 'client' && netStore.get().server && netStore.get().token) netClient = createNetClient({ store: netStore, bootId: crypto.randomBytes(8).toString('hex') });
    services = createServices({
      db, config, log, onExternalApp: enterExternal,
      net: {
        store: netStore, client: netClient,
        serverStatus: () => (netServer ? netServer.status() : null),
        restart: () => { allowQuit = true; app.relaunch(); app.exit(0); },
      },
      getWindow: () => win,
      setOnTop: (on) => { topSuspended = !on; if (KIOSK && win && !win.isDestroyed()) win.setAlwaysOnTop(on, on ? 'screen-saver' : 'normal'); },
      quitApp: async (maintenance) => {
        if (maintenance) await winLockdown.revert(config.dataDir).catch((e) => log(`revert: ${e.message}`));
        allowQuit = true;
        // Le bureau a été (re)lancé par revert() ; on laisse à explorer.exe le temps de s'installer avant de fermer l'application
        if (maintenance && process.platform === 'win32') await new Promise((r) => setTimeout(r, 1500));
        if (SHELL && process.platform === 'win32') {
          // Sans explorer.exe le compte n'aurait plus d'écran : maintenance → on démarre le bureau Windows ; sinon → fermeture de session.
          if (maintenance) { try { spawn('explorer.exe', [], { detached: true, stdio: 'ignore' }).unref(); } catch (e) { log(`explorer: ${e.message}`); } app.quit(); }
          else { execFile('shutdown', ['/l'], { windowsHide: true }, () => app.quit()); }
          return;
        }
        app.quit();
      },
      sysInfo: () => ({ platform: process.platform, shell: SHELL, kiosk: KIOSK, portable: !!config.portable, netMode: netClient ? 'client' : netStore.get().mode, netServer: netClient ? netStore.get().server : '', winUser: (() => { try { return os.userInfo().username; } catch { return ''; } })(), version: app.getVersion() }),
      power: (action) => {
        if (process.platform !== 'win32') return false;
        allowQuit = true; // sinon la fermeture annulée par le kiosque ferait apparaître « cette application empêche l'arrêt »
        const args = { logoff: ['/l'], restart: ['/r', '/t', '0'], shutdown: ['/s', '/t', '0'] }[action];
        execFile('shutdown', args, { windowsHide: true }, (err) => { if (err) { allowQuit = false; log(`power ${action}: ${err.message}`); } });
        return true;
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
        if (netClient) { // mode client : flux depuis le serveur (Range transmis, le serveur contrôle l'inscription)
          const r = await netClient.media(rel, req.headers.get('range'));
          return new Response(r.body, { status: r.status, headers: r.headers });
        }
        const abs = services.resolveMedia(rel);
        if (!abs) return new Response('Forbidden', { status: 403 });
        return await net.fetch(pathToFileURL(abs).toString(), { headers: req.headers, bypassCustomProtocolHandlers: true });
      } catch (e) { log(`media: ${e.message}`); return new Response('Error', { status: 500 }); }
    });

    // ----- Étanchéité réseau : tout http(s)/ws(s) est annulé (sauf serveur Vite en dev) -----
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] }, (d, cb) => {
      cb({ cancel: !(DEV_URL && d.url.startsWith(new URL(DEV_URL).origin)) });
    });
    // Seul le plein écran HTML (lecteur vidéo, PDF) est autorisé ; caméra, micro, géolocalisation, notifications… restent refusés
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'fullscreen'));
    // Aucun téléchargement possible (le bouton « télécharger » des lecteurs vidéo/audio est aussi masqué dans l'interface)
    session.defaultSession.on('will-download', (e) => e.preventDefault());
    if (app.isPackaged) {
      session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
        cb({ responseHeaders: { ...d.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; img-src 'self' data: blob:; media-src lms-media: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-src 'none'"] } });
      });
    }

    // Dossier des cours + dossier de personnalisation (créés s'ils n'existent pas)
    if (!netClient) { try { fs.mkdirSync(path.join(services.getCourseRoot(), '_branding'), { recursive: true }); } catch (e) { log(`mkdir cours: ${e.message}`); } }

    createWindow();

    if (netMode === 'server') {
      const c = netStore.get();
      netServer = startNetServer({
        store: netStore, dispatch: services.dispatch, newHolder: services.newHolder, mediaPath: services.mediaPath, treeVersion: services.treeVersion,
        port: c.port, name: c.name || os.hostname(), version: app.getVersion(), log,
      });
    }
    if (netClient) { // le serveur signale une modification des cours : on prévient l'interface (comme le fait le watcher en local)
      let last = 0;
      setInterval(async () => {
        const st = await netClient.state();
        if (st && st.treeVersion !== last) { if (last && win && !win.isDestroyed()) win.webContents.send('courses:changed'); last = st.treeVersion; }
      }, 15000);
    }

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
  let htmlFullscreen = false; // plein écran d'une vidéo / d'un PDF : Échap doit pouvoir le quitter
  win.webContents.on('enter-html-full-screen', () => { htmlFullscreen = true; });
  win.webContents.on('leave-html-full-screen', () => { htmlFullscreen = false; });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !KIOSK) return;
    const k = (input.key || '').toLowerCase();
    if (htmlFullscreen && k === 'escape') return;
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
  win.on('leave-full-screen', () => { if (KIOSK && !allowQuit && !external) win.setFullScreen(true); });
  win.on('minimize', () => { if (KIOSK && !external) win.restore(); });
  win.on('blur', () => { if (KIOSK && !allowQuit && !topSuspended && !external) setTimeout(() => win && !win.isDestroyed() && !topSuspended && win.focus(), 100); });
  win.on('session-end', () => { allowQuit = true; }); // fermeture de session / arrêt Windows
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
app.on('before-quit', () => { services?.stop(); netServer?.close(); });
