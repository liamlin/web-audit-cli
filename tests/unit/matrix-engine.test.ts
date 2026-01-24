/**
 * Tests for Matrix Engine business report generation.
 */

import { describe, it, expect } from 'vitest';
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
function createMockResult(
  category: AuditCategory,
  score: number,
  issues: AuditIssue[] = []
): AuditResult {
  return {
    url: 'https://example.com',
    timestamp: new Date(),
    score,
    category,
    issues,
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
        createMockResult(AuditCategory.SEO, 80),
        createMockResult(AuditCategory.PERFORMANCE, 70),
        createMockResult(AuditCategory.SECURITY, 90),
      ];

      const report = engine.enhanceReport(results);

      expect(report.url).toBe('https://example.com');
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.healthScore).toBeGreaterThanOrEqual(0);
      expect(report.healthScore).toBeLessThanOrEqual(100);
      expect(report.categoryScores).toHaveProperty('seo');
      expect(report.categoryScores).toHaveProperty('performance');
      expect(report.categoryScores).toHaveProperty('security');
      expect(report.executiveSummary).toBeTruthy();
      expect(Array.isArray(report.issues)).toBe(true);
      expect(Array.isArray(report.prioritizedRecommendations)).toBe(true);
      expect(report.rawResults).toBe(results);
    });

    it('should calculate weighted health score correctly', () => {
      // Weights: seo=0.25, performance=0.35, security=0.4
      const results = [
        createMockResult(AuditCategory.SEO, 100),
        createMockResult(AuditCategory.PERFORMANCE, 100),
        createMockResult(AuditCategory.SECURITY, 100),
      ];

      const report = engine.enhanceReport(results);
      expect(report.healthScore).toBe(100);
    });

    it('should weight security higher than other categories', () => {
      // Security only at 0
      const lowSecurityResults = [
        createMockResult(AuditCategory.SEO, 100),
        createMockResult(AuditCategory.PERFORMANCE, 100),
        createMockResult(AuditCategory.SECURITY, 0),
      ];

      // SEO only at 0
      const lowSeoResults = [
        createMockResult(AuditCategory.SEO, 0),
        createMockResult(AuditCategory.PERFORMANCE, 100),
        createMockResult(AuditCategory.SECURITY, 100),
      ];

      const lowSecurityReport = engine.enhanceReport(lowSecurityResults);
      const lowSeoReport = engine.enhanceReport(lowSeoResults);

      // Security has higher weight (0.4) so its low score hurts more
      expect(lowSecurityReport.healthScore).toBeLessThan(lowSeoReport.healthScore);
    });
  });

  describe('issue enhancement', () => {
    it('should add business context to known issues', () => {
      const results = [
        createMockResult(AuditCategory.PERFORMANCE, 50, [
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
        createMockResult(AuditCategory.SEO, 90, [
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
        createMockResult(AuditCategory.SEO, 50, [
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
    it('should mention the weakest category', () => {
      const results = [
        createMockResult(AuditCategory.SEO, 90),
        createMockResult(AuditCategory.PERFORMANCE, 30), // Weakest
        createMockResult(AuditCategory.SECURITY, 80),
      ];

      const report = engine.enhanceReport(results);

      expect(report.executiveSummary.toLowerCase()).toContain('performance');
    });

    it('should mention critical issue count', () => {
      const results = [
        createMockResult(AuditCategory.SEO, 50, [
          createMockIssue('CRITICAL-1', AuditSeverity.CRITICAL, AuditCategory.SEO),
          createMockIssue('CRITICAL-2', AuditSeverity.CRITICAL, AuditCategory.SEO),
        ]),
      ];

      const report = engine.enhanceReport(results);

      expect(report.executiveSummary).toContain('2');
      expect(report.executiveSummary.toLowerCase()).toContain('critical');
    });
  });

  describe('prioritized recommendations', () => {
    it('should generate up to 5 recommendations', () => {
      const issues = Array.from({ length: 10 }, (_, i) =>
        createMockIssue(`ISSUE-${i}`, AuditSeverity.MEDIUM, AuditCategory.SEO)
      );

      const results = [createMockResult(AuditCategory.SEO, 50, issues)];

      const report = engine.enhanceReport(results);

      expect(report.prioritizedRecommendations.length).toBeLessThanOrEqual(5);
    });

    it('should exclude INFO issues from recommendations', () => {
      const results = [
        createMockResult(AuditCategory.SEO, 90, [
          createMockIssue('INFO-1', AuditSeverity.INFO, AuditCategory.SEO),
          createMockIssue('INFO-2', AuditSeverity.INFO, AuditCategory.SEO),
        ]),
      ];

      const report = engine.enhanceReport(results);

      expect(report.prioritizedRecommendations.length).toBe(0);
    });
  });
});
