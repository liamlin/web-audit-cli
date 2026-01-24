/**
 * Integration tests for SeoAuditor module.
 * Uses vi.mock to mock Crawlee for controlled testing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditCategory, AuditSeverity, type CliConfig } from '../../src/types/index.js';

// We need to mock the entire crawlee module
vi.mock('crawlee', () => {
  return {
    CheerioCrawler: vi.fn(),
  };
});

// Default test configuration
const createConfig = (overrides: Partial<CliConfig> = {}): CliConfig => ({
  url: 'https://test-site.com',
  output: './reports',
  modules: ['seo'],
  format: ['json'],
  crawlDepth: 5,
  timeout: 60,
  securityScanMode: 'passive',
  performanceMode: 'desktop',
  language: 'en',
  verbose: false,
  ...overrides,
});

// Helper to create a mock Cheerio API
function createMockCheerio(html: string) {
  const cheerio = require('cheerio');
  return cheerio.load(html);
}

describe('SeoAuditor Integration Tests', () => {
  let mockRequestHandler: ((context: unknown) => Promise<void>) | null = null;
  let mockFailedRequestHandler: ((context: unknown) => Promise<void>) | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup CheerioCrawler mock
    const crawlee = await import('crawlee');
    vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
      const conf = config as {
        requestHandler: (context: unknown) => Promise<void>;
        failedRequestHandler: (context: unknown) => Promise<void>;
      };
      mockRequestHandler = conf.requestHandler;
      mockFailedRequestHandler = conf.failedRequestHandler;

      return {
        run: vi.fn().mockImplementation(async (urls: string[]) => {
          // The run method will be customized per test
          // by calling mockRequestHandler with appropriate context
        }),
      } as never;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockRequestHandler = null;
    mockFailedRequestHandler = null;
  });

  describe('Page with SEO issues', () => {
    it('should detect missing title tag', async () => {
      const crawlee = await import('crawlee');

      // Setup the mock to call the request handler with our HTML
      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as {
          requestHandler: (context: unknown) => Promise<void>;
        };

        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
              </head>
              <body>
                <h1>Welcome</h1>
                <p>Content here</p>
              </body>
              </html>
            `;

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

      // Check for missing title issue
      const missingTitleIssue = result.data!.issues.find((issue) => issue.id === 'MISSING-TITLE');
      expect(missingTitleIssue).toBeDefined();
      expect(missingTitleIssue!.severity).toBe(AuditSeverity.HIGH);
    });

    it('should detect missing meta description', async () => {
      const crawlee = await import('crawlee');

      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as {
          requestHandler: (context: unknown) => Promise<void>;
        };

        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <title>Test Page Title</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
              </head>
              <body>
                <h1>Welcome to Test</h1>
                <p>Some content</p>
              </body>
              </html>
            `;

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

      const missingMetaDescIssue = result.data!.issues.find(
        (issue) => issue.id === 'MISSING-META-DESC'
      );
      expect(missingMetaDescIssue).toBeDefined();
      expect(missingMetaDescIssue!.severity).toBe(AuditSeverity.MEDIUM);
    });

    it('should detect missing H1 heading', async () => {
      const crawlee = await import('crawlee');

      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as {
          requestHandler: (context: unknown) => Promise<void>;
        };

        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <title>Test Page Title</title>
                <meta name="description" content="A test page description that is long enough">
                <meta name="viewport" content="width=device-width, initial-scale=1">
              </head>
              <body>
                <h2>This is an H2, no H1</h2>
                <p>Some content here</p>
              </body>
              </html>
            `;

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

      const missingH1Issue = result.data!.issues.find((issue) => issue.id === 'MISSING-H1');
      expect(missingH1Issue).toBeDefined();
      expect(missingH1Issue!.severity).toBe(AuditSeverity.HIGH);
    });

    it('should detect multiple SEO issues on a poorly optimized page', async () => {
      const crawlee = await import('crawlee');

      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as {
          requestHandler: (context: unknown) => Promise<void>;
        };

        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
              </head>
              <body>
                <h2>No H1 here</h2>
                <p>Minimal content</p>
              </body>
              </html>
            `;

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

      const issueIds = result.data!.issues.map((issue) => issue.id);
      expect(issueIds).toContain('MISSING-TITLE');
      expect(issueIds).toContain('MISSING-META-DESC');
      expect(issueIds).toContain('MISSING-H1');
      expect(issueIds).toContain('MISSING-LANG');
      expect(issueIds).toContain('MISSING-VIEWPORT');
      expect(issueIds).toContain('MISSING-CANONICAL');

      expect(result.data!.score).toBeLessThan(80);
    });
  });

  describe('Broken links detection', () => {
    it('should detect 404 broken links', async () => {
      const crawlee = await import('crawlee');

      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as {
          requestHandler: (context: unknown) => Promise<void>;
          failedRequestHandler: (context: unknown) => Promise<void>;
        };

        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            // First, handle the main page
            const mainHtml = `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <title>Test Page With Links</title>
                <meta name="description" content="A test page with broken links">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link rel="canonical" href="https://test-site.com/">
              </head>
              <body>
                <h1>Welcome</h1>
                <a href="/broken-page">Broken Link</a>
              </body>
              </html>
            `;

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
                url: 'https://test-site.com/broken-page',
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
      // 4xx errors are MEDIUM severity (5xx errors are HIGH)
      expect(brokenLinkIssue!.severity).toBe(AuditSeverity.MEDIUM);
      expect(brokenLinkIssue!.title).toContain('404');
    });
  });

  describe('Well-optimized page', () => {
    it('should report no issues for a fully optimized page', async () => {
      const crawlee = await import('crawlee');

      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as {
          requestHandler: (context: unknown) => Promise<void>;
        };

        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Perfect SEO Page - Best Practices</title>
                <meta name="description" content="This is a well-crafted meta description that is exactly the right length for SEO purposes.">
                <link rel="canonical" href="https://test-site.com/">
              </head>
              <body>
                <h1>Welcome to Our Perfectly Optimized Page</h1>
                <p>This page follows all SEO best practices.</p>
              </body>
              </html>
            `;

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
      expect(result.data!.score).toBe(100);
      expect(result.data!.status).toBe('success');
    });
  });

  describe('Title edge cases', () => {
    it('should detect title that is too short', async () => {
      const crawlee = await import('crawlee');

      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as {
          requestHandler: (context: unknown) => Promise<void>;
        };

        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <title>Short</title>
                <meta name="description" content="Valid description here">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link rel="canonical" href="https://test-site.com/">
              </head>
              <body>
                <h1>Page Content</h1>
              </body>
              </html>
            `;

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
      const shortTitleIssue = result.data!.issues.find((issue) => issue.id === 'TITLE-TOO-SHORT');
      expect(shortTitleIssue).toBeDefined();
      expect(shortTitleIssue!.severity).toBe(AuditSeverity.MEDIUM);
    });

    it('should detect title that is too long', async () => {
      const crawlee = await import('crawlee');

      const longTitle =
        'This is an extremely long title that exceeds the recommended character limit for SEO optimization';

      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as {
          requestHandler: (context: unknown) => Promise<void>;
        };

        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <title>${longTitle}</title>
                <meta name="description" content="Valid description here">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link rel="canonical" href="https://test-site.com/">
              </head>
              <body>
                <h1>Page Content</h1>
              </body>
              </html>
            `;

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
      const longTitleIssue = result.data!.issues.find((issue) => issue.id === 'TITLE-TOO-LONG');
      expect(longTitleIssue).toBeDefined();
      expect(longTitleIssue!.severity).toBe(AuditSeverity.LOW);
    });
  });

  describe('Multiple H1 headings', () => {
    it('should detect multiple H1 tags', async () => {
      const crawlee = await import('crawlee');

      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as {
          requestHandler: (context: unknown) => Promise<void>;
        };

        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <title>Page With Multiple H1s</title>
                <meta name="description" content="Valid description here">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link rel="canonical" href="https://test-site.com/">
              </head>
              <body>
                <h1>First H1</h1>
                <p>Some content</p>
                <h1>Second H1</h1>
                <p>More content</p>
              </body>
              </html>
            `;

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
      const multipleH1Issue = result.data!.issues.find((issue) => issue.id === 'MULTIPLE-H1');
      expect(multipleH1Issue).toBeDefined();
      expect(multipleH1Issue!.severity).toBe(AuditSeverity.MEDIUM);
      expect(multipleH1Issue!.rawValue).toEqual({ count: 2 });
    });
  });

  describe('Audit result metadata', () => {
    it('should include page audit count in metadata', async () => {
      const crawlee = await import('crawlee');

      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as {
          requestHandler: (context: unknown) => Promise<void>;
        };

        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <title>Valid Title For SEO</title>
                <meta name="description" content="Valid description">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link rel="canonical" href="https://test-site.com/">
              </head>
              <body>
                <h1>Main Heading</h1>
              </body>
              </html>
            `;

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
    });
  });

  describe('HTTP status code handling', () => {
    it('should handle pages that return 4xx errors', async () => {
      const crawlee = await import('crawlee');

      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as {
          requestHandler: (context: unknown) => Promise<void>;
        };

        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            // Simulate a page returning 403
            const html = '<html><body>Forbidden</body></html>';
            const $ = createMockCheerio(html);

            await conf.requestHandler({
              request: { url: urls[0] },
              response: { statusCode: 403 },
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

      // Should have a broken link issue for the 403
      const brokenLinkIssue = result.data!.issues.find((issue) =>
        issue.id.startsWith('BROKEN-LINK-')
      );
      expect(brokenLinkIssue).toBeDefined();
    });
  });

  describe('Meta description edge cases', () => {
    it('should detect meta description that is too long', async () => {
      const crawlee = await import('crawlee');

      const longDescription =
        'This is an extremely long meta description that exceeds the recommended character limit. It goes on and on with lots of text that search engines will likely truncate in the search results snippet. This is not ideal for SEO.';

      vi.mocked(crawlee.CheerioCrawler).mockImplementation((config: unknown) => {
        const conf = config as {
          requestHandler: (context: unknown) => Promise<void>;
        };

        return {
          run: vi.fn().mockImplementation(async (urls: string[]) => {
            const html = `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <title>Valid Title Here</title>
                <meta name="description" content="${longDescription}">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link rel="canonical" href="https://test-site.com/">
              </head>
              <body>
                <h1>Page Content</h1>
              </body>
              </html>
            `;

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
      const longDescIssue = result.data!.issues.find((issue) => issue.id === 'META-DESC-TOO-LONG');
      expect(longDescIssue).toBeDefined();
      expect(longDescIssue!.severity).toBe(AuditSeverity.LOW);
    });
  });
});
