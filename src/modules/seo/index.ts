/**
 * SEO Auditor - Crawls websites to find SEO issues.
 * Uses Crawlee with CheerioCrawler for broken link detection and site crawling.
 * Uses Google Lighthouse SEO audits for authoritative SEO checks.
 */

import { CheerioCrawler, type CheerioCrawlingContext } from 'crawlee';
import { type Result as LighthouseResult } from 'lighthouse';
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
import {
  checkChromeInstalled,
  getChromeInstallInstructions,
} from '../performance/chrome-detector.js';
import { runLighthouse } from '../../utils/lighthouse-runner.js';
import { validateSitemap } from './sitemap-validator.js';

/**
 * Lighthouse SEO audit mapping to our issue IDs and severities.
 * Severities are based on Lighthouse scoring weights and SEO impact.
 */
const LIGHTHOUSE_SEO_AUDITS: Record<
  string,
  { id: string; severity: AuditSeverity; title: string }
> = {
  'is-crawlable': {
    id: 'LH-NOT-CRAWLABLE',
    severity: AuditSeverity.CRITICAL,
    title: 'Page is not crawlable',
  },
  'document-title': {
    id: 'LH-MISSING-TITLE',
    severity: AuditSeverity.HIGH,
    title: 'Document does not have a <title> element',
  },
  'http-status-code': {
    id: 'LH-HTTP-ERROR',
    severity: AuditSeverity.HIGH,
    title: 'Page has unsuccessful HTTP status code',
  },
  'robots-txt': {
    id: 'LH-ROBOTS-TXT-INVALID',
    severity: AuditSeverity.MEDIUM,
    title: 'robots.txt is not valid',
  },
  'meta-description': {
    id: 'LH-MISSING-META-DESC',
    severity: AuditSeverity.MEDIUM,
    title: 'Document does not have a meta description',
  },
  canonical: {
    id: 'LH-INVALID-CANONICAL',
    severity: AuditSeverity.MEDIUM,
    title: 'Document does not have a valid rel=canonical',
  },
  'link-text': {
    id: 'LH-POOR-LINK-TEXT',
    severity: AuditSeverity.LOW,
    title: 'Links do not have descriptive text',
  },
  'crawlable-anchors': {
    id: 'LH-UNCRAWLABLE-LINKS',
    severity: AuditSeverity.LOW,
    title: 'Links are not crawlable',
  },
  'image-alt': {
    id: 'LH-MISSING-IMAGE-ALT',
    severity: AuditSeverity.LOW,
    title: 'Image elements do not have [alt] attributes',
  },
  hreflang: {
    id: 'LH-INVALID-HREFLANG',
    severity: AuditSeverity.LOW,
    title: 'Document does not have a valid hreflang',
  },
};

