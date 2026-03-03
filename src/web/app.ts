/**
 * Hono web application.
 * Provides the web interface for running audits.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { serveStatic } from '@hono/node-server/serve-static';
import { AuditService } from './services/audit-service.js';
import { createAuditRoutes } from './routes/audit.js';

// Resolve public dir from this file's location (works regardless of process.cwd()).
// Compiled: dist/web/app.js → sibling dir dist/web/public/
// Electron packaged: {asar}/dist/web/app.js → {asar.unpacked}/dist/web/public/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, 'public');

export async function createApp(): Promise<{ app: Hono; auditService: AuditService }> {
  const app = new Hono();
  const auditService = new AuditService();

  // Secure headers (X-Content-Type-Options, X-Frame-Options, etc.)
  app.use('*', secureHeaders());

  // Health check
  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      securityAvailable: true,
      securityMethod: 'passive',
      timestamp: new Date().toISOString(),
    });
  });

  // API routes
  const auditRoutes = createAuditRoutes(auditService);
  app.route('/api', auditRoutes);

  // Serve static files (frontend) — absolute path so it works in Electron packaged apps
  app.use('/*', serveStatic({ root: publicDir }));

  return { app, auditService };
}
