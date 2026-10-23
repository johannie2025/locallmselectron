'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Liste blanche stricte : le renderer ne peut appeler que ces canaux.
// (tests/consistency.test.js vérifie qu'elle correspond exactement aux handlers de ipc.js)
const CHANNELS = new Set([
  'auth:login', 'auth:logout', 'auth:me', 'auth:changePassword', 'auth:setLang', 'auth:adminExit',
  'branding:get', 'apps:list', 'apps:launch', 'admin:apps:get', 'admin:apps:save', 'net:getConfig', 'net:setMode', 'net:newPairCode', 'net:revokeClient', 'net:pair', 'net:restart', 'system:info', 'system:power', 'license:status', 'license:activate', 'license:issueHere', 'license:issue',
  'courses:list', 'courses:rescan', 'pptx:prepare', 'maintenance:create', 'progress:update', 'media:readPdf',
  'quiz:get', 'quiz:submit', 'cert:get', 'print:page', 'print:pdf',
  'admin:users:list', 'admin:users:create', 'admin:users:update', 'admin:users:resetPassword', 'admin:users:setActive',
  'admin:users:resetProgress', 'admin:users:delete',
  'admin:classes:list', 'admin:classes:save', 'admin:classes:delete',
  'admin:courses:meta', 'admin:enroll:getUser', 'admin:enroll:setUser', 'admin:enroll:getCourse', 'admin:enroll:setCourse',
  'admin:order:get', 'admin:order:save',
  'admin:modules:list', 'admin:quiz:read', 'admin:quiz:save',
  'admin:stats:overview', 'admin:report:transcript', 'admin:report:certificate',
  'admin:results:list', 'admin:results:export',
  'admin:settings:get', 'admin:settings:set',
  'admin:branding:set', 'admin:branding:saveLogo', 'admin:branding:removeLogo',
  'admin:exit',
]);

contextBridge.exposeInMainWorld('lms', {
  call: async (channel, ...args) => {
    if (!CHANNELS.has(channel)) throw new Error('CHANNEL_DENIED');
    const r = await ipcRenderer.invoke(channel, ...args);
    if (!r.ok) throw new Error(r.error);
    return r.data;
  },
  onCoursesChanged: (cb) => {
    const h = () => cb();
    ipcRenderer.on('courses:changed', h);
    return () => ipcRenderer.removeListener('courses:changed', h);
  },
});
