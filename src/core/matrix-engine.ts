/**
 * Matrix Engine - Transforms technical audit results into business-focused reports.
 * This is the "intelligence layer" that converts technical jargon into stakeholder language.
 */

import {
  AuditCategory,
  type AuditIssue,
  type AuditResult,
  type AuditSeverity,
  type BusinessIssue,
  type BusinessReport,
  type MethodologyInfo,
  type ToolInfo,
  type TestInfo,
} from '../types/audit.js';
import { getResolvedKnowledgeEntry } from './knowledge-base.js';
import type { Locale } from '../utils/i18n.js';

/**
 * Order for sorting issues by severity.
 */
const SEVERITY_ORDER: Record<AuditSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

/**
 * Tool definitions with official descriptions and credibility information.
 */
const TOOL_DEFINITIONS: Record<string, ToolInfo> = {
  seo: {
    name: 'Google Lighthouse SEO + Crawlee + sitemaps.org validation',
    version: '12.x+ / 3.x+',
    purpose:
      'Lighthouse SEO audits for crawlability, meta tags, and link quality. Crawlee for broken link detection. Sitemap validation per sitemaps.org protocol.',
    credibility:
      'Lighthouse is the official Google SEO audit tool. Crawlee is an Apify production crawler. Sitemap validation follows sitemaps.org XSD standards.',
  },
  performance: {
    name: 'Google Lighthouse',
    version: '12.x+',
    purpose:
      'An open-source, automated tool for improving the quality of web pages with audits for performance, accessibility, SEO, and more.',
    credibility: 'Official Google tool integrated into Chrome DevTools and PageSpeed Insights.',
  },
  security: {
    name: 'Passive Security Scanner (Mozilla Observatory + OWASP Secure Headers)',
    version: '1.x',
    purpose:
      'Passive security scanner that checks HTTP security headers, cookie attributes, and HTML-level issues against Mozilla Observatory and OWASP Secure Headers Project standards.',
    credibility:
      'Checks based on Mozilla Observatory grading criteria, OWASP Secure Headers Project recommendations, and known CVE databases — industry-standard security baselines.',
  },
};

/**
 * The Matrix Engine transforms raw audit results into business reports.
 */
export class MatrixEngine {
  private locale: Locale;

  constructor(locale: Locale = 'en') {
    this.locale = locale;
  }

  /**
   * Enhance raw audit results with business context.
   */
  enhanceReport(results: AuditResult[], auditDurationMs?: number): BusinessReport {
    const allIssues = results.flatMap((r) => r.issues);
    const allPasses = results.flatMap((r) => r.passes);
    const enhancedIssues = this.enhanceIssues(allIssues);

    // Extract notices for modules that were skipped or failed
    const moduleNotices = results
      .filter((r) => r.status === 'skipped' || r.status === 'failed')
      .map((r) => ({
        category: r.category,
        status: r.status,
        message: r.errorMessage ?? `${r.category} module ${r.status}`,
      }));

    return {
      url: results[0]?.url ?? '',
      generatedAt: new Date(),
      executiveSummary: this.generateExecutiveSummary(results, enhancedIssues),
      issues: this.sortByPriority(enhancedIssues),
      passes: allPasses,
      moduleNotices,
      prioritizedRecommendations: this.generateTopRecommendations(enhancedIssues),
      rawResults: results,
      methodology: this.generateMethodology(results, auditDurationMs),
      language: this.locale,
    };
  }

  /**
   * Generate methodology information for the report.
   */
  private generateMethodology(results: AuditResult[], auditDurationMs?: number): MethodologyInfo {
    const categories = results.map((r) => r.category.toLowerCase());

    // Build tools used list based on which modules were run
    const toolsUsed: ToolInfo[] = [];
    if (categories.includes('seo')) {
      toolsUsed.push(TOOL_DEFINITIONS.seo);
    }
    if (categories.includes('performance')) {
      toolsUsed.push(TOOL_DEFINITIONS.performance);
    }
    if (categories.includes('security')) {
      toolsUsed.push(TOOL_DEFINITIONS.security);
    }

    // Build tests performed list
    const testsPerformed: TestInfo[] = [];

    for (const result of results) {
      const category = result.category;
      const description = this.buildTestDescription(category, result.status);
      const totalChecks = result.issues.length + result.passes.length;

      const testInfo: TestInfo = {
        category: category as string,
        description,
        checkCount: totalChecks,
      };
      testsPerformed.push(testInfo);
    }

    // Get performance test spec if available
    const perfResult = results.find((r) => r.category === 'PERFORMANCE');
    const performanceTestSpec = perfResult?.metadata?.testSpec as string | undefined;

    const methodology: MethodologyInfo = {
      toolsUsed,
      testsPerformed,
      auditDate: new Date(),
    };

    if (auditDurationMs !== undefined) {
      methodology.auditDuration = auditDurationMs;
    }

    if (performanceTestSpec) {
      methodology.performanceTestSpec = performanceTestSpec;
    }

    return methodology;
  }

