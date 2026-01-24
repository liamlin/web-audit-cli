/**
 * Matrix Engine - Transforms technical audit results into business-focused reports.
 * This is the "intelligence layer" that converts technical jargon into stakeholder language.
 */

import type {
  AuditCategory,
  AuditIssue,
  AuditResult,
  AuditSeverity,
  BusinessIssue,
  BusinessReport,
  MethodologyInfo,
  ToolInfo,
  TestInfo,
} from '../types/audit.js';
import { getResolvedKnowledgeEntry } from './knowledge-base.js';
import type { Locale } from '../utils/i18n.js';

/**
 * Weights for calculating the overall health score.
 * Security is weighted highest as it poses the greatest risk.
 */
const CATEGORY_WEIGHTS = {
  seo: 0.25,
  performance: 0.35,
  security: 0.4,
} as const;

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
    name: 'Crawlee',
    version: '3.x',
    purpose:
      'A web scraping and browser automation library for Node.js to build reliable crawlers.',
    credibility:
      'Developed by Apify, trusted by thousands of developers for production web scraping.',
  },
  performance: {
    name: 'Google Lighthouse',
    version: '12.x',
    purpose:
      'An open-source, automated tool for improving the quality of web pages with audits for performance, accessibility, SEO, and more.',
    credibility: 'Official Google tool integrated into Chrome DevTools and PageSpeed Insights.',
  },
  security: {
    name: 'OWASP ZAP',
    version: '2.x',
    purpose: "The world's most widely used web app scanner. Free and open source.",
    credibility:
      'Flagship project of the OWASP Foundation, the standard for web application security testing.',
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
    const enhancedIssues = this.enhanceIssues(allIssues);
    const categoryScores = this.calculateCategoryScores(results);
    const healthScore = this.calculateHealthScore(categoryScores);

    return {
      url: results[0]?.url ?? '',
      generatedAt: new Date(),
      healthScore,
      categoryScores,
      executiveSummary: this.generateExecutiveSummary(healthScore, categoryScores, enhancedIssues),
      issues: this.sortByPriority(enhancedIssues),
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
      let description = '';

      switch (category) {
        case 'SEO':
          description =
            'Link validation, meta tag analysis (title, description), heading structure (H1), canonical URL, language attribute, viewport configuration';
          break;
        case 'PERFORMANCE':
          description =
            'Core Web Vitals measurement (LCP, CLS, TBT), First Contentful Paint, Speed Index, optimization opportunity analysis';
          break;
        case 'SECURITY':
          description =
            'OWASP Top 10 vulnerability scanning, security header analysis (CSP, HSTS, X-Frame-Options), SSL/TLS configuration, known vulnerability detection';
          break;
      }

      const testInfo: TestInfo = {
        category: category as string,
        description,
      };
      if (result.issues.length > 0) {
        testInfo.checkCount = result.issues.length;
      }
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
   * Extract scores for each category from results.
   * Returns null for modules that were not run.
   */
  private calculateCategoryScores(results: AuditResult[]): BusinessReport['categoryScores'] {
    const findScore = (category: AuditCategory): number | null => {
      const result = results.find((r) => r.category === category);
      // Return null if the module wasn't run (not found)
      if (!result) {
        return null;
      }
      return result.score;
    };

    return {
      seo: findScore('SEO' as AuditCategory),
      performance: findScore('PERFORMANCE' as AuditCategory),
      security: findScore('SECURITY' as AuditCategory),
    };
  }

  /**
   * Calculate the weighted overall health score.
   * Only considers modules that were actually run (non-null scores).
   */
  private calculateHealthScore(scores: BusinessReport['categoryScores']): number {
    // Only include scores that are not null
    let totalWeight = 0;
    let weightedSum = 0;

    if (scores.seo !== null) {
      weightedSum += scores.seo * CATEGORY_WEIGHTS.seo;
      totalWeight += CATEGORY_WEIGHTS.seo;
    }
    if (scores.performance !== null) {
      weightedSum += scores.performance * CATEGORY_WEIGHTS.performance;
      totalWeight += CATEGORY_WEIGHTS.performance;
    }
    if (scores.security !== null) {
      weightedSum += scores.security * CATEGORY_WEIGHTS.security;
      totalWeight += CATEGORY_WEIGHTS.security;
    }

    // Avoid division by zero (shouldn't happen in practice)
    if (totalWeight === 0) {
      return 0;
    }

    // Normalize the score based on the weights of modules that were run
    return Math.round(weightedSum / totalWeight);
  }

  /**
   * Generate an executive summary for the report.
   */
  private generateExecutiveSummary(
    healthScore: number,
    scores: BusinessReport['categoryScores'],
    issues: BusinessIssue[]
  ): string {
    const criticalCount = issues.filter((i) => i.severity === 'CRITICAL').length;
    const highCount = issues.filter((i) => i.severity === 'HIGH').length;

    let summary = `Overall website health score is ${healthScore}/100. `;

    if (healthScore >= 80) {
      summary += 'The site is in good condition overall. ';
    } else if (healthScore >= 60) {
      summary += 'There are issues that need attention. ';
    } else {
      summary += 'Serious issues were found that require immediate action. ';
    }

    // Find the weakest dimension (only consider modules that were run)
    const categoryNames: Record<keyof typeof scores, string> = {
      seo: 'SEO',
      performance: 'Performance',
      security: 'Security',
    };

    const scoreEntries = (Object.entries(scores) as [keyof typeof scores, number | null][]).filter(
      (entry): entry is [keyof typeof scores, number] => entry[1] !== null
    );

    if (scoreEntries.length > 0) {
      const [weakestCategory, weakestScore] = scoreEntries.reduce((a, b) => (a[1] < b[1] ? a : b));
      summary += `${categoryNames[weakestCategory]} needs the most improvement (score: ${weakestScore}). `;
    }

    if (criticalCount > 0) {
      summary += `Found ${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} requiring immediate attention. `;
    }

    if (highCount > 0) {
      summary += `Additionally, ${highCount} high-priority issue${highCount > 1 ? 's' : ''} should be addressed soon.`;
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
