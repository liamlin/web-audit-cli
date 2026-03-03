/**
 * Electron main process.
 * Starts the Hono server on a random localhost port and loads it in a BrowserWindow.
 * All audit engines, SSE streaming, and the frontend work unchanged.
 */

import { app, BrowserWindow, shell } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createMenu } from './menu.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let server: { close: () => void } | null = null;
let auditServiceRef: { destroy: () => void } | null = null;

async function createWindow(port: number): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 720,
    minWidth: 600,
    minHeight: 500,
    title: 'Web Audit',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Load the Hono server running on localhost
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);

  // Restrict navigation to the local server only
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl);
      if (parsedUrl.origin !== `http://127.0.0.1:${port}`) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault(); // Block if URL can't be parsed
    }
  });

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.origin !== `http://127.0.0.1:${port}`) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
      return { action: 'allow' };
    } catch {
      return { action: 'deny' };
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startServer(): Promise<number> {
  // Mark desktop mode — disables SSRF checks
  process.env['ELECTRON_MODE'] = 'true';

  // Set version from package.json so the preload script can expose it
  const { readFileSync } = await import('fs');
  const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  process.env['APP_VERSION'] = pkg.version;

  // Dynamic import of ESM modules from the compiled dist/
  const { setWebMode } = await import('../dist/utils/logger.js');
  const { createApp } = await import('../dist/web/app.js');

  setWebMode(true);

  const { app: honoApp, auditService } = await createApp();

  // Store reference for cleanup on quit
  auditServiceRef = auditService;

  const { serve } = await import('@hono/node-server');

  return new Promise((resolve) => {
    server = serve(
      { fetch: honoApp.fetch, port: 0, hostname: '127.0.0.1' },
      (info) => {
        console.log(`Web Audit desktop server on http://127.0.0.1:${info.port}`);
        resolve(info.port);
      }
    );
  });
}

app.whenReady().then(async () => {
  try {
    const port = await startServer();
    await createWindow(port);
    createMenu(mainWindow);
  } catch (err) {
    console.error('Failed to start:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  if (auditServiceRef) {
    auditServiceRef.destroy();
    auditServiceRef = null;
  }
  if (server) {
    server.close();
    server = null;
  }
});
