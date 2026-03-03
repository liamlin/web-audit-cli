/**
 * Performance Auditor - Runs Lighthouse to analyze Core Web Vitals.
 *
 * Supports two modes:
 * - desktop: No throttling, reflects actual desktop browsing experience
 * - mobile-4g: DevTools throttling simulating mobile 4G conditions
 */

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
import { checkChromeInstalled, getChromeInstallInstructions } from './chrome-detector.js';
import { runLighthouse } from '../../utils/lighthouse-runner.js';

/**
 * Test specification labels for each performance mode.
 * These are shown in reports to clarify test conditions.
 */
const TEST_SPEC_LABELS = {
  desktop: {
    en: 'Desktop, No Throttling',
    'zh-TW': '桌面版，無節流',
  },
  'mobile-4g': {
    en: 'Mobile 4G, Throttled',
    'zh-TW': '行動版 4G，已節流',
  },
} as const;

/**
 * Core Web Vitals thresholds.
 */
const THRESHOLDS = {
  LCP: { poor: 4000, needsImprovement: 2500 }, // milliseconds
  CLS: { poor: 0.25, needsImprovement: 0.1 },
  TBT: { poor: 600, needsImprovement: 300 }, // milliseconds
};

/**
 * Performance metrics extracted from Lighthouse.
 */
interface PerformanceMetrics {
  lcp: number;
  cls: number;
  tbt: number;
  fcp: number;
  si: number;
  score: number;
}

/**
 * Performance Auditor implementation using Lighthouse.
 */
export class PerformanceAuditor extends BaseAuditor {
  protected readonly category = AuditCategory.PERFORMANCE;

  /**
   * Get Lighthouse settings based on performance mode.
   */
  private getLighthouseSettings() {
    const mode = this.config.performanceMode;

    if (mode === 'mobile-4g') {
      // Mobile 4G mode: DevTools throttling for realistic mobile experience
      return {
        formFactor: 'mobile' as const,
        screenEmulation: {
          mobile: true,
          width: 375,
          height: 667,
          deviceScaleFactor: 2,
          disabled: false,
        },
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4,
          downloadThroughputKbps: 1474.56,
          uploadThroughputKbps: 675,
          requestLatencyMs: 562.5,
        },
        throttlingMethod: 'devtools' as const,
      };
    }

