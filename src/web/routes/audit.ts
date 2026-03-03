/**
 * Audit API routes.
 * Handles audit creation, progress streaming, and result retrieval.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import fs from 'fs-extra';
import type { AuditService } from '../services/audit-service.js';
import { validateUrlNotInternal } from '../../utils/ssrf-guard.js';
import { generateReportFilename } from '../../utils/report-filename.js';
import type { ProgressEvent } from '../types.js';

const AuditRequestSchema = z.object({
  url: z
    .string()
    .url('Please provide a valid URL')
    .refine((u) => {
      try {
        const parsed = new URL(u);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    }, 'URL must use http:// or https://'),
  modules: z
    .array(z.enum(['seo', 'performance', 'security']))
    .default(['seo', 'performance', 'security']),
  language: z.enum(['en', 'zh-TW']).default('en'),
  performanceMode: z.enum(['desktop', 'mobile-4g']).default('desktop'),
  crawlDepth: z.number().min(1).max(50).default(30),
  parallel: z.boolean().default(false),
});

export function createAuditRoutes(auditService: AuditService): Hono {
  const routes = new Hono();

  // POST /audit - Start a new audit
  routes.post('/audit', async (c) => {
    // Parse and validate request body
    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const parsed = AuditRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const config = parsed.data;

    // SSRF check — skip in desktop mode (user scans their own targets)
    if (!process.env['ELECTRON_MODE']) {
      const ssrfError = await validateUrlNotInternal(config.url);
      if (ssrfError) {
        return c.json({ error: ssrfError }, 400);
      }
    }

    try {
      const auditId = auditService.enqueue(config);
      return c.json({ auditId, status: 'queued' }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('queue is full')) {
        return c.json({ error: message }, 503);
      }
      return c.json({ error: message }, 500);
    }
  });

  // GET /audit/:id/progress - SSE stream
  routes.get('/audit/:id/progress', async (c) => {
    const id = c.req.param('id');
    const job = auditService.getJob(id);

    if (!job) {
      return c.json({ error: 'Audit not found' }, 404);
    }

    return streamSSE(c, async (stream) => {
      // Send all existing progress events first
      for (const event of job.progress) {
        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify(event),
        });
      }

      // If already complete/failed, send final event and close
      if (job.status === 'complete' || job.status === 'failed') {
        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({ status: job.status }),
        });
        return;
      }

      // Listen for new progress events
      const onProgress = async (event: ProgressEvent) => {
        try {
          await stream.writeSSE({
            event: 'progress',
            data: JSON.stringify(event),
          });

          if (event.status === 'complete' && event.module === 'system') {
            await stream.writeSSE({
              event: 'done',
              data: JSON.stringify({ status: 'complete' }),
            });
          } else if (event.status === 'failed' && event.module === 'system') {
            await stream.writeSSE({
              event: 'done',
              data: JSON.stringify({ status: 'failed', error: event.message }),
            });
          }
        } catch {
          // Client disconnected
        }
      };

      auditService.events.on(`progress:${id}`, onProgress);

      // SSE keepalive: send comment every 15s
      const keepalive = setInterval(async () => {
        try {
          await stream.writeSSE({ event: 'ping', data: '' });
        } catch {
          clearInterval(keepalive);
        }
      }, 15000);

      // Declare completion listener outside the Promise so it can be cleaned up after await
      let onDone: (() => void) | undefined;

      // Wait for completion
      await new Promise<void>((resolve) => {
        const checkDone = () => {
          const currentJob = auditService.getJob(id);
          return !!(
            currentJob &&
            (currentJob.status === 'complete' || currentJob.status === 'failed')
          );
        };

        // Check periodically in case we missed an event
        const interval = setInterval(() => {
          if (checkDone()) {
            resolve();
          }
        }, 2000);

        onDone = () => {
          if (checkDone()) {
            clearInterval(interval);
            resolve();
          }
        };

        auditService.events.on(`progress:${id}`, onDone);

        // Also clean up after stream ends (client disconnect)
        stream.onAbort(() => {
          clearInterval(interval);
          clearInterval(keepalive);
          auditService.events.removeListener(`progress:${id}`, onProgress);
          if (onDone) {
            auditService.events.removeListener(`progress:${id}`, onDone);
          }
          resolve();
        });
      });

      clearInterval(keepalive);
      auditService.events.removeListener(`progress:${id}`, onProgress);
      if (onDone) {
        auditService.events.removeListener(`progress:${id}`, onDone);
      }
    });
  });

  // GET /audit/:id/result - JSON result
  routes.get('/audit/:id/result', (c) => {
    const job = auditService.getJob(c.req.param('id'));
    if (!job) {
      return c.json({ error: 'Audit not found' }, 404);
    }
    if (job.status !== 'complete') {
      return c.json({ error: 'Audit not complete', status: job.status }, 400);
    }
    return c.json(job.result);
  });

  // GET /audit/:id/report - HTML report
  routes.get('/audit/:id/report', (c) => {
    const job = auditService.getJob(c.req.param('id'));
    if (!job) {
      return c.json({ error: 'Audit not found' }, 404);
    }
    if (job.status !== 'complete' || !job.htmlReport) {
      return c.json({ error: 'Report not ready', status: job.status }, 400);
    }
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'none'; style-src 'unsafe-inline'"
    );
    return c.html(job.htmlReport);
  });

  // GET /audit/:id/pdf - PDF download
  routes.get('/audit/:id/pdf', async (c) => {
    const job = auditService.getJob(c.req.param('id'));
    if (!job) {
      return c.json({ error: 'Audit not found' }, 404);
    }
    if (job.status !== 'complete' || !job.pdfPath) {
      return c.json({ error: 'PDF not ready', status: job.status }, 400);
    }

    const exists = await fs.pathExists(job.pdfPath);
    if (!exists) {
      return c.json({ error: 'PDF file not found' }, 404);
    }

    const buffer = await fs.readFile(job.pdfPath);
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${generateReportFilename(job.config.url)}.pdf"`,
      },
    });
  });

  return routes;
}
