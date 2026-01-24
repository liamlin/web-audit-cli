/**
 * SEO Auditor - Crawls websites to find SEO issues.
 * Uses Crawlee with CheerioCrawler for efficient crawling.
 */

import { CheerioCrawler, type CheerioCrawlingContext } from 'crawlee';
import {
  AuditCategory,
  AuditSeverity,
  type AuditIssue,
  type AuditResult,
  type ModuleResult,
} from '../../types/index.js';
import { BaseAuditor } from '../../core/base-auditor.js';
import { runModule } from '../../utils/error-handler.js';
import { logDebug } from '../../utils/logger.js';

// Use the CheerioAPI type from the Crawlee context
type CheerioAPI = CheerioCrawlingContext['$'];

/**
 * SEO Auditor implementation using Crawlee.
 */
export class SeoAuditor extends BaseAuditor {
  protected readonly category = AuditCategory.SEO;

  private issues: AuditIssue[] = [];
  private crawledUrls: Set<string> = new Set();
  private brokenLinks: Map<string, number> = new Map();
  private warnings: string[] = [];

  /**
   * Run the SEO audit.
   */
  async run(url: string): Promise<ModuleResult<AuditResult>> {
    // Reset state for new run
    this.issues = [];
    this.crawledUrls = new Set();
    this.brokenLinks = new Map();
    this.warnings = [];

    return runModule('SEO', async () => {
      const baseUrl = new URL(url);

      const crawler = new CheerioCrawler({
        maxRequestsPerCrawl: this.config.crawlDepth,
        maxConcurrency: 5,
        requestHandlerTimeoutSecs: 30,

        requestHandler: async (context) => {
          await this.handleRequest(context, baseUrl);
        },

        failedRequestHandler: async ({ request }) => {
          this.handleFailedRequest(request.url, request.errorMessages);
        },
      });

      try {
        await crawler.run([url]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown crawl error';
        this.warnings.push(`Crawl error: ${message}`);
      }

      // Determine result status
      const status: 'success' | 'partial' | 'failed' =
        this.warnings.length > 0 && this.crawledUrls.size > 0
          ? 'partial'
          : this.crawledUrls.size > 0
            ? 'success'
            : 'failed';

      const result: AuditResult = {
        url,
        timestamp: new Date(),
        score: this.calculateScore(this.issues),
        category: this.category,
        issues: this.issues,
        status,
        metadata: {
          pagesAudited: this.crawledUrls.size,
          brokenLinksFound: this.brokenLinks.size,
        },
      };

      if (status === 'failed') {
        result.errorMessage = 'No pages could be crawled';
      }

      return result;
    });
  }

  /**
   * Handle a single page request.
   */
  private async handleRequest(context: CheerioCrawlingContext, baseUrl: URL): Promise<void> {
    const { request, response, $, enqueueLinks } = context;
    const currentUrl = request.url;

    this.crawledUrls.add(currentUrl);
    logDebug(`Crawled: ${currentUrl}`);

    // Check HTTP status
    const statusCode = response?.statusCode ?? 200;
    if (statusCode >= 400) {
      this.addBrokenLinkIssue(currentUrl, statusCode);
      return;
    }

    // Run SEO checks on the page
    this.checkTitle($, currentUrl);
    this.checkMetaDescription($, currentUrl);
    this.checkH1($, currentUrl);
    this.checkCanonical($, currentUrl);
    this.checkLanguage($, currentUrl);
    this.checkViewport($, currentUrl);

    // Enqueue internal links for crawling
    try {
      await enqueueLinks({
        strategy: 'same-domain',
        transformRequestFunction: (req) => {
          // Only crawl same-origin pages
          try {
            const reqUrl = new URL(req.url);
            if (reqUrl.origin !== baseUrl.origin) {
              return false;
            }
          } catch {
            return false;
          }
          return req;
        },
      });
    } catch (error) {
      logDebug(`Error enqueueing links: ${error}`);
    }
  }

  /**
   * Handle failed requests (broken links).
   */
  private handleFailedRequest(url: string, errorMessages: string[]): void {
    logDebug(`Failed to crawl: ${url}`);

    // Try to determine status code from error messages
    let statusCode = 0;
    for (const msg of errorMessages) {
      const match = msg.match(/status\s*(?:code)?\s*[:=]?\s*(\d{3})/i);
      if (match) {
        statusCode = parseInt(match[1], 10);
        break;
      }
    }

    if (statusCode >= 400) {
      this.addBrokenLinkIssue(url, statusCode);
    } else {
      this.warnings.push(`Failed to fetch: ${url}`);
    }
  }

  /**
   * Add a broken link issue.
   */
  private addBrokenLinkIssue(url: string, statusCode: number): void {
    if (this.brokenLinks.has(url)) {
      return;
    } // Avoid duplicates

    this.brokenLinks.set(url, statusCode);

    const severity = statusCode >= 500 ? AuditSeverity.HIGH : AuditSeverity.MEDIUM;

    this.issues.push(
      this.createIssue({
        id: `BROKEN-LINK-${statusCode}`,
        title: `Broken Link (HTTP ${statusCode})`,
        description: `A link on the site returns HTTP ${statusCode} status code`,
        severity,
        suggestion: `Fix or remove the broken link. Check if the target page exists or has moved.`,
        affectedUrl: url,
        rawValue: { statusCode, url },
      })
    );
  }

  /**
   * Check page title.
   */
  private checkTitle($: CheerioAPI, url: string): void {
    const title = $('title').text().trim();

    if (!title) {
      this.issues.push(
        this.createIssue({
          id: 'MISSING-TITLE',
          title: 'Missing Page Title',
          description: 'The page does not have a <title> tag',
          severity: AuditSeverity.HIGH,
          suggestion: 'Add a descriptive <title> tag to the page head',
          affectedUrl: url,
        })
      );
    } else if (title.length < 10) {
      this.issues.push(
        this.createIssue({
          id: 'TITLE-TOO-SHORT',
          title: 'Page Title Too Short',
          description: `Title is only ${title.length} characters (recommended: 10-60)`,
          severity: AuditSeverity.MEDIUM,
          suggestion: 'Expand the title to include relevant keywords (10-60 characters)',
          affectedUrl: url,
          rawValue: { title, length: title.length },
        })
      );
    } else if (title.length > 60) {
      this.issues.push(
        this.createIssue({
          id: 'TITLE-TOO-LONG',
          title: 'Page Title Too Long',
          description: `Title is ${title.length} characters (may be truncated in search results)`,
          severity: AuditSeverity.LOW,
          suggestion: 'Shorten the title to under 60 characters',
          affectedUrl: url,
          rawValue: { title, length: title.length },
        })
      );
    }
  }

  /**
   * Check meta description.
   */
  private checkMetaDescription($: CheerioAPI, url: string): void {
    const desc = $('meta[name="description"]').attr('content')?.trim();

    if (!desc) {
      this.issues.push(
        this.createIssue({
          id: 'MISSING-META-DESC',
          title: 'Missing Meta Description',
          description: 'The page does not have a meta description',
          severity: AuditSeverity.MEDIUM,
          suggestion:
            'Add a <meta name="description" content="..."> tag with a compelling summary (120-160 characters)',
          affectedUrl: url,
        })
      );
    } else if (desc.length > 160) {
      this.issues.push(
        this.createIssue({
          id: 'META-DESC-TOO-LONG',
          title: 'Meta Description Too Long',
          description: `Meta description is ${desc.length} characters (may be truncated)`,
          severity: AuditSeverity.LOW,
          suggestion: 'Shorten the meta description to under 160 characters',
          affectedUrl: url,
          rawValue: { description: desc, length: desc.length },
        })
      );
    }
  }

  /**
   * Check H1 heading.
   */
  private checkH1($: CheerioAPI, url: string): void {
    const h1Count = $('h1').length;

    if (h1Count === 0) {
      this.issues.push(
        this.createIssue({
          id: 'MISSING-H1',
          title: 'Missing H1 Heading',
          description: 'The page does not have an H1 heading',
          severity: AuditSeverity.HIGH,
          suggestion: 'Add a single H1 heading that describes the main topic of the page',
          affectedUrl: url,
        })
      );
    } else if (h1Count > 1) {
      this.issues.push(
        this.createIssue({
          id: 'MULTIPLE-H1',
          title: 'Multiple H1 Headings',
          description: `Page has ${h1Count} H1 headings (recommended: 1)`,
          severity: AuditSeverity.MEDIUM,
          suggestion: 'Use only one H1 heading per page for clear content hierarchy',
          affectedUrl: url,
          rawValue: { count: h1Count },
        })
      );
    }
  }

  /**
   * Check canonical URL.
   */
  private checkCanonical($: CheerioAPI, url: string): void {
    const canonical = $('link[rel="canonical"]').attr('href');

    if (!canonical) {
      this.issues.push(
        this.createIssue({
          id: 'MISSING-CANONICAL',
          title: 'Missing Canonical URL',
          description: 'The page does not specify a canonical URL',
          severity: AuditSeverity.MEDIUM,
          suggestion: 'Add a <link rel="canonical" href="..."> to prevent duplicate content issues',
          affectedUrl: url,
        })
      );
    }
  }

  /**
   * Check language declaration.
   */
  private checkLanguage($: CheerioAPI, url: string): void {
    const lang = $('html').attr('lang');

    if (!lang) {
      this.issues.push(
        this.createIssue({
          id: 'MISSING-LANG',
          title: 'Missing Language Declaration',
          description: 'The page does not declare a language in the <html> tag',
          severity: AuditSeverity.LOW,
          suggestion: 'Add a lang attribute to the <html> tag (e.g., <html lang="en">)',
          affectedUrl: url,
        })
      );
    }
  }

  /**
   * Check viewport meta tag.
   */
  private checkViewport($: CheerioAPI, url: string): void {
    const viewport = $('meta[name="viewport"]').attr('content');

    if (!viewport) {
      this.issues.push(
        this.createIssue({
          id: 'MISSING-VIEWPORT',
          title: 'Missing Viewport Meta Tag',
          description: 'The page does not have a viewport meta tag for mobile',
          severity: AuditSeverity.MEDIUM,
          suggestion: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
          affectedUrl: url,
        })
      );
    }
  }
}
