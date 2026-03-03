/**
 * Electron preload script (CommonJS required for sandboxed renderer).
 * Exposes a minimal API to the renderer via context bridge.
 */

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getVersion: () => process.env['APP_VERSION'] || 'dev',
});
