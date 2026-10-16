'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Liste blanche stricte : le renderer ne peut appeler que ces canaux.
const CHANNELS = new Set([
  'auth:login', 'auth:logout', 'auth:me', 'auth:changePassword',
  'courses:list', 'courses:rescan', 'progress:update', 'media:readPdf',
  'quiz:get', 'quiz:submit',
  'admin:users:list', 'admin:users:create', 'admin:users:resetPassword', 'admin:users:setActive',
  'admin:users:resetProgress', 'admin:users:delete', 'admin:results:list', 'admin:results:export',
  'admin:settings:get', 'admin:settings:set', 'admin:quiz:read', 'admin:quiz:save', 'admin:modules:list', 'admin:exit',
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