  /**
   * Build the tests-performed description for a category, reflecting the module's execution status.
   */
  private buildTestDescription(category: AuditCategory, status: AuditResult['status']): string {
    if (status === 'failed') {
      return 'Module execution failed - no checks completed';
    }

    let description: string;

    switch (category) {
      case AuditCategory.SEO:
        description =
          'Google Lighthouse SEO audits (crawlability, title, meta description, canonical, robots.txt, link text, image alt, hreflang), sitemap.xml validation per sitemaps.org protocol, broken link detection via site crawling';
        break;
      case AuditCategory.PERFORMANCE:
        description =
          'Core Web Vitals measurement (LCP, CLS, TBT), First Contentful Paint, Speed Index, optimization opportunity analysis';
        break;
      case AuditCategory.SECURITY:
        description =
          'HTTP security header analysis (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Permissions-Policy, Referrer-Policy, CORS, COOP/COEP/CORP), cookie security attributes, SRI verification, cross-domain script detection, vulnerable library detection';
        break;
      default:
        description = `${category} audit checks`;
    }

    if (status === 'partial') {
      description += ' (partial results - some checks may have been skipped)';
    }

    return description;
  }

  /**
   * Enhance issues with business context from the knowledge base.
   */
  private enhanceIssues(issues: AuditIssue[]): BusinessIssue[] {
    return issues.map((issue) => {
      const knowledge = getResolvedKnowledgeEntry(issue.id, this.locale);
      return {
        ...issue,
        businessImpact: knowledge.businessImpact,
        fixDifficulty: knowledge.fixDifficulty,
        estimatedEffort: knowledge.estimatedEffort,
        expectedOutcome: knowledge.expectedOutcome,
      };
    });
  }

  /**
   * Generate an executive summary for the report.
   */
  private generateExecutiveSummary(results: AuditResult[], issues: BusinessIssue[]): string {
    const criticalCount = issues.filter((i) => i.severity === 'CRITICAL').length;
    const highCount = issues.filter((i) => i.severity === 'HIGH').length;
    const totalPasses = results.reduce((sum, r) => sum + r.passes.length, 0);
    const categories = results.map((r) => r.category).join(', ');

    let summary = `Audit of ${results[0]?.url ?? 'unknown'} found ${issues.length} issue${issues.length !== 1 ? 's' : ''} across ${categories}. `;

    if (criticalCount > 0) {
      const criticalIssues = issues.filter((i) => i.severity === 'CRITICAL').slice(0, 2);
      summary += `${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} found: ${criticalIssues.map((i) => i.title).join('; ')}. `;
    }

    if (highCount > 0) {
      summary += `${highCount} high-priority issue${highCount > 1 ? 's' : ''} should be addressed soon. `;
    }

    if (totalPasses > 0) {
      summary += `The site performs well in ${totalPasses} area${totalPasses !== 1 ? 's' : ''}.`;
    }

    return summary.trim();
  }

  /**
   * Sort issues by severity (most severe first).
   */
  private sortByPriority(issues: BusinessIssue[]): BusinessIssue[] {
    return [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }

  /**
   * Generate the top 5 prioritized recommendations.
   */
  private generateTopRecommendations(issues: BusinessIssue[]): string[] {
    const sorted = this.sortByPriority(issues);
    const actionable = sorted.filter((i) => i.severity !== 'INFO');
    const top5 = actionable.slice(0, 5);

    return top5.map(
      (issue, idx) => `${idx + 1}. [${issue.severity}] ${issue.title}: ${issue.expectedOutcome}`
    );
  }
}