/**
 * SEO Auditor implementation using Crawlee and Lighthouse.
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

      // Run Lighthouse SEO audits if Chrome is available
      const lighthouseResult = await this.runLighthouseSeoAudits(url);
      this.issues.push(...lighthouseResult.issues);

      // Run sitemap validation
      const sitemapIssues = await this.runSitemapValidation(baseUrl.origin);
      this.issues.push(...sitemapIssues);

      // Run Crawlee for broken link detection
      await this.runCrawleeBrokenLinkCheck(url, baseUrl);

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
          lighthouseAuditsRun: lighthouseResult.didRun,
        },
      };

      if (status === 'failed') {
        result.errorMessage = 'No pages could be crawled';
      }

      return result;
    });
  }

  /**
   * Run Lighthouse SEO audits.
   * Returns both the issues found and whether Lighthouse actually ran.
   */
  private async runLighthouseSeoAudits(
    url: string
  ): Promise<{ issues: AuditIssue[]; didRun: boolean }> {
    const issues: AuditIssue[] = [];

    // Check if Chrome is available
    const chromeCheck = await checkChromeInstalled();
    if (!chromeCheck.installed) {
      const instructions = getChromeInstallInstructions();
      this.warnings.push(`Chrome not installed, Lighthouse SEO audits skipped. ${instructions}`);
      logDebug('Chrome not installed, skipping Lighthouse SEO audits');
      return { issues, didRun: false };
    }

    try {
      logDebug('Running Lighthouse SEO audits...');

      // Run Lighthouse using the shared runner (handles Chrome and mutex)
      const lhr = await runLighthouse(
        url,
        {
          logLevel: 'error',
          output: 'json',
          onlyCategories: ['seo'],
        },
        {
          extends: 'lighthouse:default',
          settings: {
            formFactor: 'desktop',
            screenEmulation: {
              mobile: false,
              width: 1350,
              height: 940,
              deviceScaleFactor: 1,
              disabled: false,
            },
            throttling: {
              rttMs: 0,
              throughputKbps: 0,
              cpuSlowdownMultiplier: 1,
              downloadThroughputKbps: 0,
              uploadThroughputKbps: 0,
              requestLatencyMs: 0,
            },
            throttlingMethod: 'provided',
          },
        }
      );

      if (!lhr) {
        this.warnings.push('Lighthouse did not return SEO results');
        return { issues, didRun: false };
      }

      // Extract failed SEO audits
      const extractedIssues = this.extractLighthouseSeoIssues(lhr, url);
      issues.push(...extractedIssues);

      logDebug(`Lighthouse SEO audits found ${issues.length} issues`);
      return { issues, didRun: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.warnings.push(`Lighthouse SEO audit error: ${message}`);
      logDebug(`Lighthouse SEO audit error: ${message}`);
      return { issues, didRun: false };
    }
  }

  /**
   * Extract SEO issues from Lighthouse results.
   */
  private extractLighthouseSeoIssues(lhr: LighthouseResult, url: string): AuditIssue[] {
    const issues: AuditIssue[] = [];
    const audits = lhr.audits;

    for (const [auditId, config] of Object.entries(LIGHTHOUSE_SEO_AUDITS)) {
      const audit = audits[auditId];
      if (!audit) {
        continue;
      }

      // Check if the audit failed:
      // - score < 1 means failed or needs improvement
      // - scoreDisplayMode === 'error' means the audit errored during execution
      const failed =
        (audit.score !== null && audit.score < 1) || audit.scoreDisplayMode === 'error';
      if (!failed) {
        continue;
      }

      issues.push(
        this.createIssue({
          id: config.id,
          title: config.title,
          description: audit.description ?? audit.title ?? config.title,
          severity: config.severity,
          suggestion: audit.description ?? `Fix the ${config.title.toLowerCase()} issue`,
          affectedUrl: url,
          rawValue: {
            lighthouseAuditId: auditId,
            score: audit.score,
            displayValue: audit.displayValue,
          },
        })
      );
    }

    return issues;
  }

  /**
   * Run sitemap validation.
   */
  private async runSitemapValidation(origin: string): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];

    try {
      const sitemapUrl = `${origin}/sitemap.xml`;
      logDebug(`Validating sitemap at ${sitemapUrl}`);

      const result = await validateSitemap(sitemapUrl);

      if (!result.found) {
        // Sitemap not found is informational - not required for all sites
        issues.push(
          this.createIssue({
            id: 'SITEMAP-NOT-FOUND',
            title: 'No sitemap.xml found',
            description: `No sitemap found at ${sitemapUrl}. While not required, sitemaps help search engines discover your pages.`,
            severity: AuditSeverity.LOW,
            suggestion:
              'Consider creating a sitemap.xml file following the sitemaps.org protocol to help search engines index your site.',
            affectedUrl: sitemapUrl,
            rawValue: { url: sitemapUrl },
          })
        );
      } else if (result.fetchError) {
        issues.push(
          this.createIssue({
            id: 'SITEMAP-FETCH-ERROR',
            title: 'Sitemap could not be fetched',
            description: `Sitemap at ${sitemapUrl} exists but could not be retrieved: ${result.fetchError}`,
            severity: AuditSeverity.MEDIUM,
            suggestion: 'Ensure your sitemap.xml is accessible and returns a valid response.',
            affectedUrl: sitemapUrl,
            rawValue: { url: sitemapUrl, error: result.fetchError },
          })
        );
      } else if (!result.valid) {
        issues.push(
          this.createIssue({
            id: 'SITEMAP-XSD-INVALID',
            title: 'Sitemap does not conform to XML schema',
            description: `Sitemap at ${sitemapUrl} does not conform to the official sitemaps.org XSD schema: ${result.validationErrors?.join('; ') ?? 'Unknown validation error'}`,
            severity: AuditSeverity.HIGH,
            suggestion:
              'Validate your sitemap against the official schema at https://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd',
            affectedUrl: sitemapUrl,
            rawValue: {
              url: sitemapUrl,
              errors: result.validationErrors,
              urlCount: result.urlCount,
            },
          })
        );
      }

      logDebug(
        `Sitemap validation complete: found=${result.found}, valid=${result.valid}, urls=${result.urlCount ?? 0}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.warnings.push(`Sitemap validation error: ${message}`);
      logDebug(`Sitemap validation error: ${message}`);
    }

    return issues;
  }

  /**
   * Run Crawlee for broken link detection.
   */
  private async runCrawleeBrokenLinkCheck(url: string, baseUrl: URL): Promise<void> {
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
  }

  /**
   * Handle a single page request for broken link detection.
   */
  private async handleRequest(context: CheerioCrawlingContext, baseUrl: URL): Promise<void> {
    const { request, response, enqueueLinks } = context;
    const currentUrl = request.url;

    this.crawledUrls.add(currentUrl);
    logDebug(`Crawled: ${currentUrl}`);

    // Check HTTP status
    const statusCode = response?.statusCode ?? 200;
    if (statusCode >= 400) {
      this.addBrokenLinkIssue(currentUrl, statusCode);
      return;
    }

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
}
