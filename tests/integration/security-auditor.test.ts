/**
 * Integration tests for SecurityAuditor module.
 * Mocks the SecurityScanner to test the auditor orchestration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditCategory, AuditSeverity, type CliConfig } from '../../src/types/index.js';

// Mock the scanner module
vi.mock('../../src/modules/security/scanner.js', () => {
  return {
    SecurityScanner: vi.fn().mockImplementation(() => ({
      scan: vi.fn().mockResolvedValue({ issues: [], passes: [] }),
    })),
  };
});

import { SecurityScanner } from '../../src/modules/security/scanner.js';

// Default test configuration
const createConfig = (overrides: Partial<CliConfig> = {}): CliConfig => ({
  url: 'https://test-site.com',
  output: './reports',
  modules: ['security'],
  format: ['json'],
  crawlDepth: 50,
  timeout: 300,
  performanceMode: 'desktop',
  language: 'en',
  verbose: false,
  parallel: false,
  ...overrides,
});

describe('SecurityAuditor Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Successful Scan', () => {
    it('should return successful result with scanner issues and passes', async () => {
      const mockIssues = [
        {
          id: 'SEC-HEADERS-HSTS',
          title: 'Strict-Transport-Security Header Not Set',
          description: 'HSTS not set',
          severity: AuditSeverity.MEDIUM,
          category: AuditCategory.SECURITY,
          suggestion: 'Add HSTS header',
          affectedUrl: 'https://test-site.com',
        },
      ];
      const mockPasses = [
        {
          id: 'SEC-HEADERS-CSP',
          title: 'Content Security Policy header set',
          category: AuditCategory.SECURITY,
          source: 'OWASP Secure Headers',
        },
      ];

      vi.mocked(SecurityScanner).mockImplementation(
        () =>
          ({
            scan: vi.fn().mockResolvedValue({ issues: mockIssues, passes: mockPasses }),
          }) as never
      );

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.category).toBe(AuditCategory.SECURITY);
      expect(result.data!.status).toBe('success');
      expect(result.data!.issues).toHaveLength(1);
      expect(result.data!.issues[0].id).toBe('SEC-HEADERS-HSTS');
      expect(result.data!.passes).toHaveLength(1);
      expect(result.data!.passes[0].id).toBe('SEC-HEADERS-CSP');
    });

    it('should return zero issues for a clean site', async () => {
      vi.mocked(SecurityScanner).mockImplementation(
        () =>
          ({
            scan: vi.fn().mockResolvedValue({
              issues: [],
              passes: [
                {
                  id: 'SEC-HEADERS-HSTS',
                  title: 'HSTS OK',
                  category: AuditCategory.SECURITY,
                  source: 'OWASP Secure Headers',
                },
              ],
            }),
          }) as never
      );

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);
      expect(result.data!.issues).toHaveLength(0);
      expect(result.data!.passes.length).toBeGreaterThan(0);
    });

    it('should include scan metadata', async () => {
      vi.mocked(SecurityScanner).mockImplementation(
        () =>
          ({
            scan: vi.fn().mockResolvedValue({ issues: [], passes: [] }),
          }) as never
      );

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(true);
      expect(result.data!.metadata).toMatchObject({
        scanMode: 'passive',
        scanMethod: 'passive',
        alertCount: 0,
      });
    });

    it('should include execution time', async () => {
      vi.mocked(SecurityScanner).mockImplementation(
        () =>
          ({
            scan: vi.fn().mockResolvedValue({ issues: [], passes: [] }),
          }) as never
      );

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle scanner errors gracefully', async () => {
      vi.mocked(SecurityScanner).mockImplementation(
        () =>
          ({
            scan: vi.fn().mockRejectedValue(new Error('Network error')),
          }) as never
      );

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(false);
      expect(result.data!.status).toBe('failed');
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('SECURITY_SCAN_ERROR');
      expect(result.error!.message).toContain('Network error');
      expect(result.error!.recoverable).toBe(true);
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(SecurityScanner).mockImplementation(
        () =>
          ({
            scan: vi.fn().mockRejectedValue('string error'),
          }) as never
      );

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      const result = await auditor.run('https://test-site.com');

      expect(result.success).toBe(false);
      expect(result.error!.message).toBe('Unknown error occurred');
    });
  });

  describe('ELECTRON_MODE', () => {
    it('should pass skipSsrfCheck when ELECTRON_MODE is set', async () => {
      const originalEnv = process.env['ELECTRON_MODE'];
      process.env['ELECTRON_MODE'] = 'true';

      vi.mocked(SecurityScanner).mockImplementation((opts) => {
        // Verify skipSsrfCheck is passed
        expect(opts?.skipSsrfCheck).toBe(true);
        return {
          scan: vi.fn().mockResolvedValue({ issues: [], passes: [] }),
        } as never;
      });

      const { SecurityAuditor } = await import('../../src/modules/security/index.js');

      const config = createConfig();
      const auditor = new SecurityAuditor(config);
      await auditor.run('https://test-site.com');

      process.env['ELECTRON_MODE'] = originalEnv;
    });
  });
});
