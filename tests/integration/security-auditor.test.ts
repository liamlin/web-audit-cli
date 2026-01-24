/**
 * Integration tests for SecurityAuditor module.
 * Mocks Docker checks and ZAP report parsing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { AuditCategory, AuditSeverity, type CliConfig } from '../../src/types/index.js';

// Mock crypto.randomUUID before SecurityAuditor is imported
// This must be hoisted to run before module imports
const mockRandomUUID = vi.hoisted(() => vi.fn(() => 'test-uuid-1234-5678-9abc-def012345678'));

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return {
    ...actual,
    randomUUID: mockRandomUUID,
  };
});

// Mock the docker-runner module
vi.mock('../../src/modules/security/docker-runner.js', () => ({
  checkDockerInstalled: vi.fn(),
  checkDockerRunning: vi.fn(),
  runZapDocker: vi.fn(),
}));

// Mock the zap-config-gen module
vi.mock('../../src/modules/security/zap-config-gen.js', () => ({
  generateZapConfig: vi.fn().mockResolvedValue('/tmp/zap-config.yaml'),
  cleanupZapFiles: vi.fn().mockResolvedValue(undefined),
}));

// Default test configuration
const createConfig = (overrides: Partial<CliConfig> = {}): CliConfig => ({
  url: 'https://test-site.com',
  output: './reports',
  modules: ['security'],
  format: ['json'],
  crawlDepth: 50,
  timeout: 300,
  securityScanMode: 'passive',
  performanceMode: 'desktop',
  language: 'en',
  verbose: false,
  ...overrides,
});

describe('SecurityAuditor Integration Tests', () => {
  const fixtureDir = path.resolve(__dirname, '../fixtures');
  // The tempDir now includes the mocked UUID subdirectory
  const tempDir = path.resolve(process.cwd(), 'temp', 'security-test-uui');

  beforeEach(async () => {
    vi.clearAllMocks();
    // Ensure temp directory exists for tests
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Clean up temp directory
    await fs.remove(path.resolve(process.cwd(), 'temp')).catch(() => {});
  });

  describe('Docker Availability Checks', () => {
    it('should return skipped result when Docker is not installed', async () => {
      const dockerRunner = await import('../../src/modules/security/docker-runner.js');
      vi.mocked(dockerRunner.checkDockerInstalled).mockResolvedValue(false);

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(false);
      expect(result.data).toBeDefined();
      expect(result.data!.status).toBe('skipped');
      expect(result.data!.errorMessage).toContain('Docker is not installed');
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('DOCKER_NOT_INSTALLED');
      expect(result.error!.recoverable).toBe(true);
    });

    it('should return skipped result when Docker daemon is not running', async () => {
      const dockerRunner = await import('../../src/modules/security/docker-runner.js');
      vi.mocked(dockerRunner.checkDockerInstalled).mockResolvedValue(true);
      vi.mocked(dockerRunner.checkDockerRunning).mockResolvedValue(false);

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(false);
      expect(result.data).toBeDefined();
      expect(result.data!.status).toBe('skipped');
      expect(result.data!.errorMessage).toContain('Docker daemon is not running');
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('DOCKER_NOT_RUNNING');
      expect(result.error!.recoverable).toBe(true);
    });
  });

  describe('ZAP Report Parsing', () => {
    it('should correctly parse ZAP alerts into AuditIssues', async () => {
      const dockerRunner = await import('../../src/modules/security/docker-runner.js');
      vi.mocked(dockerRunner.checkDockerInstalled).mockResolvedValue(true);
      vi.mocked(dockerRunner.checkDockerRunning).mockResolvedValue(true);
      vi.mocked(dockerRunner.runZapDocker).mockResolvedValue('ZAP completed');

      // Copy fixture to temp location where SecurityAuditor expects it
      const zapReportFixture = await fs.readFile(path.join(fixtureDir, 'zap-report.json'), 'utf-8');
      await fs.writeFile(path.join(tempDir, 'zap-report.json'), zapReportFixture);

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.category).toBe(AuditCategory.SECURITY);
      expect(result.data!.issues.length).toBe(5);

      // Verify HSTS issue (riskcode: 2 = HIGH)
      const hstsIssue = result.data!.issues.find((issue) => issue.id === 'ZAP-10035');
      expect(hstsIssue).toBeDefined();
      expect(hstsIssue!.title).toBe('Strict-Transport-Security Header Not Set');
      expect(hstsIssue!.severity).toBe(AuditSeverity.HIGH);
      expect(hstsIssue!.affectedUrl).toBe('https://example.com/');
      expect(hstsIssue!.category).toBe(AuditCategory.SECURITY);

      // Verify CSP issue (riskcode: 2 = HIGH)
      const cspIssue = result.data!.issues.find((issue) => issue.id === 'ZAP-10038');
      expect(cspIssue).toBeDefined();
      expect(cspIssue!.title).toBe('Content Security Policy (CSP) Header Not Set');
      expect(cspIssue!.severity).toBe(AuditSeverity.HIGH);

      // Verify X-Frame-Options issue (riskcode: 2 = HIGH)
      const xFrameIssue = result.data!.issues.find((issue) => issue.id === 'ZAP-10020');
      expect(xFrameIssue).toBeDefined();
      expect(xFrameIssue!.title).toBe('X-Frame-Options Header Not Set');
      expect(xFrameIssue!.severity).toBe(AuditSeverity.HIGH);

      // Verify Cookie issue (riskcode: 1 = MEDIUM)
      const cookieIssue = result.data!.issues.find((issue) => issue.id === 'ZAP-90033');
      expect(cookieIssue).toBeDefined();
      expect(cookieIssue!.title).toBe('Loosely Scoped Cookie');
      expect(cookieIssue!.severity).toBe(AuditSeverity.MEDIUM);

      // Verify Timestamp issue (riskcode: 0 = INFO)
      const timestampIssue = result.data!.issues.find((issue) => issue.id === 'ZAP-10096');
      expect(timestampIssue).toBeDefined();
      expect(timestampIssue!.title).toBe('Timestamp Disclosure - Unix');
      expect(timestampIssue!.severity).toBe(AuditSeverity.INFO);
    });

    it('should strip HTML tags from ZAP descriptions', async () => {
      const dockerRunner = await import('../../src/modules/security/docker-runner.js');
      vi.mocked(dockerRunner.checkDockerInstalled).mockResolvedValue(true);
      vi.mocked(dockerRunner.checkDockerRunning).mockResolvedValue(true);
      vi.mocked(dockerRunner.runZapDocker).mockResolvedValue('ZAP completed');

      // Copy fixture to temp location
      const zapReportFixture = await fs.readFile(path.join(fixtureDir, 'zap-report.json'), 'utf-8');
      await fs.writeFile(path.join(tempDir, 'zap-report.json'), zapReportFixture);

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);

      // Check that HTML tags are stripped from description
      const hstsIssue = result.data!.issues.find((issue) => issue.id === 'ZAP-10035');
      expect(hstsIssue!.description).not.toContain('<p>');
      expect(hstsIssue!.description).not.toContain('</p>');
      expect(hstsIssue!.description).toContain('HTTP Strict Transport Security');
    });

    it('should include rawValue with ZAP alert details', async () => {
      const dockerRunner = await import('../../src/modules/security/docker-runner.js');
      vi.mocked(dockerRunner.checkDockerInstalled).mockResolvedValue(true);
      vi.mocked(dockerRunner.checkDockerRunning).mockResolvedValue(true);
      vi.mocked(dockerRunner.runZapDocker).mockResolvedValue('ZAP completed');

      // Copy fixture to temp location
      const zapReportFixture = await fs.readFile(path.join(fixtureDir, 'zap-report.json'), 'utf-8');
      await fs.writeFile(path.join(tempDir, 'zap-report.json'), zapReportFixture);

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);

      const hstsIssue = result.data!.issues.find((issue) => issue.id === 'ZAP-10035');
      expect(hstsIssue!.rawValue).toMatchObject({
        pluginId: '10035',
        riskcode: 2,
        confidence: 2,
      });
    });
  });

  describe('Risk Code Mapping', () => {
    it('should map riskcode 3 to CRITICAL severity', async () => {
      const dockerRunner = await import('../../src/modules/security/docker-runner.js');
      vi.mocked(dockerRunner.checkDockerInstalled).mockResolvedValue(true);
      vi.mocked(dockerRunner.checkDockerRunning).mockResolvedValue(true);
      vi.mocked(dockerRunner.runZapDocker).mockResolvedValue('ZAP completed');

      // Create a report with a critical alert
      const criticalReport = {
        site: [
          {
            alerts: [
              {
                pluginId: '40012',
                name: 'Cross Site Scripting (Reflected)',
                riskcode: 3, // High = CRITICAL in our mapping
                confidence: 3,
                description: 'XSS vulnerability found',
                solution: 'Filter input',
                uri: 'https://test-site.com/search',
              },
            ],
          },
        ],
      };
      await fs.writeFile(path.join(tempDir, 'zap-report.json'), JSON.stringify(criticalReport));

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);
      const xssIssue = result.data!.issues.find((issue) => issue.id === 'ZAP-40012');
      expect(xssIssue).toBeDefined();
      expect(xssIssue!.severity).toBe(AuditSeverity.CRITICAL);
    });
  });

  describe('Graceful Degradation', () => {
    it('should handle missing ZAP report gracefully', async () => {
      const dockerRunner = await import('../../src/modules/security/docker-runner.js');
      vi.mocked(dockerRunner.checkDockerInstalled).mockResolvedValue(true);
      vi.mocked(dockerRunner.checkDockerRunning).mockResolvedValue(true);
      vi.mocked(dockerRunner.runZapDocker).mockResolvedValue('ZAP completed');

      // Don't create the zap-report.json file
      await fs.remove(path.join(tempDir, 'zap-report.json')).catch(() => {});

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      // Should fail when ZAP report is missing (indicates scan failed)
      expect(result.success).toBe(false);
      expect(result.data!.status).toBe('failed');
      expect(result.error?.message).toContain('ZAP report not found');
    });

    it('should handle ZAP execution failure', async () => {
      const dockerRunner = await import('../../src/modules/security/docker-runner.js');
      vi.mocked(dockerRunner.checkDockerInstalled).mockResolvedValue(true);
      vi.mocked(dockerRunner.checkDockerRunning).mockResolvedValue(true);
      vi.mocked(dockerRunner.runZapDocker).mockRejectedValue(new Error('ZAP execution timeout'));

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(false);
      expect(result.data!.status).toBe('failed');
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('SECURITY_SCAN_ERROR');
      expect(result.error!.message).toContain('ZAP execution timeout');
    });
  });

  describe('Scan Mode Configuration', () => {
    it('should pass scan mode to ZAP config generator', async () => {
      const dockerRunner = await import('../../src/modules/security/docker-runner.js');
      const zapConfigGen = await import('../../src/modules/security/zap-config-gen.js');

      vi.mocked(dockerRunner.checkDockerInstalled).mockResolvedValue(true);
      vi.mocked(dockerRunner.checkDockerRunning).mockResolvedValue(true);
      vi.mocked(dockerRunner.runZapDocker).mockResolvedValue('ZAP completed');

      // Create empty report
      await fs.writeFile(path.join(tempDir, 'zap-report.json'), JSON.stringify({ site: [] }));

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig({ securityScanMode: 'active' });
      const auditor = new SecurityAuditor(config);
      await auditor.run('https://test-site.com');

      expect(zapConfigGen.generateZapConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          scanMode: 'active',
        })
      );
    });

    it('should include scan mode in result metadata', async () => {
      const dockerRunner = await import('../../src/modules/security/docker-runner.js');
      vi.mocked(dockerRunner.checkDockerInstalled).mockResolvedValue(true);
      vi.mocked(dockerRunner.checkDockerRunning).mockResolvedValue(true);
      vi.mocked(dockerRunner.runZapDocker).mockResolvedValue('ZAP completed');

      // Create empty report
      await fs.writeFile(path.join(tempDir, 'zap-report.json'), JSON.stringify({ site: [] }));

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig({ securityScanMode: 'passive' });
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);
      expect(result.data!.metadata).toMatchObject({
        scanMode: 'passive',
        alertCount: 0,
      });
    });
  });

  describe('Score Calculation', () => {
    it('should calculate score based on issue severities', async () => {
      const dockerRunner = await import('../../src/modules/security/docker-runner.js');
      vi.mocked(dockerRunner.checkDockerInstalled).mockResolvedValue(true);
      vi.mocked(dockerRunner.checkDockerRunning).mockResolvedValue(true);
      vi.mocked(dockerRunner.runZapDocker).mockResolvedValue('ZAP completed');

      // Copy fixture which has issues at various severities
      const zapReportFixture = await fs.readFile(path.join(fixtureDir, 'zap-report.json'), 'utf-8');
      await fs.writeFile(path.join(tempDir, 'zap-report.json'), zapReportFixture);

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);
      // Score should be reduced based on:
      // - 3 HIGH issues (-10 each = -30)
      // - 1 MEDIUM issue (-5)
      // - 1 INFO issue (0)
      // Expected: 100 - 30 - 5 = 65
      expect(result.data!.score).toBe(65);
    });

    it('should return score of 100 when no issues found', async () => {
      const dockerRunner = await import('../../src/modules/security/docker-runner.js');
      vi.mocked(dockerRunner.checkDockerInstalled).mockResolvedValue(true);
      vi.mocked(dockerRunner.checkDockerRunning).mockResolvedValue(true);
      vi.mocked(dockerRunner.runZapDocker).mockResolvedValue('ZAP completed');

      await fs.writeFile(
        path.join(tempDir, 'zap-report.json'),
        JSON.stringify({ site: [{ alerts: [] }] })
      );

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);
      expect(result.data!.score).toBe(100);
      expect(result.data!.issues).toHaveLength(0);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup temporary files after successful run', async () => {
      const dockerRunner = await import('../../src/modules/security/docker-runner.js');
      const zapConfigGen = await import('../../src/modules/security/zap-config-gen.js');

      vi.mocked(dockerRunner.checkDockerInstalled).mockResolvedValue(true);
      vi.mocked(dockerRunner.checkDockerRunning).mockResolvedValue(true);
      vi.mocked(dockerRunner.runZapDocker).mockResolvedValue('ZAP completed');

      await fs.writeFile(path.join(tempDir, 'zap-report.json'), JSON.stringify({ site: [] }));

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      await auditor.run('https://test-site.com');

      expect(zapConfigGen.cleanupZapFiles).toHaveBeenCalled();
    });

    it('should cleanup temporary files even after failure', async () => {
      const dockerRunner = await import('../../src/modules/security/docker-runner.js');
      const zapConfigGen = await import('../../src/modules/security/zap-config-gen.js');

      vi.mocked(dockerRunner.checkDockerInstalled).mockResolvedValue(true);
      vi.mocked(dockerRunner.checkDockerRunning).mockResolvedValue(true);
      vi.mocked(dockerRunner.runZapDocker).mockRejectedValue(new Error('ZAP failed'));

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      await auditor.run('https://test-site.com');

      expect(zapConfigGen.cleanupZapFiles).toHaveBeenCalled();
    });
  });
});
