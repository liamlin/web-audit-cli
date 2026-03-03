/**
 * SEO Auditor - Crawls websites to find SEO issues.
 * Uses Crawlee with CheerioCrawler for broken link detection and site crawling.
 * Uses Google Lighthouse SEO audits for authoritative SEO checks.
 */

import { CheerioCrawler, Configuration, type CheerioCrawlingContext } from 'crawlee';
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { type Result as LighthouseResult } from 'lighthouse';
import {
  AuditCategory,
  AuditSeverity,
  type AuditIssue,
  type AuditPass,
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
const LIGHTHOUSE_SEO_AUDITS: Record<string, { id: string; severity: AuditSeverity }> = {
  'is-crawlable': { id: 'LH-NOT-CRAWLABLE', severity: AuditSeverity.CRITICAL },
  'document-title': { id: 'LH-MISSING-TITLE', severity: AuditSeverity.HIGH },
  'http-status-code': { id: 'LH-HTTP-ERROR', severity: AuditSeverity.HIGH },
  'robots-txt': { id: 'LH-ROBOTS-TXT-INVALID', severity: AuditSeverity.MEDIUM },
  'meta-description': { id: 'LH-MISSING-META-DESC', severity: AuditSeverity.MEDIUM },
  canonical: { id: 'LH-INVALID-CANONICAL', severity: AuditSeverity.MEDIUM },
  'link-text': { id: 'LH-POOR-LINK-TEXT', severity: AuditSeverity.LOW },
  'crawlable-anchors': { id: 'LH-UNCRAWLABLE-LINKS', severity: AuditSeverity.LOW },
  'image-alt': { id: 'LH-MISSING-IMAGE-ALT', severity: AuditSeverity.LOW },
  hreflang: { id: 'LH-INVALID-HREFLANG', severity: AuditSeverity.LOW },
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
      const sitemapResult = await this.runSitemapValidation(baseUrl.origin);
      this.issues.push(...sitemapResult.issues);

      // Run Crawlee for broken link detection
      await this.runCrawleeBrokenLinkCheck(url, baseUrl);

      // Build combined passes from all sub-checks
      const allPasses: AuditPass[] = [...lighthouseResult.passes, ...sitemapResult.passes];

      // Record pass for broken-link check if Crawlee ran and found none
      if (this.crawledUrls.size > 0 && this.brokenLinks.size === 0) {
        allPasses.push({
          id: 'NO-BROKEN-LINKS',
          title: `No broken links found (${this.crawledUrls.size} pages crawled)`,
          category: AuditCategory.SEO,
          source: 'Crawlee CheerioCrawler',
        });
      }

      // Determine result status based on ALL sub-checks, not just Crawlee.
      // The SEO module has three independent sub-checks:
      //   1. Lighthouse SEO audits
      //   2. Sitemap validation
      //   3. Crawlee broken-link crawling
      // Status should reflect the combined outcome.
      const hasAnyResults = this.issues.length > 0 || allPasses.length > 0;
      const crawleeRan = this.crawledUrls.size > 0;

      let status: 'success' | 'partial' | 'failed';
      if (crawleeRan && this.warnings.length === 0) {
        status = 'success';
      } else if (hasAnyResults) {
        // Lighthouse/sitemap produced results even if Crawlee failed
        status = 'partial';
      } else {
        status = 'failed';
      }

      const result: AuditResult = {
        url,
        timestamp: new Date(),
        category: this.category,
        issues: this.issues,
        passes: allPasses,
        status,
        metadata: {
          pagesAudited: this.crawledUrls.size,
          brokenLinksFound: this.brokenLinks.size,
          lighthouseAuditsRun: lighthouseResult.didRun,
        },
      };

      if (status === 'failed') {
        result.errorMessage = 'No SEO checks could be completed';
      }

      return result;
    });
  }

  /**
   * Run Lighthouse SEO audits.
   * Returns issues found, passes, and whether Lighthouse actually ran.
   */
  private async runLighthouseSeoAudits(
    url: string
  ): Promise<{ issues: AuditIssue[]; passes: AuditPass[]; didRun: boolean }> {
    const issues: AuditIssue[] = [];
    const passes: AuditPass[] = [];

    // Check if Chrome is available
    const chromeCheck = await checkChromeInstalled();
    if (!chromeCheck.installed) {
      const instructions = getChromeInstallInstructions();
      this.warnings.push(`Chrome not installed, Lighthouse SEO audits skipped. ${instructions}`);
      logDebug('Chrome not installed, skipping Lighthouse SEO audits');
      return { issues, passes, didRun: false };
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
        return { issues, passes, didRun: false };
      }

      // Extract failed SEO audits and passing audits
      const extractedIssues = this.extractLighthouseSeoIssues(lhr, url);
      issues.push(...extractedIssues);

      // Extract passing audits from Lighthouse.
      // Use audit.title from the LHR (Lighthouse sets it to the pass-oriented title when score=1).
      // Skip audits where score=1 but scoreDisplayMode is 'notApplicable' (not relevant to this page)
      // or where the audit had nothing to check (vacuous pass — e.g. hreflang score=1 with no tags).
      const audits = lhr.audits;
      for (const [auditId, config] of Object.entries(LIGHTHOUSE_SEO_AUDITS)) {
        const audit = audits[auditId];
        if (!audit || audit.score !== 1) {
          continue;
        }
        if (audit.scoreDisplayMode === 'notApplicable') {
          continue;
        }

        // Filter vacuous passes: audits that validate existing elements but found none to check.
        // These return score=1 with an empty details table — not a meaningful pass.
        const details = audit.details as { items?: unknown[] } | undefined;
        if (details?.items !== undefined && details.items.length === 0) {
          continue;
        }

        passes.push({
          id: config.id,
          title: audit.title ?? auditId,
          category: AuditCategory.SEO,
          source: 'Google Lighthouse',
        });
      }

      logDebug(`Lighthouse SEO audits found ${issues.length} issues, ${passes.length} passes`);
      return { issues, passes, didRun: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.warnings.push(`Lighthouse SEO audit error: ${message}`);
      logDebug(`Lighthouse SEO audit error: ${message}`);
      return { issues, passes, didRun: false };
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

      const auditTitle = audit.title ?? auditId;
      issues.push(
        this.createIssue({
          id: config.id,
          title: auditTitle,
          description: audit.description ?? auditTitle,
          severity: config.severity,
          suggestion: audit.description ?? `Fix the ${auditTitle.toLowerCase()} issue`,
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
  private async runSitemapValidation(
    origin: string
  ): Promise<{ issues: AuditIssue[]; passes: AuditPass[] }> {
    const issues: AuditIssue[] = [];
    const passes: AuditPass[] = [];

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
      } else {
        // Valid sitemap found — record as a pass
        passes.push({
          id: 'SITEMAP-VALID',
          title: `Valid sitemap.xml found (${result.urlCount ?? 0} URLs)`,
          category: AuditCategory.SEO,
          source: 'sitemaps.org XSD validation',
        });
      }

      logDebug(
        `Sitemap validation complete: found=${result.found}, valid=${result.valid}, urls=${result.urlCount ?? 0}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.warnings.push(`Sitemap validation error: ${message}`);
      logDebug(`Sitemap validation error: ${message}`);
    }

    return { issues, passes };
  }

  /**
   * Run Crawlee for broken link detection.
   */
  private async runCrawleeBrokenLinkCheck(url: string, baseUrl: URL): Promise<void> {
    // Use a dedicated Configuration with temp storage so Crawlee works inside
    // ASAR-packed Electron apps where the default ./storage directory is read-only.
    const storageDir = join(tmpdir(), `web-audit-crawlee-${Date.now()}`);
    const config = new Configuration({
      storageClientOptions: {
        localDataDirectory: storageDir,
      },
    });

    const crawler = new CheerioCrawler(
      {
        maxRequestsPerCrawl: this.config.crawlDepth,
        maxConcurrency: 5,
        requestHandlerTimeoutSecs: 30,

        requestHandler: async (context) => {
          await this.handleRequest(context, baseUrl);
        },

        failedRequestHandler: async ({ request }) => {
          this.handleFailedRequest(request.url, request.errorMessages);
        },
      },
      config
    );

    try {
      await crawler.run([url]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown crawl error';
      this.warnings.push(`Crawl error: ${message}`);
    } finally {
      try {
        rmSync(storageDir, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
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
