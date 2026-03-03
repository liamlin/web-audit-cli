/**
 * Tests for Matrix Engine business report generation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MatrixEngine } from '../../src/core/matrix-engine.js';
import {
  AuditCategory,
  AuditSeverity,
  type AuditResult,
  type AuditIssue,
} from '../../src/types/audit.js';

/**
 * Create a mock audit result for testing.
 */
function createMockResult(category: AuditCategory, issues: AuditIssue[] = []): AuditResult {
  return {
    url: 'https://example.com',
    timestamp: new Date(),
    category,
    issues,
    passes: [],
    status: 'success',
  };
}

/**
 * Create a mock issue for testing.
 */
function createMockIssue(id: string, severity: AuditSeverity, category: AuditCategory): AuditIssue {
  return {
    id,
    title: `Test Issue: ${id}`,
    description: 'Test description',
    severity,
    category,
    suggestion: 'Test suggestion',
  };
}

describe('MatrixEngine', () => {
  let engine: MatrixEngine;

  beforeEach(() => {
    engine = new MatrixEngine();
  });

  describe('enhanceReport', () => {
    it('should generate a complete business report', () => {
      const results = [
        createMockResult(AuditCategory.SEO),
        createMockResult(AuditCategory.PERFORMANCE),
        createMockResult(AuditCategory.SECURITY),
      ];

      const report = engine.enhanceReport(results);

      expect(report.url).toBe('https://example.com');
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.executiveSummary).toBeTruthy();
      expect(Array.isArray(report.issues)).toBe(true);
      expect(Array.isArray(report.passes)).toBe(true);
      expect(Array.isArray(report.prioritizedRecommendations)).toBe(true);
      expect(report.rawResults).toBe(results);
      expect(report.methodology).toBeDefined();
    });

    it('should include passes from all results', () => {
      const results = [
        {
          ...createMockResult(AuditCategory.SEO),
          passes: [
            {
              id: 'SEO-PASS-1',
              title: 'SEO check passed',
              category: AuditCategory.SEO,
              source: 'Lighthouse',
            },
          ],
        },
        {
          ...createMockResult(AuditCategory.SECURITY),
          passes: [
            {
              id: 'SEC-PASS-1',
              title: 'Security check passed',
              category: AuditCategory.SECURITY,
              source: 'OWASP',
            },
          ],
        },
      ];

      const report = engine.enhanceReport(results);

      expect(report.passes).toHaveLength(2);
      expect(report.passes.find((p) => p.id === 'SEO-PASS-1')).toBeDefined();
      expect(report.passes.find((p) => p.id === 'SEC-PASS-1')).toBeDefined();
    });
  });

  describe('issue enhancement', () => {
    it('should add business context to known issues', () => {
      const results = [
        createMockResult(AuditCategory.PERFORMANCE, [
          createMockIssue('LCP-POOR', AuditSeverity.HIGH, AuditCategory.PERFORMANCE),
        ]),
      ];

      const report = engine.enhanceReport(results);

      expect(report.issues.length).toBe(1);
      expect(report.issues[0].businessImpact).toBeTruthy();
      expect(report.issues[0].fixDifficulty).toBeTruthy();
      expect(report.issues[0].estimatedEffort).toBeTruthy();
      expect(report.issues[0].expectedOutcome).toBeTruthy();
    });

    it('should use default context for unknown issues', () => {
      const results = [
        createMockResult(AuditCategory.SEO, [
          createMockIssue('UNKNOWN-ISSUE', AuditSeverity.LOW, AuditCategory.SEO),
        ]),
      ];

      const report = engine.enhanceReport(results);

      expect(report.issues.length).toBe(1);
      expect(report.issues[0].businessImpact).toBeTruthy();
      expect(report.issues[0].fixDifficulty).toBe('Medium');
    });
  });

  describe('issue sorting', () => {
    it('should sort issues by severity (CRITICAL first)', () => {
      const results = [
        createMockResult(AuditCategory.SEO, [
          createMockIssue('LOW-1', AuditSeverity.LOW, AuditCategory.SEO),
          createMockIssue('CRITICAL-1', AuditSeverity.CRITICAL, AuditCategory.SEO),
          createMockIssue('HIGH-1', AuditSeverity.HIGH, AuditCategory.SEO),
          createMockIssue('MEDIUM-1', AuditSeverity.MEDIUM, AuditCategory.SEO),
        ]),
      ];

      const report = engine.enhanceReport(results);

      expect(report.issues[0].severity).toBe('CRITICAL');
      expect(report.issues[1].severity).toBe('HIGH');
      expect(report.issues[2].severity).toBe('MEDIUM');
      expect(report.issues[3].severity).toBe('LOW');
    });
  });

  describe('executive summary', () => {
    it('should mention critical issue count', () => {
      const results = [
        createMockResult(AuditCategory.SEO, [
          createMockIssue('CRITICAL-1', AuditSeverity.CRITICAL, AuditCategory.SEO),
          createMockIssue('CRITICAL-2', AuditSeverity.CRITICAL, AuditCategory.SEO),
        ]),
      ];

      const report = engine.enhanceReport(results);

      expect(report.executiveSummary).toContain('2');
      expect(report.executiveSummary.toLowerCase()).toContain('critical');
    });

    it('should mention high-priority issue count', () => {
      const results = [
        createMockResult(AuditCategory.PERFORMANCE, [
          createMockIssue('HIGH-1', AuditSeverity.HIGH, AuditCategory.PERFORMANCE),
        ]),
      ];

      const report = engine.enhanceReport(results);

      expect(report.executiveSummary).toContain('1');
      expect(report.executiveSummary.toLowerCase()).toContain('high');
    });

    it('should mention passes when present', () => {
      const results = [
        {
          ...createMockResult(AuditCategory.SEO),
          passes: [
            {
              id: 'PASS-1',
              title: 'Check passed',
              category: AuditCategory.SEO,
              source: 'Lighthouse',
            },
            {
              id: 'PASS-2',
              title: 'Check passed',
              category: AuditCategory.SEO,
              source: 'Lighthouse',
            },
          ],
        },
      ];

      const report = engine.enhanceReport(results);

      expect(report.executiveSummary).toContain('2 area');
    });

    it('should mention total issue count and categories', () => {
      const results = [
        createMockResult(AuditCategory.SEO, [
          createMockIssue('SEO-1', AuditSeverity.MEDIUM, AuditCategory.SEO),
        ]),
        createMockResult(AuditCategory.SECURITY, [
          createMockIssue('SEC-1', AuditSeverity.LOW, AuditCategory.SECURITY),
        ]),
      ];

      const report = engine.enhanceReport(results);

      expect(report.executiveSummary).toContain('2 issues');
      expect(report.executiveSummary).toContain('SEO');
      expect(report.executiveSummary).toContain('SECURITY');
    });
  });

  describe('prioritized recommendations', () => {
    it('should generate up to 5 recommendations', () => {
      const issues = Array.from({ length: 10 }, (_, i) =>
        createMockIssue(`ISSUE-${i}`, AuditSeverity.MEDIUM, AuditCategory.SEO)
      );

      const results = [createMockResult(AuditCategory.SEO, issues)];

      const report = engine.enhanceReport(results);

      expect(report.prioritizedRecommendations.length).toBeLessThanOrEqual(5);
    });

    it('should exclude INFO issues from recommendations', () => {
      const results = [
        createMockResult(AuditCategory.SEO, [
          createMockIssue('INFO-1', AuditSeverity.INFO, AuditCategory.SEO),
          createMockIssue('INFO-2', AuditSeverity.INFO, AuditCategory.SEO),
        ]),
      ];

      const report = engine.enhanceReport(results);

      expect(report.prioritizedRecommendations.length).toBe(0);
    });
  });

  describe('methodology', () => {
    it('should include full description and checkCount for successful modules', () => {
      const results = [
        {
          ...createMockResult(AuditCategory.SECURITY),
          issues: [createMockIssue('SEC-1', AuditSeverity.MEDIUM, AuditCategory.SECURITY)],
          passes: [
            {
              id: 'SEC-PASS-1',
              title: 'HSTS present',
              category: AuditCategory.SECURITY,
              source: 'OWASP',
            },
            {
              id: 'SEC-PASS-2',
              title: 'CSP present',
              category: AuditCategory.SECURITY,
              source: 'OWASP',
            },
          ],
        },
      ];

      const report = engine.enhanceReport(results);
      const secTest = report.methodology.testsPerformed.find((t) => t.category === 'SECURITY');

      expect(secTest).toBeDefined();
      expect(secTest!.description).toContain('HTTP security header analysis');
      expect(secTest!.description).not.toContain('partial');
      expect(secTest!.description).not.toContain('failed');
      expect(secTest!.checkCount).toBe(3);
    });

    it('should append partial notice when module status is partial', () => {
      const results: AuditResult[] = [
        {
          ...createMockResult(AuditCategory.PERFORMANCE),
          status: 'partial',
          issues: [createMockIssue('LCP-POOR', AuditSeverity.HIGH, AuditCategory.PERFORMANCE)],
        },
      ];

      const report = engine.enhanceReport(results);
      const perfTest = report.methodology.testsPerformed.find((t) => t.category === 'PERFORMANCE');

      expect(perfTest).toBeDefined();
      expect(perfTest!.description).toContain('Core Web Vitals measurement');
      expect(perfTest!.description).toContain(
        'partial results - some checks may have been skipped'
      );
      expect(perfTest!.checkCount).toBe(1);
    });

    it('should show failure message when module status is failed', () => {
      const results: AuditResult[] = [
        {
          ...createMockResult(AuditCategory.SEO),
          status: 'failed',
          errorMessage: 'Chrome not available',
        },
      ];

      const report = engine.enhanceReport(results);
      const seoTest = report.methodology.testsPerformed.find((t) => t.category === 'SEO');

      expect(seoTest).toBeDefined();
      expect(seoTest!.description).toBe('Module execution failed - no checks completed');
      expect(seoTest!.description).not.toContain('Lighthouse');
      expect(seoTest!.checkCount).toBe(0);
    });

    it('should reflect mixed statuses across multiple modules', () => {
      const results: AuditResult[] = [
        {
          ...createMockResult(AuditCategory.SEO),
          status: 'success',
          passes: [
            {
              id: 'SEO-PASS-1',
              title: 'Title OK',
              category: AuditCategory.SEO,
              source: 'Lighthouse',
            },
          ],
        },
        {
          ...createMockResult(AuditCategory.PERFORMANCE),
          status: 'failed',
          errorMessage: 'Chrome crash',
        },
        {
          ...createMockResult(AuditCategory.SECURITY),
          status: 'partial',
          issues: [createMockIssue('SEC-1', AuditSeverity.LOW, AuditCategory.SECURITY)],
        },
      ];

      const report = engine.enhanceReport(results);
      const tests = report.methodology.testsPerformed;

      const seoTest = tests.find((t) => t.category === 'SEO');
      expect(seoTest!.description).toContain('Lighthouse SEO audits');
      expect(seoTest!.description).not.toContain('partial');
      expect(seoTest!.checkCount).toBe(1);

      const perfTest = tests.find((t) => t.category === 'PERFORMANCE');
      expect(perfTest!.description).toBe('Module execution failed - no checks completed');
      expect(perfTest!.checkCount).toBe(0);

      const secTest = tests.find((t) => t.category === 'SECURITY');
      expect(secTest!.description).toContain('HTTP security header analysis');
      expect(secTest!.description).toContain('partial results');
      expect(secTest!.checkCount).toBe(1);
    });
  });
});
