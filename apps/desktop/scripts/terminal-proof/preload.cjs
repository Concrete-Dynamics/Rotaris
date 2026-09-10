/**
 * Part AL2 — the proof page's bridge for the REQ-SHELL-166 section: the same two verbs the product's preload gives a
 * renderer (a frame subscription on one channel, a command that resolves to an outcome), over Electron's IPC, so the
 * window component's actions travel renderer → main → run host as they do in the product. Verification only.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__terminalProofBridge', Object.freeze({
  onFrame: (fn) => { ipcRenderer.on('proof:frame', (_event, frame) => fn(frame)); },
  command: (request) => ipcRenderer.invoke('proof:command', request),
}));