    // Desktop mode (default): No throttling for accurate desktop experience
    return {
      formFactor: 'desktop' as const,
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
      throttlingMethod: 'provided' as const,
    };
  }

  /**
   * Get the test specification label for the current mode.
   */
  getTestSpecLabel(): { en: string; 'zh-TW': string } {
    return TEST_SPEC_LABELS[this.config.performanceMode];
  }

  /**
   * Run the performance audit.
   */
  async run(url: string): Promise<ModuleResult<AuditResult>> {
    // Pre-flight check: Verify Chrome is installed
    const chromeCheck = await checkChromeInstalled();
    if (!chromeCheck.installed) {
      const installInstructions = getChromeInstallInstructions();
      return {
        success: false,
        data: this.createSkippedResult(
          url,
          `Chrome/Chromium is not installed. ${installInstructions}`
        ),
        warnings: ['Chrome not installed, performance audit skipped'],
        error: {
          code: 'CHROME_NOT_INSTALLED',
          message: `Please install Chrome to enable performance auditing. ${installInstructions}`,
          recoverable: true,
        },
        executionTimeMs: 0,
      };
    }

    return runModule('Performance', async () => {
      // Get settings based on performance mode
      const settings = this.getLighthouseSettings();
      logDebug(`Performance mode: ${this.config.performanceMode} (${this.getTestSpecLabel().en})`);

      // Run Lighthouse using the shared runner (handles Chrome and mutex)
      const lhr = await runLighthouse(
        url,
        {
          logLevel: 'error',
          output: 'json',
          onlyCategories: ['performance'],
        },
        {
          extends: 'lighthouse:default',
          settings,
        }
      );

      if (!lhr) {
        throw new Error('Lighthouse did not return results');
      }

      // Extract metrics and issues
      const metrics = this.extractMetrics(lhr);
      const issues = this.analyzeMetrics(metrics, url);
      const opportunities = this.extractOpportunities(lhr, url);

      // Combine all issues
      const allIssues = [...issues, ...opportunities];

      // Build passes for metrics that meet Google's thresholds
      const passes: AuditPass[] = [];
      if (metrics.lcp <= THRESHOLDS.LCP.needsImprovement) {
        passes.push({
          id: 'LCP-GOOD',
          title: `LCP is ${(metrics.lcp / 1000).toFixed(1)}s (good)`,
          category: AuditCategory.PERFORMANCE,
          source: 'Google Lighthouse',
        });
      }
      if (metrics.cls <= THRESHOLDS.CLS.needsImprovement) {
        passes.push({
          id: 'CLS-GOOD',
          title: `CLS is ${metrics.cls.toFixed(3)} (good)`,
          category: AuditCategory.PERFORMANCE,
          source: 'Google Lighthouse',
        });
      }
      if (metrics.tbt <= THRESHOLDS.TBT.needsImprovement) {
        passes.push({
          id: 'TBT-GOOD',
          title: `TBT is ${Math.round(metrics.tbt)}ms (good)`,
          category: AuditCategory.PERFORMANCE,
          source: 'Google Lighthouse',
        });
      }

      // Include test spec in result metadata
      const testSpecLabel = this.getTestSpecLabel();

      return this.createResult(
        url,
        allIssues,
        {
          lighthouseScore: metrics.score,
          lcp: metrics.lcp,
          cls: metrics.cls,
          tbt: metrics.tbt,
          fcp: metrics.fcp,
          si: metrics.si,
          performanceMode: this.config.performanceMode,
          testSpec: testSpecLabel.en,
          testSpecZh: testSpecLabel['zh-TW'],
        },
        passes
      );
    });
  }

  /**
   * Extract performance metrics from Lighthouse results.
   */
  private extractMetrics(lhr: LighthouseResult): PerformanceMetrics {
    const audits = lhr.audits;

    return {
      lcp: audits['largest-contentful-paint']?.numericValue ?? NaN,
      cls: audits['cumulative-layout-shift']?.numericValue ?? NaN,
      tbt: audits['total-blocking-time']?.numericValue ?? NaN,
      fcp: audits['first-contentful-paint']?.numericValue ?? NaN,
      si: audits['speed-index']?.numericValue ?? NaN,
      score: (lhr.categories.performance?.score ?? 0) * 100,
    };
  }

  /**
   * Analyze metrics and create issues for poor values.
   */
  private analyzeMetrics(metrics: PerformanceMetrics, url: string): AuditIssue[] {
    const issues: AuditIssue[] = [];

    // LCP check
    if (metrics.lcp > THRESHOLDS.LCP.poor) {
      issues.push(
        this.createIssue({
          id: 'LCP-CRITICAL',
          title: 'Critical: Largest Contentful Paint Too Slow',
          description: `LCP is ${(metrics.lcp / 1000).toFixed(1)}s (threshold: ${THRESHOLDS.LCP.poor / 1000}s)`,
          severity: AuditSeverity.CRITICAL,
          suggestion:
            'Optimize server response time, preload critical resources, and optimize images',
          affectedUrl: url,
          rawValue: { lcp: metrics.lcp },
        })
      );
    } else if (metrics.lcp > THRESHOLDS.LCP.needsImprovement) {
      issues.push(
        this.createIssue({
          id: 'LCP-POOR',
          title: 'Largest Contentful Paint Needs Improvement',
          description: `LCP is ${(metrics.lcp / 1000).toFixed(1)}s (target: under ${THRESHOLDS.LCP.needsImprovement / 1000}s)`,
          severity: AuditSeverity.HIGH,
          suggestion:
            'Optimize server response time, preload critical resources, and optimize images',
          affectedUrl: url,
          rawValue: { lcp: metrics.lcp },
        })
      );
    }

    // CLS check
    if (metrics.cls > THRESHOLDS.CLS.poor) {
      issues.push(
        this.createIssue({
          id: 'CLS-CRITICAL',
          title: 'Critical: Cumulative Layout Shift Too High',
          description: `CLS is ${metrics.cls.toFixed(3)} (threshold: ${THRESHOLDS.CLS.poor})`,
          severity: AuditSeverity.CRITICAL,
          suggestion:
            'Add size attributes to images/videos, avoid inserting content above existing content',
          affectedUrl: url,
          rawValue: { cls: metrics.cls },
        })
      );
    } else if (metrics.cls > THRESHOLDS.CLS.needsImprovement) {
      issues.push(
        this.createIssue({
          id: 'CLS-POOR',
          title: 'Cumulative Layout Shift Needs Improvement',
          description: `CLS is ${metrics.cls.toFixed(3)} (target: under ${THRESHOLDS.CLS.needsImprovement})`,
          severity: AuditSeverity.HIGH,
          suggestion:
            'Add size attributes to images/videos, avoid inserting content above existing content',
          affectedUrl: url,
          rawValue: { cls: metrics.cls },
        })
      );
    }

    // TBT check
    if (metrics.tbt > THRESHOLDS.TBT.poor) {
      issues.push(
        this.createIssue({
          id: 'TBT-CRITICAL',
          title: 'Critical: Total Blocking Time Too High',
          description: `TBT is ${Math.round(metrics.tbt)}ms (threshold: ${THRESHOLDS.TBT.poor}ms)`,
          severity: AuditSeverity.CRITICAL,
          suggestion:
            'Reduce JavaScript execution time, split long tasks, and defer non-critical scripts',
          affectedUrl: url,
          rawValue: { tbt: metrics.tbt },
        })
      );
    } else if (metrics.tbt > THRESHOLDS.TBT.needsImprovement) {
      issues.push(
        this.createIssue({
          id: 'TBT-POOR',
          title: 'Total Blocking Time Needs Improvement',
          description: `TBT is ${Math.round(metrics.tbt)}ms (target: under ${THRESHOLDS.TBT.needsImprovement}ms)`,
          severity: AuditSeverity.HIGH,
          suggestion:
            'Reduce JavaScript execution time, split long tasks, and defer non-critical scripts',
          affectedUrl: url,
          rawValue: { tbt: metrics.tbt },
        })
      );
    }

    return issues;
  }

  /**
   * Extract optimization opportunities from Lighthouse.
   */
  private extractOpportunities(lhr: LighthouseResult, url: string): AuditIssue[] {
    const issues: AuditIssue[] = [];
    const audits = lhr.audits;

    // Map of Lighthouse audit IDs to our issue IDs
    const opportunityMap: Record<string, { id: string; title: string; minSavingsMs: number }> = {
      'unused-javascript': {
        id: 'UNUSED-JAVASCRIPT',
        title: 'Unused JavaScript',
        minSavingsMs: 100,
      },
      'offscreen-images': {
        id: 'OFFSCREEN-IMAGES',
        title: 'Defer Offscreen Images',
        minSavingsMs: 100,
      },
      'render-blocking-resources': {
        id: 'RENDER-BLOCKING-RESOURCES',
        title: 'Eliminate Render-Blocking Resources',
        minSavingsMs: 100,
      },
      'uses-long-cache-ttl': {
        id: 'USES-LONG-CACHE-TTL',
        title: 'Serve Static Assets with Efficient Cache Policy',
        minSavingsMs: 0, // This is a best practice, not savings-based
      },
    };

    for (const [auditId, config] of Object.entries(opportunityMap)) {
      const audit = audits[auditId];
      if (!audit) {
        continue;
      }

      const details = audit.details as { type: string; overallSavingsMs?: number } | undefined;
      const savingsMs = details?.overallSavingsMs ?? 0;

      // Only report if savings exceed threshold
      if (audit.score !== null && audit.score < 1 && savingsMs >= config.minSavingsMs) {
        const severity =
          savingsMs > 500
            ? AuditSeverity.HIGH
            : savingsMs > 200
              ? AuditSeverity.MEDIUM
              : AuditSeverity.LOW;

        issues.push(
          this.createIssue({
            id: config.id,
            title: config.title,
            description: audit.description ?? `Potential savings of ${Math.round(savingsMs)}ms`,
            severity,
            suggestion: audit.description ?? 'See Lighthouse report for details',
            affectedUrl: url,
            rawValue: {
              savingsMs,
              displayValue: audit.displayValue,
            },
          })
        );
      }
    }

    return issues;
  }
}
