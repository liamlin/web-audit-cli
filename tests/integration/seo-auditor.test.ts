/**
 * Integration tests for SeoAuditor module.
 * Tests Lighthouse SEO integration, sitemap validation, and broken link detection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditCategory, AuditSeverity, type CliConfig } from '../../src/types/index.js';

// We need to mock the entire crawlee module
vi.mock('crawlee', () => {
  return {
    CheerioCrawler: vi.fn(),
  };
});

// Mock chrome-launcher
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

// Mock sitemap-validator module
vi.mock('../../src/modules/seo/sitemap-validator.js', () => ({
  validateSitemap: vi.fn(),
}));

// Default test configuration
const createConfig = (overrides: Partial<CliConfig> = {}): CliConfig => ({
  url: 'https://test-site.com',
  output: './reports',
  modules: ['seo'],
  format: ['json'],
  crawlDepth: 5,
  timeout: 60,
  performanceMode: 'desktop',
  language: 'en',
  verbose: false,
  parallel: false,
  ...overrides,
});

// Helper to create a mock Cheerio API
function createMockCheerio(html: string) {
  const cheerio = require('cheerio');
  return cheerio.load(html);
}

// Sample Lighthouse SEO result with issues
const lighthouseSeoResultWithIssues = {
  lhr: {
    categories: {
      seo: { score: 0.7 },
    },
    audits: {
      'is-crawlable': { score: 1, title: 'Page is crawlable' },
      'document-title': { score: 0, title: 'Document lacks title', description: 'Add a title' },
      'http-status-code': { score: 1, title: 'HTTP status OK' },
      'robots-txt': { score: 1, title: 'robots.txt valid' },
      'meta-description': {
        score: 0,
        title: 'Missing meta description',
        description: 'Add a meta description',
      },
      canonical: { score: 1, title: 'Canonical OK' },
      'link-text': { score: 1, title: 'Link text OK' },
      'crawlable-anchors': { score: 1, title: 'Anchors crawlable' },
      'image-alt': { score: 0, title: 'Images missing alt', description: 'Add alt text' },
      hreflang: { score: 1, title: 'Hreflang OK' },
    },
  },
};

// Sample Lighthouse SEO result - all passing
const lighthouseSeoResultAllPassing = {
  lhr: {
    categories: {
      seo: { score: 1 },
    },
    audits: {
      'is-crawlable': { score: 1, title: 'Page is crawlable' },
      'document-title': { score: 1, title: 'Document has title' },
      'http-status-code': { score: 1, title: 'HTTP status OK' },
      'robots-txt': { score: 1, title: 'robots.txt valid' },
      'meta-description': { score: 1, title: 'Meta description present' },
      canonical: { score: 1, title: 'Canonical OK' },
      'link-text': { score: 1, title: 'Link text OK' },
      'crawlable-anchors': { score: 1, title: 'Anchors crawlable' },
      'image-alt': { score: 1, title: 'Images have alt' },
      hreflang: { score: 1, title: 'Hreflang OK' },
    },
  },
};

describe('SeoAuditor Integration Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-setup chrome-detector mock (clearAllMocks clears the implementation)
    const chromeDetector = await import('../../src/modules/performance/chrome-detector.js');
    vi.mocked(chromeDetector.checkChromeInstalled).mockResolvedValue({
      installed: true,
      version: '120.0.0',
    });
    vi.mocked(chromeDetector.getChromeInstallInstructions).mockReturnValue('Install Chrome');

    // Setup CheerioCrawler mock to do nothing by default
    const crawlee = await import('crawlee');
    vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
      return {
        run: vi.fn().mockImplementation(async () => {
          // Default: do nothing, return immediately
        }),
      } as never;
    });

    // Setup sitemap validator mock to return not found by default
    const sitemapValidator = await import('../../src/modules/seo/sitemap-validator.js');
    vi.mocked(sitemapValidator.validateSitemap).mockResolvedValue({
      found: false,
      valid: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Lighthouse SEO Audits', () => {
    it('should detect Lighthouse SEO issues', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseSeoResultWithIssues as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      // Setup crawler to mark a page as crawled
      const crawlee = await import('crawlee');
      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as { requestHandler: (context: unknown) => Promise<void> };
        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = '<html><body>Test</body></html>';
            const $ = createMockCheerio(html);
            await conf.requestHandler({
              request: { url: urls[0] },
              response: { statusCode: 200 },
              $,
              enqueueLinks: vi.fn().mockResolvedValue(undefined),
            });
          }),
        } as never;
      });

      const { SeoAuditor } = await import('../../src/modules/seo/index.js');
      const config = createConfig({ crawlDepth: 1 });
      const auditor = new SeoAuditor(config);
      const result = await auditor.run('https://test-site.com/');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.category).toBe(AuditCategory.SEO);

      // Check for Lighthouse SEO issues
      const missingTitleIssue = result.data!.issues.find(
        (issue) => issue.id === 'LH-MISSING-TITLE'
      );
      expect(missingTitleIssue).toBeDefined();
      expect(missingTitleIssue!.severity).toBe(AuditSeverity.HIGH);

      const missingMetaDescIssue = result.data!.issues.find(
        (issue) => issue.id === 'LH-MISSING-META-DESC'
      );
      expect(missingMetaDescIssue).toBeDefined();
      expect(missingMetaDescIssue!.severity).toBe(AuditSeverity.MEDIUM);

      const missingImageAltIssue = result.data!.issues.find(
        (issue) => issue.id === 'LH-MISSING-IMAGE-ALT'
      );
      expect(missingImageAltIssue).toBeDefined();
      expect(missingImageAltIssue!.severity).toBe(AuditSeverity.LOW);
    });

    it('should report no Lighthouse issues when all audits pass', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseSeoResultAllPassing as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      // Setup crawler to mark a page as crawled
      const crawlee = await import('crawlee');
      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as { requestHandler: (context: unknown) => Promise<void> };
        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = '<html><body>Test</body></html>';
            const $ = createMockCheerio(html);
            await conf.requestHandler({
              request: { url: urls[0] },
              response: { statusCode: 200 },
              $,
              enqueueLinks: vi.fn().mockResolvedValue(undefined),
            });
          }),
        } as never;
      });

      const { SeoAuditor } = await import('../../src/modules/seo/index.js');
      const config = createConfig({ crawlDepth: 1 });
      const auditor = new SeoAuditor(config);
      const result = await auditor.run('https://test-site.com/');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      // Should have no Lighthouse SEO issues (only sitemap not found)
      const lighthouseIssues = result.data!.issues.filter((issue) => issue.id.startsWith('LH-'));
      expect(lighthouseIssues).toHaveLength(0);
    });

    it('should handle Chrome not installed gracefully', async () => {
      const chromeDetector = await import('../../src/modules/performance/chrome-detector.js');
      vi.mocked(chromeDetector.checkChromeInstalled).mockResolvedValue({
        installed: false,
        error: 'Chrome not found',
      });

      // Setup crawler to mark a page as crawled
      const crawlee = await import('crawlee');
      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as { requestHandler: (context: unknown) => Promise<void> };
        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = '<html><body>Test</body></html>';
            const $ = createMockCheerio(html);
            await conf.requestHandler({
              request: { url: urls[0] },
              response: { statusCode: 200 },
              $,
              enqueueLinks: vi.fn().mockResolvedValue(undefined),
            });
          }),
        } as never;
      });

      const { SeoAuditor } = await import('../../src/modules/seo/index.js');
      const config = createConfig({ crawlDepth: 1 });
      const auditor = new SeoAuditor(config);
      const result = await auditor.run('https://test-site.com/');

      // Should still succeed (with partial status due to Chrome warning)
      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('partial');
    });
  });

  describe('Sitemap Validation', () => {
    it('should detect missing sitemap', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseSeoResultAllPassing as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const sitemapValidator = await import('../../src/modules/seo/sitemap-validator.js');
      vi.mocked(sitemapValidator.validateSitemap).mockResolvedValue({
        found: false,
        valid: false,
      });

      // Setup crawler to mark a page as crawled
      const crawlee = await import('crawlee');
      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as { requestHandler: (context: unknown) => Promise<void> };
        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = '<html><body>Test</body></html>';
            const $ = createMockCheerio(html);
            await conf.requestHandler({
              request: { url: urls[0] },
              response: { statusCode: 200 },
              $,
              enqueueLinks: vi.fn().mockResolvedValue(undefined),
            });
          }),
        } as never;
      });

      const { SeoAuditor } = await import('../../src/modules/seo/index.js');
      const config = createConfig({ crawlDepth: 1 });
      const auditor = new SeoAuditor(config);
      const result = await auditor.run('https://test-site.com/');

      expect(result.success).toBe(true);
      const sitemapIssue = result.data!.issues.find((issue) => issue.id === 'SITEMAP-NOT-FOUND');
      expect(sitemapIssue).toBeDefined();
      expect(sitemapIssue!.severity).toBe(AuditSeverity.LOW);
    });

    it('should detect invalid sitemap', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseSeoResultAllPassing as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const sitemapValidator = await import('../../src/modules/seo/sitemap-validator.js');
      vi.mocked(sitemapValidator.validateSitemap).mockResolvedValue({
        found: true,
        valid: false,
        urlCount: 5,
        validationErrors: ['URL entry 3: Invalid URL in <loc>'],
      });

      // Setup crawler to mark a page as crawled
      const crawlee = await import('crawlee');
      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as { requestHandler: (context: unknown) => Promise<void> };
        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = '<html><body>Test</body></html>';
            const $ = createMockCheerio(html);
            await conf.requestHandler({
              request: { url: urls[0] },
              response: { statusCode: 200 },
              $,
              enqueueLinks: vi.fn().mockResolvedValue(undefined),
            });
          }),
        } as never;
      });

      const { SeoAuditor } = await import('../../src/modules/seo/index.js');
      const config = createConfig({ crawlDepth: 1 });
      const auditor = new SeoAuditor(config);
      const result = await auditor.run('https://test-site.com/');

      expect(result.success).toBe(true);
      const sitemapIssue = result.data!.issues.find((issue) => issue.id === 'SITEMAP-XSD-INVALID');
      expect(sitemapIssue).toBeDefined();
      expect(sitemapIssue!.severity).toBe(AuditSeverity.HIGH);
    });

    it('should detect sitemap fetch error', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseSeoResultAllPassing as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const sitemapValidator = await import('../../src/modules/seo/sitemap-validator.js');
      vi.mocked(sitemapValidator.validateSitemap).mockResolvedValue({
        found: true,
        valid: false,
        fetchError: 'HTTP 500 Internal Server Error',
      });

      // Setup crawler to mark a page as crawled
      const crawlee = await import('crawlee');
      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as { requestHandler: (context: unknown) => Promise<void> };
        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = '<html><body>Test</body></html>';
            const $ = createMockCheerio(html);
            await conf.requestHandler({
              request: { url: urls[0] },
              response: { statusCode: 200 },
              $,
              enqueueLinks: vi.fn().mockResolvedValue(undefined),
            });
          }),
        } as never;
      });

      const { SeoAuditor } = await import('../../src/modules/seo/index.js');
      const config = createConfig({ crawlDepth: 1 });
      const auditor = new SeoAuditor(config);
      const result = await auditor.run('https://test-site.com/');

      expect(result.success).toBe(true);
      const sitemapIssue = result.data!.issues.find((issue) => issue.id === 'SITEMAP-FETCH-ERROR');
      expect(sitemapIssue).toBeDefined();
      expect(sitemapIssue!.severity).toBe(AuditSeverity.MEDIUM);
    });

    it('should report no sitemap issues when sitemap is valid', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseSeoResultAllPassing as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const sitemapValidator = await import('../../src/modules/seo/sitemap-validator.js');
      vi.mocked(sitemapValidator.validateSitemap).mockResolvedValue({
        found: true,
        valid: true,
        urlCount: 10,
      });

      // Setup crawler to mark a page as crawled
      const crawlee = await import('crawlee');
      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as { requestHandler: (context: unknown) => Promise<void> };
        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = '<html><body>Test</body></html>';
            const $ = createMockCheerio(html);
            await conf.requestHandler({
              request: { url: urls[0] },
              response: { statusCode: 200 },
              $,
              enqueueLinks: vi.fn().mockResolvedValue(undefined),
            });
          }),
        } as never;
      });

      const { SeoAuditor } = await import('../../src/modules/seo/index.js');
      const config = createConfig({ crawlDepth: 1 });
      const auditor = new SeoAuditor(config);
      const result = await auditor.run('https://test-site.com/');

      expect(result.success).toBe(true);
      const sitemapIssues = result.data!.issues.filter((issue) => issue.id.startsWith('SITEMAP-'));
      expect(sitemapIssues).toHaveLength(0);
    });
  });

  describe('Broken links detection', () => {
    it('should detect 404 broken links', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseSeoResultAllPassing as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const sitemapValidator = await import('../../src/modules/seo/sitemap-validator.js');
      vi.mocked(sitemapValidator.validateSitemap).mockResolvedValue({
        found: true,
        valid: true,
        urlCount: 5,
      });

      const crawlee = await import('crawlee');
      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as {
          requestHandler: (context: unknown) => Promise<void>;
          failedRequestHandler: (context: unknown) => Promise<void>;
        };

        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            // Handle the main page
            const mainHtml = '<html><body><a href="/broken">Link</a></body></html>';
            const $ = createMockCheerio(mainHtml);
            await conf.requestHandler({
              request: { url: urls[0] },
              response: { statusCode: 200 },
              $,
              enqueueLinks: vi.fn().mockResolvedValue(undefined),
            });

            // Simulate the failed request for the broken link
            await conf.failedRequestHandler({
              request: {
                url: 'https://test-site.com/broken',
                errorMessages: ['Request failed with status code: 404'],
              },
            });
          }),
        } as never;
      });

      const { SeoAuditor } = await import('../../src/modules/seo/index.js');
      const config = createConfig({ crawlDepth: 5 });
      const auditor = new SeoAuditor(config);
      const result = await auditor.run('https://test-site.com/');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const brokenLinkIssue = result.data!.issues.find((issue) => issue.id === 'BROKEN-LINK-404');
      expect(brokenLinkIssue).toBeDefined();
      expect(brokenLinkIssue!.severity).toBe(AuditSeverity.MEDIUM);
      expect(brokenLinkIssue!.title).toContain('404');
    });

    it('should detect 500 server errors', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseSeoResultAllPassing as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const sitemapValidator = await import('../../src/modules/seo/sitemap-validator.js');
      vi.mocked(sitemapValidator.validateSitemap).mockResolvedValue({
        found: true,
        valid: true,
        urlCount: 5,
      });

      const crawlee = await import('crawlee');
      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as {
          requestHandler: (context: unknown) => Promise<void>;
          failedRequestHandler: (context: unknown) => Promise<void>;
        };

        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            // Handle the main page
            const mainHtml = '<html><body><a href="/error">Link</a></body></html>';
            const $ = createMockCheerio(mainHtml);
            await conf.requestHandler({
              request: { url: urls[0] },
              response: { statusCode: 200 },
              $,
              enqueueLinks: vi.fn().mockResolvedValue(undefined),
            });

            // Simulate server error
            await conf.failedRequestHandler({
              request: {
                url: 'https://test-site.com/error',
                errorMessages: ['Request failed with status code: 500'],
              },
            });
          }),
        } as never;
      });

      const { SeoAuditor } = await import('../../src/modules/seo/index.js');
      const config = createConfig({ crawlDepth: 5 });
      const auditor = new SeoAuditor(config);
      const result = await auditor.run('https://test-site.com/');

      expect(result.success).toBe(true);
      const brokenLinkIssue = result.data!.issues.find((issue) => issue.id === 'BROKEN-LINK-500');
      expect(brokenLinkIssue).toBeDefined();
      expect(brokenLinkIssue!.severity).toBe(AuditSeverity.HIGH);
    });
  });

  describe('Audit result metadata', () => {
    it('should include audit metadata', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseSeoResultAllPassing as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const sitemapValidator = await import('../../src/modules/seo/sitemap-validator.js');
      vi.mocked(sitemapValidator.validateSitemap).mockResolvedValue({
        found: true,
        valid: true,
        urlCount: 5,
      });

      const crawlee = await import('crawlee');
      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as { requestHandler: (context: unknown) => Promise<void> };
        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = '<html><body>Test</body></html>';
            const $ = createMockCheerio(html);
            await conf.requestHandler({
              request: { url: urls[0] },
              response: { statusCode: 200 },
              $,
              enqueueLinks: vi.fn().mockResolvedValue(undefined),
            });
          }),
        } as never;
      });

      const { SeoAuditor } = await import('../../src/modules/seo/index.js');
      const config = createConfig({ crawlDepth: 1 });
      const auditor = new SeoAuditor(config);
      const result = await auditor.run('https://test-site.com/');

      expect(result.success).toBe(true);
      expect(result.data!.metadata).toBeDefined();
      expect(result.data!.metadata!.pagesAudited).toBeGreaterThanOrEqual(1);
      expect(result.data!.metadata!.brokenLinksFound).toBe(0);
      expect(result.data!.metadata!.lighthouseAuditsRun).toBe(true);
    });
  });

  describe('Chrome lifecycle', () => {
    it('should always kill Chrome even when Lighthouse fails', async () => {
      const mockKill = vi.fn().mockResolvedValue(undefined);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: mockKill,
      } as never);

      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockRejectedValue(new Error('Lighthouse failed'));

      const sitemapValidator = await import('../../src/modules/seo/sitemap-validator.js');
      vi.mocked(sitemapValidator.validateSitemap).mockResolvedValue({
        found: true,
        valid: true,
        urlCount: 5,
      });

      const crawlee = await import('crawlee');
      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as { requestHandler: (context: unknown) => Promise<void> };
        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = '<html><body>Test</body></html>';
            const $ = createMockCheerio(html);
            await conf.requestHandler({
              request: { url: urls[0] },
              response: { statusCode: 200 },
              $,
              enqueueLinks: vi.fn().mockResolvedValue(undefined),
            });
          }),
        } as never;
      });

      const { SeoAuditor } = await import('../../src/modules/seo/index.js');
      const config = createConfig({ crawlDepth: 1 });
      const auditor = new SeoAuditor(config);
      await auditor.run('https://test-site.com/');

      // Chrome should be killed even on failure
      expect(mockKill).toHaveBeenCalled();
    });
  });

  describe('Well-optimized site', () => {
    it('should report no issues for a fully optimized site', async () => {
      const lighthouse = await import('lighthouse');
      vi.mocked(lighthouse.default).mockResolvedValue(lighthouseSeoResultAllPassing as never);

      const chromeLauncher = await import('chrome-launcher');
      vi.mocked(chromeLauncher.launch).mockResolvedValue({
        port: 9222,
        kill: vi.fn().mockResolvedValue(undefined),
      } as never);

      const sitemapValidator = await import('../../src/modules/seo/sitemap-validator.js');
      vi.mocked(sitemapValidator.validateSitemap).mockResolvedValue({
        found: true,
        valid: true,
        urlCount: 10,
      });

      const crawlee = await import('crawlee');
      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as { requestHandler: (context: unknown) => Promise<void> };
        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = '<html><body>Test</body></html>';
            const $ = createMockCheerio(html);
            await conf.requestHandler({
              request: { url: urls[0] },
              response: { statusCode: 200 },
              $,
              enqueueLinks: vi.fn().mockResolvedValue(undefined),
            });
          }),
        } as never;
      });

      const { SeoAuditor } = await import('../../src/modules/seo/index.js');
      const config = createConfig({ crawlDepth: 1 });
      const auditor = new SeoAuditor(config);
      const result = await auditor.run('https://test-site.com/');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.issues).toHaveLength(0);
      expect(result.data!.status).toBe('success');
    });
  });
});
