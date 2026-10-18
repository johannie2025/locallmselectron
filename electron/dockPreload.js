'use strict';
// Préchargement minimal de la petite fenêtre « Retour » affichée pendant qu'une application externe est ouverte.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dock', { back: () => ipcRenderer.send('dock:back') });
