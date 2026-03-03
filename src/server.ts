/**
 * Web server entry point.
 * Starts the Hono app with @hono/node-server.
 */

import { serve } from '@hono/node-server';
import { setWebMode } from './utils/logger.js';
import { createApp } from './web/app.js';

// Suppress ora spinners and chalk colors in web mode
setWebMode(true);

const port = parseInt(process.env['PORT'] ?? '8080', 10);

async function main() {
  const { app, auditService } = await createApp();

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`Web Audit server running on http://localhost:${info.port}`);
    console.log(`Security: passive scanner (OWASP Secure Headers + Mozilla Observatory standards)`);
  });

  // Graceful shutdown
  function shutdown() {
    console.log('Shutting down...');
    auditService.destroy();
    server.close(() => process.exit(0));
    // Force exit after 60s (allow time for Chrome cleanup in running audits)
    setTimeout(() => process.exit(1), 60_000);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
