/**
 * Integration tests for ReportGenerator module.
 * Tests HTML generation (PDF tests are skipped for performance).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { ReportGenerator } from '../../src/modules/reporter/index.js';
import {
  AuditCategory,
  AuditSeverity,
  type BusinessReport,
  type BusinessIssue,
  type AuditResult,
} from '../../src/types/index.js';

// Helper to create a sample business issue
const createBusinessIssue = (overrides: Partial<BusinessIssue> = {}): BusinessIssue => ({
  id: 'TEST-001',
  title: 'Test Issue',
  description: 'This is a test issue description',
  severity: AuditSeverity.HIGH,
  category: AuditCategory.SEO,
  suggestion: 'Fix this by doing something',
  businessImpact: 'This could affect your search rankings',
  fixDifficulty: 'Medium',
  estimatedEffort: '2-4 hours',
  expectedOutcome: 'Improved SEO performance',
  ...overrides,
});

// Helper to create a sample audit result
const createAuditResult = (
  category: AuditCategory,
  overrides: Partial<AuditResult> = {}
): AuditResult => ({
  url: 'https://test-site.com',
  timestamp: new Date('2024-01-15T10:00:00Z'),
  score: 85,
  category,
  issues: [],
  status: 'success',
  ...overrides,
});

// Helper to create a sample business report
const createBusinessReport = (overrides: Partial<BusinessReport> = {}): BusinessReport => ({
  url: 'https://test-site.com',
  generatedAt: new Date('2024-01-15T10:00:00Z'),
  healthScore: 75,
  categoryScores: {
    seo: 80,
    performance: 65,
    security: 85,
  },
  executiveSummary:
    'This website has several areas for improvement. The performance score needs attention, while security is in good shape.',
  issues: [
    createBusinessIssue({
      id: 'LCP-POOR',
      title: 'Largest Contentful Paint Needs Improvement',
      description: 'LCP is 3.2s, which is above the recommended 2.5s threshold',
      severity: AuditSeverity.HIGH,
      category: AuditCategory.PERFORMANCE,
      businessImpact: 'Slow page loads can cause users to abandon your site',
      fixDifficulty: 'High',
      estimatedEffort: '1-2 days',
      expectedOutcome: '20% reduction in bounce rate',
    }),
    createBusinessIssue({
      id: 'MISSING-META-DESC',
      title: 'Missing Meta Description',
      description: 'The homepage does not have a meta description',
      severity: AuditSeverity.MEDIUM,
      category: AuditCategory.SEO,
      businessImpact: 'Search engines may display less relevant snippets',
      fixDifficulty: 'Low',
      estimatedEffort: '30 minutes',
      expectedOutcome: 'Better click-through rates from search results',
    }),
    createBusinessIssue({
      id: 'ZAP-10035',
      title: 'Missing HSTS Header',
      description: 'Strict-Transport-Security header is not set',
      severity: AuditSeverity.HIGH,
      category: AuditCategory.SECURITY,
      businessImpact: 'Users may be vulnerable to man-in-the-middle attacks',
      fixDifficulty: 'Low',
      estimatedEffort: '1 hour',
      expectedOutcome: 'Improved security posture',
      affectedUrl: 'https://test-site.com/',
    }),
  ],
  prioritizedRecommendations: [
    'Add HSTS header to improve security (1 hour effort)',
    'Add meta description to homepage (30 minutes effort)',
    'Optimize LCP by improving server response time (1-2 days effort)',
  ],
  rawResults: [
    createAuditResult(AuditCategory.SEO, { score: 80 }),
    createAuditResult(AuditCategory.PERFORMANCE, { score: 65 }),
    createAuditResult(AuditCategory.SECURITY, { score: 85 }),
  ],
  methodology: {
    toolsUsed: [
      {
        name: 'Test Tool',
        version: '1.0',
        purpose: 'Testing',
        credibility: 'For testing purposes',
      },
    ],
    testsPerformed: [{ category: 'Test', description: 'Test description' }],
    auditDate: new Date('2024-01-15T10:00:00Z'),
  },
  language: 'en',
  ...overrides,
});

describe('ReportGenerator Integration Tests', () => {
  const outputDir = path.resolve(process.cwd(), 'test-reports');

  beforeEach(async () => {
    await fs.ensureDir(outputDir);
  });

  afterEach(async () => {
    await fs.remove(outputDir).catch(() => {});
  });

  describe('HTML Report Generation', () => {
    it('should generate a valid HTML file', async () => {
      const generator = new ReportGenerator('en');
      const report = createBusinessReport();
      const outputPath = path.join(outputDir, 'test-report.html');

      await generator.generateHtml(report, outputPath);

      // Check file exists
      const exists = await fs.pathExists(outputPath);
      expect(exists).toBe(true);

      // Check file is not empty
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    });

    it('should include the target URL in the report', async () => {
      const generator = new ReportGenerator('en');
      const report = createBusinessReport({ url: 'https://example.com' });
      const outputPath = path.join(outputDir, 'test-report.html');

      await generator.generateHtml(report, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('https://example.com');
    });

    it('should include the health score', async () => {
      const generator = new ReportGenerator('en');
      const report = createBusinessReport({ healthScore: 82 });
      const outputPath = path.join(outputDir, 'test-report.html');

      await generator.generateHtml(report, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('82');
    });

    it('should include category scores section', async () => {
      const generator = new ReportGenerator('en');
      const report = createBusinessReport({
        categoryScores: {
          seo: 90,
          performance: 75,
          security: 95,
        },
      });
      const outputPath = path.join(outputDir, 'test-report.html');

      await generator.generateHtml(report, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('90'); // SEO score
      expect(content).toContain('75'); // Performance score
      expect(content).toContain('95'); // Security score
      expect(content).toContain('SEO');
      expect(content).toContain('Performance');
      expect(content).toContain('Security');
    });

    it('should include the executive summary', async () => {
      const generator = new ReportGenerator('en');
      const summary = 'This is a custom executive summary for testing.';
      const report = createBusinessReport({ executiveSummary: summary });
      const outputPath = path.join(outputDir, 'test-report.html');

      await generator.generateHtml(report, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain(summary);
    });

    it('should include prioritized recommendations', async () => {
      const generator = new ReportGenerator('en');
      const recommendations = [
        'First priority action',
        'Second priority action',
        'Third priority action',
      ];
      const report = createBusinessReport({
        prioritizedRecommendations: recommendations,
      });
      const outputPath = path.join(outputDir, 'test-report.html');

      await generator.generateHtml(report, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      for (const rec of recommendations) {
        expect(content).toContain(rec);
      }
    });

    it('should include issue details', async () => {
      const generator = new ReportGenerator('en');
      const issue = createBusinessIssue({
        title: 'Custom Test Issue Title',
        description: 'Custom test description',
        businessImpact: 'Custom business impact',
        suggestion: 'Custom suggestion for fix',
      });
      const report = createBusinessReport({ issues: [issue] });
      const outputPath = path.join(outputDir, 'test-report.html');

      await generator.generateHtml(report, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('Custom Test Issue Title');
      expect(content).toContain('Custom business impact');
      expect(content).toContain('Custom suggestion for fix');
    });

    it('should include severity indicators', async () => {
      const generator = new ReportGenerator('en');
      const issues = [
        createBusinessIssue({ severity: AuditSeverity.CRITICAL }),
        createBusinessIssue({ severity: AuditSeverity.HIGH }),
        createBusinessIssue({ severity: AuditSeverity.MEDIUM }),
        createBusinessIssue({ severity: AuditSeverity.LOW }),
        createBusinessIssue({ severity: AuditSeverity.INFO }),
      ];
      const report = createBusinessReport({ issues });
      const outputPath = path.join(outputDir, 'test-report.html');

      await generator.generateHtml(report, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      // Severity labels are translated (English uses title case)
      expect(content).toContain('Critical');
      expect(content).toContain('High');
      expect(content).toContain('Medium');
      expect(content).toContain('Low');
      expect(content).toContain('Info');
    });

    it('should include affected URLs when provided', async () => {
      const generator = new ReportGenerator('en');
      const issue = createBusinessIssue({
        affectedUrl: 'https://test-site.com/affected-page',
      });
      const report = createBusinessReport({ issues: [issue] });
      const outputPath = path.join(outputDir, 'test-report.html');

      await generator.generateHtml(report, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('https://test-site.com/affected-page');
    });

    it('should include fix difficulty', async () => {
      const generator = new ReportGenerator('en');
      const issue = createBusinessIssue({
        fixDifficulty: 'High',
        estimatedEffort: '3-5 days',
      });
      const report = createBusinessReport({ issues: [issue] });
      const outputPath = path.join(outputDir, 'test-report.html');

      await generator.generateHtml(report, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      // Fix difficulty is shown but estimated effort is intentionally hidden from display
      expect(content).toContain('High');
    });

    it('should include expected outcome', async () => {
      const generator = new ReportGenerator('en');
      const issue = createBusinessIssue({
        expectedOutcome: 'Expect 50% improvement in load time',
      });
      const report = createBusinessReport({ issues: [issue] });
      const outputPath = path.join(outputDir, 'test-report.html');

      await generator.generateHtml(report, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('Expect 50% improvement in load time');
    });

    it('should produce valid HTML structure', async () => {
      const generator = new ReportGenerator('en');
      const report = createBusinessReport();
      const outputPath = path.join(outputDir, 'test-report.html');

      await generator.generateHtml(report, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');

      // Check for basic HTML structure
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('<html');
      expect(content).toContain('</html>');
      expect(content).toContain('<head>');
      expect(content).toContain('</head>');
      expect(content).toContain('<body');
      expect(content).toContain('</body>');
    });

    it('should include CSS styling (embedded CSS with variables)', async () => {
      const generator = new ReportGenerator('en');
      const report = createBusinessReport();
      const outputPath = path.join(outputDir, 'test-report.html');

      await generator.generateHtml(report, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      // The reporter uses embedded CSS with CSS custom properties for offline PDF generation
      expect(content).toContain('<style>');
      expect(content).toContain('--bg-primary');
      expect(content).toContain('--text-primary');
    });
  });

  describe('JSON Report Generation', () => {
    it('should generate a valid JSON file', async () => {
      const generator = new ReportGenerator('en');
      const report = createBusinessReport();
      const outputPath = path.join(outputDir, 'test-report.json');

      await generator.generateJson(report, outputPath);

      // Check file exists
      const exists = await fs.pathExists(outputPath);
      expect(exists).toBe(true);

      // Check it's valid JSON
      const content = await fs.readJson(outputPath);
      expect(content).toBeDefined();
    });

    it('should contain all report fields', async () => {
      const generator = new ReportGenerator('en');
      const report = createBusinessReport();
      const outputPath = path.join(outputDir, 'test-report.json');

      await generator.generateJson(report, outputPath);

      const content = await fs.readJson(outputPath);
      expect(content.url).toBe(report.url);
      expect(content.healthScore).toBe(report.healthScore);
      expect(content.categoryScores).toEqual(report.categoryScores);
      expect(content.executiveSummary).toBe(report.executiveSummary);
      expect(content.issues).toHaveLength(report.issues.length);
      expect(content.prioritizedRecommendations).toEqual(report.prioritizedRecommendations);
    });

    it('should preserve issue details in JSON', async () => {
      const generator = new ReportGenerator('en');
      const issue = createBusinessIssue({
        id: 'TEST-JSON-001',
        title: 'JSON Test Issue',
        severity: AuditSeverity.CRITICAL,
      });
      const report = createBusinessReport({ issues: [issue] });
      const outputPath = path.join(outputDir, 'test-report.json');

      await generator.generateJson(report, outputPath);

      const content = await fs.readJson(outputPath);
      expect(content.issues[0].id).toBe('TEST-JSON-001');
      expect(content.issues[0].title).toBe('JSON Test Issue');
      expect(content.issues[0].severity).toBe('CRITICAL');
    });
  });

  describe('Output Directory Creation', () => {
    it('should create output directory if it does not exist', async () => {
      const generator = new ReportGenerator('en');
      const report = createBusinessReport();
      const nestedDir = path.join(outputDir, 'nested', 'deep', 'folder');
      const outputPath = path.join(nestedDir, 'report.html');

      await generator.generateHtml(report, outputPath);

      const exists = await fs.pathExists(outputPath);
      expect(exists).toBe(true);
    });

    it('should handle existing directory gracefully', async () => {
      const generator = new ReportGenerator('en');
      const report = createBusinessReport();
      const outputPath = path.join(outputDir, 'test-report.html');

      // Generate twice to the same location
      await generator.generateHtml(report, outputPath);
      await generator.generateHtml(report, outputPath);

      const exists = await fs.pathExists(outputPath);
      expect(exists).toBe(true);
    });
  });

  describe('Report with No Issues', () => {
    it('should generate valid report when there are no issues', async () => {
      const generator = new ReportGenerator('en');
      const report = createBusinessReport({
        healthScore: 100,
        issues: [],
        prioritizedRecommendations: [],
        executiveSummary: 'Excellent! No issues were found.',
      });
      const outputPath = path.join(outputDir, 'perfect-report.html');

      await generator.generateHtml(report, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('100');
      expect(content).toContain('Excellent! No issues were found.');
    });
  });

  describe('Special Characters Handling', () => {
    it('should handle special characters in content', async () => {
      const generator = new ReportGenerator('en');
      const report = createBusinessReport({
        url: 'https://test-site.com/path?param=value&other=123',
        executiveSummary: 'Issues with <script> tags & "quotes" found.',
        issues: [
          createBusinessIssue({
            title: 'XSS Vulnerability: <script>alert("test")</script>',
            description: 'Found potential XSS via <img onerror="...">',
          }),
        ],
      });
      const outputPath = path.join(outputDir, 'special-chars-report.html');

      await generator.generateHtml(report, outputPath);

      const exists = await fs.pathExists(outputPath);
      expect(exists).toBe(true);

      // File should be readable without errors
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    });
  });

  describe('Date Formatting', () => {
    it('should format dates correctly in HTML output', async () => {
      const generator = new ReportGenerator('en');
      const report = createBusinessReport({
        generatedAt: new Date('2024-06-15T14:30:00Z'),
      });
      const outputPath = path.join(outputDir, 'dated-report.html');

      await generator.generateHtml(report, outputPath);

      const content = await fs.readFile(outputPath, 'utf-8');
      // The date should be formatted in some readable format
      // The exact format depends on the helper, but it should contain
      // parts of the date
      expect(content).toMatch(/06.*15.*2024|2024.*06.*15/);
    });
  });
});
