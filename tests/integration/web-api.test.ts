/**
 * Integration tests for web API routes using Hono's test client.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { createAuditRoutes } from '../../src/web/routes/audit.js';
import { AuditService } from '../../src/web/services/audit-service.js';

// Mock heavy dependencies
vi.mock('../../src/modules/seo/index.js', () => ({ SeoAuditor: vi.fn() }));
vi.mock('../../src/modules/performance/index.js', () => ({ PerformanceAuditor: vi.fn() }));
vi.mock('../../src/modules/security/index.js', () => ({ SecurityAuditor: vi.fn() }));
vi.mock('../../src/modules/reporter/index.js', () => ({
  ReportGenerator: vi.fn().mockImplementation(() => ({
    generate: vi.fn().mockResolvedValue(undefined),
    generateHtml: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('../../src/core/matrix-engine.js', () => ({
  MatrixEngine: vi.fn().mockImplementation(() => ({
    enhanceReport: vi.fn().mockReturnValue({
      url: 'https://example.com',
      generatedAt: new Date(),
      executiveSummary: 'Test',
      issues: [],
      passes: [],
      prioritizedRecommendations: [],
      rawResults: [],
      methodology: { toolsUsed: [], testsPerformed: [], auditDate: new Date() },
      language: 'en',
    }),
  })),
}));
vi.mock('../../src/core/orchestrator.js', () => ({
  Orchestrator: vi.fn().mockImplementation(() => ({
    registerModule: vi.fn(),
    runAll: vi.fn().mockResolvedValue({
      results: [],
      totalTimeMs: 1000,
      failedModules: [],
      skippedModules: [],
    }),
  })),
}));
vi.mock('fs-extra', () => ({
  default: {
    ensureDir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('<html>report</html>'),
    pathExists: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock SSRF guard to allow test URLs
vi.mock('../../src/utils/ssrf-guard.js', () => ({
  validateUrlNotInternal: vi.fn().mockResolvedValue(null),
  revalidateIp: vi.fn().mockResolvedValue(null),
}));

describe('Web API Routes', () => {
  let app: Hono;
  let service: AuditService;

  beforeAll(() => {
    service = new AuditService();
    app = new Hono();
    app.route('/api', createAuditRoutes(service));
  });

  afterAll(() => {
    service.destroy();
  });

  describe('POST /api/audit', () => {
    it('should accept valid audit request', async () => {
      const resp = await app.request('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com',
          modules: ['seo'],
        }),
      });

      expect(resp.status).toBe(201);
      const data = await resp.json();
      expect(data.auditId).toBeTruthy();
      expect(data.status).toBe('queued');
    });

    it('should reject invalid URL', async () => {
      const resp = await app.request('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'not-a-url',
          modules: ['seo'],
        }),
      });

      expect(resp.status).toBe(400);
    });

    it('should reject missing body', async () => {
      const resp = await app.request('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{',
      });

      expect(resp.status).toBe(400);
    });

    it('should accept security module (passive scanner always available)', async () => {
      const resp = await app.request('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://example.com',
          modules: ['security'],
        }),
      });

      // Accepted — passive scanner is always available
      expect(resp.status).toBe(201);
      const data = await resp.json();
      expect(data.auditId).toBeTruthy();
    });
  });

  describe('GET /api/audit/:id/result', () => {
    it('should return 404 for non-existent audit', async () => {
      const resp = await app.request('/api/audit/nonexistent/result');
      expect(resp.status).toBe(404);
    });

    it('should return 400 for incomplete audit', async () => {
      const id = service.enqueue({
        url: 'https://example.com',
        modules: ['seo'],
        language: 'en',
        performanceMode: 'desktop',
        crawlDepth: 30,
        parallel: false,
      });

      // Immediately request result (audit not yet complete)
      const resp = await app.request(`/api/audit/${id}/result`);
      // Could be 400 (not complete) or 200 (if it completed very fast)
      expect([200, 400]).toContain(resp.status);
    });
  });

  describe('GET /api/audit/:id/progress (SSE)', () => {
    it('should return 404 for non-existent audit', async () => {
      const resp = await app.request('/api/audit/nonexistent/progress');
      expect(resp.status).toBe(404);
    });

    it('should return text/event-stream content type', async () => {
      const id = service.enqueue({
        url: 'https://example.com',
        modules: ['seo'],
        language: 'en',
        performanceMode: 'desktop',
        crawlDepth: 30,
        parallel: false,
      });

      // Wait for the job to complete so the SSE stream finishes promptly
      await new Promise((r) => setTimeout(r, 200));

      const resp = await app.request(`/api/audit/${id}/progress`);
      expect(resp.status).toBe(200);
      expect(resp.headers.get('content-type')).toContain('text/event-stream');
    });

    it('should replay historical progress events for a completed audit', async () => {
      const id = service.enqueue({
        url: 'https://example.com',
        modules: ['seo'],
        language: 'en',
        performanceMode: 'desktop',
        crawlDepth: 30,
        parallel: false,
      });

      // Wait for the audit to complete
      await new Promise((r) => setTimeout(r, 300));

      const job = service.getJob(id);
      expect(job).toBeDefined();
      expect(job!.status).toBe('complete');

      // Inject historical progress events onto the job to simulate real audit progress.
      // The mocked orchestrator never calls onProgress, so job.progress is empty.
      // In production, the orchestrator pushes events here during the audit.
      job!.progress.push(
        { module: 'system', status: 'running', message: 'Audit started', timestamp: Date.now() },
        { module: 'seo', status: 'running', message: 'SEO audit running', timestamp: Date.now() },
        { module: 'seo', status: 'complete', message: 'SEO audit complete', timestamp: Date.now() }
      );

      // Connect to SSE endpoint after completion
      const resp = await app.request(`/api/audit/${id}/progress`);
      expect(resp.status).toBe(200);

      const body = await resp.text();

      // Verify that historical progress events were replayed
      const progressEvents = body.split('\n').filter((line) => line.startsWith('event: progress'));
      expect(progressEvents.length).toBe(3);

      // Verify that a "done" event was sent
      const doneEvents = body.split('\n').filter((line) => line.startsWith('event: done'));
      expect(doneEvents.length).toBe(1);
    });
  });

  describe('GET /api/audit/:id/report', () => {
    it('should return 404 for non-existent audit', async () => {
      const resp = await app.request('/api/audit/nonexistent/report');
      expect(resp.status).toBe(404);
    });
  });

  describe('GET /api/audit/:id/pdf', () => {
    it('should return 404 for non-existent audit', async () => {
      const resp = await app.request('/api/audit/nonexistent/pdf');
      expect(resp.status).toBe(404);
    });
  });
});
