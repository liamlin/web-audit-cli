/**
 * Integration tests for PerformanceAuditor module.
 * Mocks the Lighthouse module to return fixture data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditCategory, AuditSeverity, type CliConfig } from '../../src/types/index.js';
import lighthouseFixture from '../fixtures/lighthouse-result.json';

// Mock chrome-launcher before importing PerformanceAuditor
vi.mock('chrome-launcher', () => ({
  launch: vi.fn().mockResolvedValue({
    port: 9222,
    kill: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock lighthouse module
vi.mock('lighthouse', () => ({
  default: vi.fn(),
}));

// Mock chrome-detector module
vi.mock('../../src/modules/performance/chrome-detector.js', () => ({
  checkChromeInstalled: vi.fn().mockResolvedValue({ installed: true, version: '120.0.0' }),
  getChromeInstallInstructions: vi.fn().mockReturnValue('Install Chrome'),
}));

// Default test configuration
const createConfig = (overrides: Partial<CliConfig> = {}): CliConfig => ({
  url: 'https://test-site.com',
  output: './reports',
  modules: ['performance'],
  format: ['json'],
  crawlDepth: 50,
  timeout: 300,
  securityScanMode: 'passive',
  performanceMode: 'desktop',
  language: 'en',
  verbose: false,
  ...overrides,
});

describe('PerformanceAuditor Integration Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset module cache for PerformanceAuditor to pick up fresh mocks
    vi.resetModules();
  });

  describe('Core Web Vitals Analysis', () => {
    it('should detect critical LCP issues from Lighthouse results', async () => {
      // Re-import mocked modules after reset
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseFixture as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      // Import PerformanceAuditor after mocks are set up
      const { PerformanceAuditor } = await import('../../src/modules/performance/index.js');

      const config = createConfig();
      const auditor = new PerformanceAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.category).toBe(AuditCategory.PERFORMANCE);

      // LCP is 4500ms which exceeds the 4000ms "poor" threshold
      const lcpIssue = result.data!.issues.find((issue) => issue.id === 'LCP-CRITICAL');
      expect(lcpIssue).toBeDefined();
      expect(lcpIssue!.severity).toBe(AuditSeverity.CRITICAL);
      expect(lcpIssue!.rawValue).toEqual({ lcp: 4500 });
    });

    it('should detect critical CLS issues from Lighthouse results', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseFixture as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { PerformanceAuditor } = await import('../../src/modules/performance/index.js');

      const config = createConfig();
      const auditor = new PerformanceAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      // CLS is 0.35 which exceeds the 0.25 "poor" threshold
      const clsIssue = result.data!.issues.find((issue) => issue.id === 'CLS-CRITICAL');
      expect(clsIssue).toBeDefined();
      expect(clsIssue!.severity).toBe(AuditSeverity.CRITICAL);
      expect(clsIssue!.rawValue).toEqual({ cls: 0.35 });
    });

    it('should detect critical TBT issues from Lighthouse results', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseFixture as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { PerformanceAuditor } = await import('../../src/modules/performance/index.js');

      const config = createConfig();
      const auditor = new PerformanceAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      // TBT is 750ms which exceeds the 600ms "poor" threshold
      const tbtIssue = result.data!.issues.find((issue) => issue.id === 'TBT-CRITICAL');
      expect(tbtIssue).toBeDefined();
      expect(tbtIssue!.severity).toBe(AuditSeverity.CRITICAL);
      expect(tbtIssue!.rawValue).toEqual({ tbt: 750 });
    });
  });

  describe('Optimization Opportunities', () => {
    it('should extract render-blocking resources opportunity', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseFixture as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { PerformanceAuditor } = await import('../../src/modules/performance/index.js');

      const config = createConfig();
      const auditor = new PerformanceAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);

      // Render-blocking resources has 600ms savings, should be HIGH severity
      const renderBlockingIssue = result.data!.issues.find(
        (issue) => issue.id === 'RENDER-BLOCKING-RESOURCES'
      );
      expect(renderBlockingIssue).toBeDefined();
      expect(renderBlockingIssue!.severity).toBe(AuditSeverity.HIGH);
    });

    it('should extract unused JavaScript opportunity', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseFixture as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { PerformanceAuditor } = await import('../../src/modules/performance/index.js');

      const config = createConfig();
      const auditor = new PerformanceAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);

      // Unused JavaScript has 350ms savings, should be MEDIUM severity
      const unusedJsIssue = result.data!.issues.find((issue) => issue.id === 'UNUSED-JAVASCRIPT');
      expect(unusedJsIssue).toBeDefined();
      expect(unusedJsIssue!.severity).toBe(AuditSeverity.MEDIUM);
    });

    it('should extract offscreen images opportunity', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseFixture as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { PerformanceAuditor } = await import('../../src/modules/performance/index.js');

      const config = createConfig();
      const auditor = new PerformanceAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);

      // Offscreen images has 150ms savings, should be LOW severity
      const offscreenImagesIssue = result.data!.issues.find(
        (issue) => issue.id === 'OFFSCREEN-IMAGES'
      );
      expect(offscreenImagesIssue).toBeDefined();
      expect(offscreenImagesIssue!.severity).toBe(AuditSeverity.LOW);
    });
  });

  describe('Performance Score', () => {
    it('should include Lighthouse score in metadata', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseFixture as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { PerformanceAuditor } = await import('../../src/modules/performance/index.js');

      const config = createConfig();
      const auditor = new PerformanceAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);
      expect(result.data!.metadata).toBeDefined();
      expect(result.data!.metadata!.lighthouseScore).toBe(65);
    });

    it('should include all Core Web Vitals in metadata', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseFixture as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { PerformanceAuditor } = await import('../../src/modules/performance/index.js');

      const config = createConfig();
      const auditor = new PerformanceAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);
      expect(result.data!.metadata).toMatchObject({
        lcp: 4500,
        cls: 0.35,
        tbt: 750,
        fcp: 2000,
        si: 4000,
      });
    });
  });

  describe('Good Performance Results', () => {
    it('should report no issues when all metrics are good', async () => {
      const goodPerformanceFixture = {
        lhr: {
          categories: {
            performance: { score: 0.95 },
          },
          audits: {
            'largest-contentful-paint': { numericValue: 1500 },
            'cumulative-layout-shift': { numericValue: 0.05 },
            'total-blocking-time': { numericValue: 100 },
            'first-contentful-paint': { numericValue: 1200 },
            'speed-index': { numericValue: 2000 },
            'unused-javascript': { score: 1 },
            'offscreen-images': { score: 1 },
            'render-blocking-resources': { score: 1 },
            'uses-long-cache-ttl': { score: 1 },
          },
        },
      };

      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(goodPerformanceFixture as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { PerformanceAuditor } = await import('../../src/modules/performance/index.js');

      const config = createConfig();
      const auditor = new PerformanceAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);
      expect(result.data!.issues).toHaveLength(0);
      expect(result.data!.score).toBe(100);
    });
  });

  describe('Needs Improvement Thresholds', () => {
    it('should detect metrics that need improvement (not critical)', async () => {
      const needsImprovementFixture = {
        lhr: {
          categories: {
            performance: { score: 0.75 },
          },
          audits: {
            'largest-contentful-paint': { numericValue: 3000 }, // Between 2500-4000
            'cumulative-layout-shift': { numericValue: 0.15 }, // Between 0.1-0.25
            'total-blocking-time': { numericValue: 400 }, // Between 300-600
            'first-contentful-paint': { numericValue: 2000 },
            'speed-index': { numericValue: 4000 },
            'unused-javascript': { score: 1 },
            'offscreen-images': { score: 1 },
            'render-blocking-resources': { score: 1 },
            'uses-long-cache-ttl': { score: 1 },
          },
        },
      };

      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(needsImprovementFixture as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { PerformanceAuditor } = await import('../../src/modules/performance/index.js');

      const config = createConfig();
      const auditor = new PerformanceAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);

      // LCP needs improvement (HIGH, not CRITICAL)
      const lcpIssue = result.data!.issues.find((issue) => issue.id === 'LCP-POOR');
      expect(lcpIssue).toBeDefined();
      expect(lcpIssue!.severity).toBe(AuditSeverity.HIGH);

      // CLS needs improvement (HIGH, not CRITICAL)
      const clsIssue = result.data!.issues.find((issue) => issue.id === 'CLS-POOR');
      expect(clsIssue).toBeDefined();
      expect(clsIssue!.severity).toBe(AuditSeverity.HIGH);

      // TBT needs improvement (HIGH, not CRITICAL)
      const tbtIssue = result.data!.issues.find((issue) => issue.id === 'TBT-POOR');
      expect(tbtIssue).toBeDefined();
      expect(tbtIssue!.severity).toBe(AuditSeverity.HIGH);
    });
  });

  describe('Error Handling', () => {
    it('should handle Lighthouse returning no results', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(null as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { PerformanceAuditor } = await import('../../src/modules/performance/index.js');

      const config = createConfig();
      const auditor = new PerformanceAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle Lighthouse throwing an error', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockRejectedValue(new Error('Chrome crashed'));

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { PerformanceAuditor } = await import('../../src/modules/performance/index.js');

      const config = createConfig();
      const auditor = new PerformanceAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('Chrome crashed');
    });
  });

  describe('Chrome Lifecycle', () => {
    it('should always kill Chrome even when Lighthouse fails', async () => {
      const mockKill = vi.fn().mockResolvedValue(undefined);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: mockKill,
      } as never);

      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockRejectedValue(new Error('Failed'));

      const { PerformanceAuditor } = await import('../../src/modules/performance/index.js');

      const config = createConfig();
      const auditor = new PerformanceAuditor(config);
      await auditor.run('https://test-site.com');

      // Chrome should be killed even on failure
      expect(mockKill).toHaveBeenCalled();
    });
  });

  describe('Chrome Detection', () => {
    it('should return skipped result when Chrome is not installed', async () => {
      // Mock Chrome as not installed
      const chromeDetector = await import('../../src/modules/performance/chrome-detector.js');
      vi.mocked(chromeDetector.checkChromeInstalled).mockResolvedValue({
        installed: false,
        error: 'Chrome not found',
      });
      vi.mocked(chromeDetector.getChromeInstallInstructions).mockReturnValue(
        'Install Chrome: brew install --cask google-chrome'
      );

      const { PerformanceAuditor } = await import('../../src/modules/performance/index.js');

      const config = createConfig();
      const auditor = new PerformanceAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(false);
      expect(result.data!.status).toBe('skipped');
      expect(result.data!.errorMessage).toContain('Chrome/Chromium is not installed');
      expect(result.error!.code).toBe('CHROME_NOT_INSTALLED');
      expect(result.error!.recoverable).toBe(true);
    });

    it('should proceed with audit when Chrome is installed', async () => {
      // Mock Chrome as installed
      const chromeDetector = await import('../../src/modules/performance/chrome-detector.js');
      vi.mocked(chromeDetector.checkChromeInstalled).mockResolvedValue({
        installed: true,
        path: '/usr/bin/google-chrome',
        version: '120.0.6099.109',
      });

      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseFixture as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { PerformanceAuditor } = await import('../../src/modules/performance/index.js');

      const config = createConfig();
      const auditor = new PerformanceAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('success');
    });
  });
});
