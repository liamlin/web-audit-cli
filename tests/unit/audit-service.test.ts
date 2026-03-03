/**
 * Tests for the audit service (job store + queue).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the heavy modules to avoid importing Lighthouse, Puppeteer, etc.
vi.mock('../../src/modules/seo/index.js', () => ({
  SeoAuditor: vi.fn(),
}));
vi.mock('../../src/modules/performance/index.js', () => ({
  PerformanceAuditor: vi.fn(),
}));
vi.mock('../../src/modules/security/index.js', () => ({
  SecurityAuditor: vi.fn(),
}));
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
      executiveSummary: 'Test summary',
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
vi.mock('../../src/utils/ssrf-guard.js', () => ({
  revalidateIp: vi.fn().mockResolvedValue(null),
}));

import { AuditService } from '../../src/web/services/audit-service.js';
import type { WebAuditConfig } from '../../src/web/types.js';
import { revalidateIp } from '../../src/utils/ssrf-guard.js';

const testConfig: WebAuditConfig = {
  url: 'https://example.com',
  modules: ['seo', 'performance'],
  language: 'en',
  performanceMode: 'desktop',
  crawlDepth: 30,
  parallel: false,
};

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuditService();
  });

  afterEach(() => {
    service.destroy();
  });

  describe('enqueue', () => {
    it('should create a job and return its ID', () => {
      const id = service.enqueue(testConfig);
      expect(id).toBeTruthy();
      expect(id.length).toBe(36);
    });

    it('should start processing immediately (first job goes to running)', () => {
      const id = service.enqueue(testConfig);
      const job = service.getJob(id);
      expect(job).toBeDefined();
      // First job starts running immediately since queue is empty
      expect(job!.status).toBe('running');
    });

    it('should reject when queue is full', () => {
      // Enqueue 5 jobs (max)
      for (let i = 0; i < 5; i++) {
        service.enqueue(testConfig);
      }

      // 6th should throw (the first was dequeued for running, so only 4 in queue,
      // but queue tracks waiting jobs)
      // Actually - the first job starts running immediately, so queue has 4 waiting.
      // Let's fill it up more
      expect(() => {
        for (let i = 0; i < 10; i++) {
          service.enqueue(testConfig);
        }
      }).toThrow('queue is full');
    });
  });

  describe('getJob', () => {
    it('should return undefined for non-existent job', () => {
      expect(service.getJob('nonexistent')).toBeUndefined();
    });

    it('should return the job by ID', () => {
      const id = service.enqueue(testConfig);
      const job = service.getJob(id);
      expect(job).toBeDefined();
      expect(job!.config.url).toBe('https://example.com');
    });
  });

  describe('job lifecycle', () => {
    it('should transition to running state', async () => {
      const id = service.enqueue(testConfig);

      // Give it a tick to start processing
      await new Promise((r) => setTimeout(r, 50));

      const job = service.getJob(id);
      // Job should be running or complete by now
      expect(['running', 'complete']).toContain(job!.status);
    });

    it('should emit progress events', async () => {
      const events: unknown[] = [];
      const id = service.enqueue(testConfig);

      service.events.on(`progress:${id}`, (event) => {
        events.push(event);
      });

      // Wait for completion
      await new Promise((r) => setTimeout(r, 200));

      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('SSRF revalidation', () => {
    it('should fail the job when revalidateIp detects DNS rebinding', async () => {
      vi.mocked(revalidateIp).mockResolvedValueOnce(
        'URL resolves to a private IP address (10.0.0.1). Scanning internal infrastructure is not allowed.'
      );

      const id = service.enqueue(testConfig);

      // Wait for processing
      await new Promise((r) => setTimeout(r, 200));

      const job = service.getJob(id);
      expect(job).toBeDefined();
      expect(job!.status).toBe('failed');
      expect(job!.error).toContain('private IP address');
    });

    it('should proceed normally when revalidateIp returns null', async () => {
      vi.mocked(revalidateIp).mockResolvedValueOnce(null);

      const id = service.enqueue(testConfig);

      // Wait for processing
      await new Promise((r) => setTimeout(r, 200));

      const job = service.getJob(id);
      expect(job).toBeDefined();
      expect(job!.status).toBe('complete');
    });
  });
});
