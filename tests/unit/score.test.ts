/**
 * Tests for score calculation logic.
 */

import { describe, it, expect } from 'vitest';
import { AuditCategory, AuditSeverity, type AuditIssue } from '../../src/types/audit.js';

/**
 * Calculate score from issues (extracted from BaseAuditor for testing).
 */
function calculateScore(issues: AuditIssue[]): number {
  let score = 100;

  for (const issue of issues) {
    switch (issue.severity) {
      case 'CRITICAL':
        score -= 20;
        break;
      case 'HIGH':
        score -= 10;
        break;
      case 'MEDIUM':
        score -= 5;
        break;
      case 'LOW':
        score -= 2;
        break;
      // INFO doesn't deduct points
    }
  }

  return Math.max(0, score);
}

/**
 * Create a mock issue for testing.
 */
function createMockIssue(severity: AuditSeverity): AuditIssue {
  return {
    id: `TEST-${severity}`,
    title: `Test ${severity} Issue`,
    description: 'Test description',
    severity,
    category: AuditCategory.SEO,
    suggestion: 'Test suggestion',
  };
}

describe('Score Calculation', () => {
  describe('base score', () => {
    it('should return 100 for no issues', () => {
      expect(calculateScore([])).toBe(100);
    });
  });

  describe('severity deductions', () => {
    it('should deduct 20 points for CRITICAL issues', () => {
      const issues = [createMockIssue(AuditSeverity.CRITICAL)];
      expect(calculateScore(issues)).toBe(80);
    });

    it('should deduct 10 points for HIGH issues', () => {
      const issues = [createMockIssue(AuditSeverity.HIGH)];
      expect(calculateScore(issues)).toBe(90);
    });

    it('should deduct 5 points for MEDIUM issues', () => {
      const issues = [createMockIssue(AuditSeverity.MEDIUM)];
      expect(calculateScore(issues)).toBe(95);
    });

    it('should deduct 2 points for LOW issues', () => {
      const issues = [createMockIssue(AuditSeverity.LOW)];
      expect(calculateScore(issues)).toBe(98);
    });

    it('should not deduct points for INFO issues', () => {
      const issues = [createMockIssue(AuditSeverity.INFO)];
      expect(calculateScore(issues)).toBe(100);
    });
  });

  describe('multiple issues', () => {
    it('should accumulate deductions from multiple issues', () => {
      const issues = [
        createMockIssue(AuditSeverity.CRITICAL), // -20
        createMockIssue(AuditSeverity.HIGH), // -10
        createMockIssue(AuditSeverity.MEDIUM), // -5
      ];
      expect(calculateScore(issues)).toBe(65);
    });

    it('should handle multiple issues of the same severity', () => {
      const issues = [
        createMockIssue(AuditSeverity.HIGH),
        createMockIssue(AuditSeverity.HIGH),
        createMockIssue(AuditSeverity.HIGH),
      ];
      expect(calculateScore(issues)).toBe(70);
    });
  });

  describe('minimum score', () => {
    it('should not go below 0', () => {
      const issues = [
        createMockIssue(AuditSeverity.CRITICAL),
        createMockIssue(AuditSeverity.CRITICAL),
        createMockIssue(AuditSeverity.CRITICAL),
        createMockIssue(AuditSeverity.CRITICAL),
        createMockIssue(AuditSeverity.CRITICAL),
        createMockIssue(AuditSeverity.CRITICAL), // 6 critical = -120, but min is 0
      ];
      expect(calculateScore(issues)).toBe(0);
    });
  });
});
