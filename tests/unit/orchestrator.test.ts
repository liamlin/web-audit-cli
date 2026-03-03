/**
 * Tests for the Orchestrator module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../../src/core/orchestrator.js';
import { BaseAuditor } from '../../src/core/base-auditor.js';
import { AuditCategory, AuditSeverity } from '../../src/types/audit.js';
import type { CliConfig, ModuleResult, AuditResult } from '../../src/types/index.js';

// Mock the logger to avoid console output during tests
vi.mock('../../src/utils/logger.js', () => ({
  startSpinner: vi.fn(),
  succeedSpinner: vi.fn(),
  warnSpinner: vi.fn(),
  failSpinner: vi.fn(),
  stopSpinner: vi.fn(),
  updateSpinner: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarning: vi.fn(),
  logModuleStatus: vi.fn(),
}));

// Helper to create a mock config
function createMockConfig(
  modules: ('seo' | 'performance' | 'security')[] = ['seo', 'performance', 'security'],
  parallel = false
): CliConfig {
  return {
    url: 'https://example.com',
    output: './reports',
    modules,
    format: ['pdf'],
    crawlDepth: 50,
    timeout: 300,
    performanceMode: 'desktop',
    language: 'en',
    verbose: false,
    parallel,
  };
}

// Helper to create a mock auditor
function createMockAuditor(
  category: AuditCategory,
  mockResult: ModuleResult<AuditResult>
): BaseAuditor {
  const auditor = {
    run: vi.fn().mockResolvedValue(mockResult),
  } as unknown as BaseAuditor;
  return auditor;
}

// Helper to create a successful result
function createSuccessResult(category: AuditCategory): ModuleResult<AuditResult> {
  return {
    success: true,
    data: {
      url: 'https://example.com',
      timestamp: new Date(),
      category,
      issues: [],
      passes: [],
      status: 'success',
    },
    warnings: [],
    executionTimeMs: 100,
  };
}

// Helper to create a failed result
function createFailedResult(
  category: AuditCategory,
  errorMessage: string
): ModuleResult<AuditResult> {
  return {
    success: false,
    data: {
      url: 'https://example.com',
      timestamp: new Date(),
      category,
      issues: [],
      passes: [],
      status: 'failed',
      errorMessage,
    },
    error: {
      code: 'TEST_ERROR',
      message: errorMessage,
      recoverable: true,
    },
    warnings: [],
    executionTimeMs: 100,
  };
}

// Helper to create a skipped result
function createSkippedResult(category: AuditCategory, reason: string): ModuleResult<AuditResult> {
  return {
    success: false,
    data: {
      url: 'https://example.com',
      timestamp: new Date(),
      category,
      issues: [],
      passes: [],
      status: 'skipped',
      errorMessage: reason,
    },
    warnings: [],
    executionTimeMs: 10,
  };
}

describe('Orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerModule', () => {
    it('should register modules correctly', () => {
      const config = createMockConfig();
      const orchestrator = new Orchestrator(config);
      const auditor = createMockAuditor(AuditCategory.SEO, createSuccessResult(AuditCategory.SEO));

      orchestrator.registerModule('SEO', 'seo', auditor);

      // We can verify by running and seeing the module executes
      // The module is registered if it runs
    });
  });

  describe('runAll', () => {
    it('should run all enabled modules', async () => {
      const config = createMockConfig(['seo', 'performance']);
      const orchestrator = new Orchestrator(config);

      const seoAuditor = createMockAuditor(
        AuditCategory.SEO,
        createSuccessResult(AuditCategory.SEO)
      );
      const perfAuditor = createMockAuditor(
        AuditCategory.PERFORMANCE,
        createSuccessResult(AuditCategory.PERFORMANCE)
      );
      const secAuditor = createMockAuditor(
        AuditCategory.SECURITY,
        createSuccessResult(AuditCategory.SECURITY)
      );

      orchestrator.registerModule('SEO', 'seo', seoAuditor);
      orchestrator.registerModule('Performance', 'performance', perfAuditor);
      orchestrator.registerModule('Security', 'security', secAuditor);

      const result = await orchestrator.runAll('https://example.com');

      expect(result.results).toHaveLength(2);
      expect(seoAuditor.run).toHaveBeenCalledWith('https://example.com');
      expect(perfAuditor.run).toHaveBeenCalledWith('https://example.com');
      expect(secAuditor.run).not.toHaveBeenCalled(); // Not in enabled modules
    });

    it('should return results from all successful modules', async () => {
      const config = createMockConfig(['seo', 'performance', 'security']);
      const orchestrator = new Orchestrator(config);

      orchestrator.registerModule(
        'SEO',
        'seo',
        createMockAuditor(AuditCategory.SEO, createSuccessResult(AuditCategory.SEO))
      );
      orchestrator.registerModule(
        'Performance',
        'performance',
        createMockAuditor(AuditCategory.PERFORMANCE, createSuccessResult(AuditCategory.PERFORMANCE))
      );
      orchestrator.registerModule(
        'Security',
        'security',
        createMockAuditor(AuditCategory.SECURITY, createSuccessResult(AuditCategory.SECURITY))
      );

      const result = await orchestrator.runAll('https://example.com');

      expect(result.results).toHaveLength(3);
      expect(result.failedModules).toHaveLength(0);
      expect(result.skippedModules).toHaveLength(0);
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should isolate failures and continue with other modules', async () => {
      const config = createMockConfig(['seo', 'performance', 'security']);
      const orchestrator = new Orchestrator(config);

      orchestrator.registerModule(
        'SEO',
        'seo',
        createMockAuditor(AuditCategory.SEO, createSuccessResult(AuditCategory.SEO))
      );
      orchestrator.registerModule(
        'Performance',
        'performance',
        createMockAuditor(
          AuditCategory.PERFORMANCE,
          createFailedResult(AuditCategory.PERFORMANCE, 'Chrome not found')
        )
      );
      orchestrator.registerModule(
        'Security',
        'security',
        createMockAuditor(AuditCategory.SECURITY, createSuccessResult(AuditCategory.SECURITY))
      );

      const result = await orchestrator.runAll('https://example.com');

      expect(result.results).toHaveLength(3); // All modules return results
      expect(result.failedModules).toContain('Performance');
      expect(result.failedModules).toHaveLength(1);
    });

    it('should handle skipped modules', async () => {
      const config = createMockConfig(['seo', 'security']);
      const orchestrator = new Orchestrator(config);

      orchestrator.registerModule(
        'SEO',
        'seo',
        createMockAuditor(AuditCategory.SEO, createSuccessResult(AuditCategory.SEO))
      );
      orchestrator.registerModule(
        'Security',
        'security',
        createMockAuditor(
          AuditCategory.SECURITY,
          createSkippedResult(AuditCategory.SECURITY, 'Docker not installed')
        )
      );

      const result = await orchestrator.runAll('https://example.com');

      expect(result.results).toHaveLength(2);
      expect(result.skippedModules).toContain('Security');
      expect(result.failedModules).toHaveLength(0);
    });

    it('should handle modules that throw exceptions', async () => {
      const config = createMockConfig(['seo', 'performance']);
      const orchestrator = new Orchestrator(config);

      const throwingAuditor = {
        run: vi.fn().mockRejectedValue(new Error('Unexpected error')),
      } as unknown as BaseAuditor;

      orchestrator.registerModule('SEO', 'seo', throwingAuditor);
      orchestrator.registerModule(
        'Performance',
        'performance',
        createMockAuditor(AuditCategory.PERFORMANCE, createSuccessResult(AuditCategory.PERFORMANCE))
      );

      const result = await orchestrator.runAll('https://example.com');

      expect(result.failedModules).toContain('SEO');
      expect(result.results).toHaveLength(1); // Only performance result
    });

    it('should return empty results if no modules registered', async () => {
      const config = createMockConfig(['seo']);
      const orchestrator = new Orchestrator(config);

      const result = await orchestrator.runAll('https://example.com');

      expect(result.results).toHaveLength(0);
      expect(result.failedModules).toHaveLength(0);
    });

    it('should track total execution time', async () => {
      const config = createMockConfig(['seo']);
      const orchestrator = new Orchestrator(config);

      orchestrator.registerModule(
        'SEO',
        'seo',
        createMockAuditor(AuditCategory.SEO, createSuccessResult(AuditCategory.SEO))
      );

      const startTime = Date.now();
      const result = await orchestrator.runAll('https://example.com');
      const elapsed = Date.now() - startTime;

      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.totalTimeMs).toBeLessThanOrEqual(elapsed + 100); // Allow some margin
    });

    it('should handle partial results with warnings', async () => {
      const config = createMockConfig(['seo']);
      const orchestrator = new Orchestrator(config);

      const partialResult: ModuleResult<AuditResult> = {
        success: true,
        data: {
          url: 'https://example.com',
          timestamp: new Date(),
          category: AuditCategory.SEO,
          issues: [],
          passes: [],
          status: 'partial',
        },
        warnings: ['Some pages could not be crawled'],
        executionTimeMs: 100,
      };

      orchestrator.registerModule(
        'SEO',
        'seo',
        createMockAuditor(AuditCategory.SEO, partialResult)
      );

      const result = await orchestrator.runAll('https://example.com');

      expect(result.results).toHaveLength(1);
      expect(result.results[0].status).toBe('partial');
    });
  });

  describe('runAll with abort signal', () => {
    it('should not run any modules when signal is already aborted', async () => {
      const config = createMockConfig(['seo', 'performance']);
      const orchestrator = new Orchestrator(config);

      const seoAuditor = createMockAuditor(
        AuditCategory.SEO,
        createSuccessResult(AuditCategory.SEO)
      );
      const perfAuditor = createMockAuditor(
        AuditCategory.PERFORMANCE,
        createSuccessResult(AuditCategory.PERFORMANCE)
      );

      orchestrator.registerModule('SEO', 'seo', seoAuditor);
      orchestrator.registerModule('Performance', 'performance', perfAuditor);

      const controller = new AbortController();
      controller.abort();

      const result = await orchestrator.runAll('https://example.com', controller.signal);

      expect(result.results).toHaveLength(0);
      expect(seoAuditor.run).not.toHaveBeenCalled();
      expect(perfAuditor.run).not.toHaveBeenCalled();
    });

    it('should stop remaining modules when aborted mid-execution in sequential mode', async () => {
      const config = createMockConfig(['seo', 'performance', 'security']);
      const orchestrator = new Orchestrator(config);
      const controller = new AbortController();

      // SEO auditor aborts the controller when it runs, simulating a timeout
      const seoAuditor = {
        run: vi.fn().mockImplementation(async () => {
          controller.abort();
          return createSuccessResult(AuditCategory.SEO);
        }),
      } as unknown as BaseAuditor;

      const perfAuditor = createMockAuditor(
        AuditCategory.PERFORMANCE,
        createSuccessResult(AuditCategory.PERFORMANCE)
      );
      const secAuditor = createMockAuditor(
        AuditCategory.SECURITY,
        createSuccessResult(AuditCategory.SECURITY)
      );

      orchestrator.registerModule('SEO', 'seo', seoAuditor);
      orchestrator.registerModule('Performance', 'performance', perfAuditor);
      orchestrator.registerModule('Security', 'security', secAuditor);

      const result = await orchestrator.runAll('https://example.com', controller.signal);

      // SEO ran and completed, but Performance and Security should not have started
      expect(seoAuditor.run).toHaveBeenCalled();
      expect(perfAuditor.run).not.toHaveBeenCalled();
      expect(secAuditor.run).not.toHaveBeenCalled();
      expect(result.results).toHaveLength(1);
    });
  });

  describe('runAll with parallel mode', () => {
    it('should run all enabled modules in parallel when parallel=true', async () => {
      const config = createMockConfig(['seo', 'performance', 'security'], true);
      const orchestrator = new Orchestrator(config);

      const executionOrder: string[] = [];

      // Create auditors that track execution order
      const seoAuditor = {
        run: vi.fn().mockImplementation(async () => {
          executionOrder.push('seo-start');
          await new Promise((resolve) => setTimeout(resolve, 10));
          executionOrder.push('seo-end');
          return createSuccessResult(AuditCategory.SEO);
        }),
      } as unknown as BaseAuditor;

      const perfAuditor = {
        run: vi.fn().mockImplementation(async () => {
          executionOrder.push('perf-start');
          await new Promise((resolve) => setTimeout(resolve, 10));
          executionOrder.push('perf-end');
          return createSuccessResult(AuditCategory.PERFORMANCE);
        }),
      } as unknown as BaseAuditor;

      const secAuditor = {
        run: vi.fn().mockImplementation(async () => {
          executionOrder.push('sec-start');
          await new Promise((resolve) => setTimeout(resolve, 10));
          executionOrder.push('sec-end');
          return createSuccessResult(AuditCategory.SECURITY);
        }),
      } as unknown as BaseAuditor;

      orchestrator.registerModule('SEO', 'seo', seoAuditor);
      orchestrator.registerModule('Performance', 'performance', perfAuditor);
      orchestrator.registerModule('Security', 'security', secAuditor);

      const result = await orchestrator.runAll('https://example.com');

      expect(result.results).toHaveLength(3);
      expect(seoAuditor.run).toHaveBeenCalledWith('https://example.com');
      expect(perfAuditor.run).toHaveBeenCalledWith('https://example.com');
      expect(secAuditor.run).toHaveBeenCalledWith('https://example.com');

      // In parallel mode, all starts should happen before any ends
      // (since Promise.allSettled runs them concurrently)
      const startIndices = [
        executionOrder.indexOf('seo-start'),
        executionOrder.indexOf('perf-start'),
        executionOrder.indexOf('sec-start'),
      ];
      const endIndices = [
        executionOrder.indexOf('seo-end'),
        executionOrder.indexOf('perf-end'),
        executionOrder.indexOf('sec-end'),
      ];

      // All starts should be less than the maximum end index
      const maxStartIndex = Math.max(...startIndices);
      const minEndIndex = Math.min(...endIndices);
      expect(maxStartIndex).toBeLessThan(minEndIndex + 3); // Allow some flexibility
    });

    it('should isolate failures in parallel mode', async () => {
      const config = createMockConfig(['seo', 'performance', 'security'], true);
      const orchestrator = new Orchestrator(config);

      orchestrator.registerModule(
        'SEO',
        'seo',
        createMockAuditor(AuditCategory.SEO, createSuccessResult(AuditCategory.SEO))
      );
      orchestrator.registerModule(
        'Performance',
        'performance',
        createMockAuditor(
          AuditCategory.PERFORMANCE,
          createFailedResult(AuditCategory.PERFORMANCE, 'Chrome not found')
        )
      );
      orchestrator.registerModule(
        'Security',
        'security',
        createMockAuditor(AuditCategory.SECURITY, createSuccessResult(AuditCategory.SECURITY))
      );

      const result = await orchestrator.runAll('https://example.com');

      expect(result.results).toHaveLength(3);
      expect(result.failedModules).toContain('Performance');
      expect(result.failedModules).toHaveLength(1);
    });

    it('should handle skipped modules in parallel mode', async () => {
      const config = createMockConfig(['seo', 'security'], true);
      const orchestrator = new Orchestrator(config);

      orchestrator.registerModule(
        'SEO',
        'seo',
        createMockAuditor(AuditCategory.SEO, createSuccessResult(AuditCategory.SEO))
      );
      orchestrator.registerModule(
        'Security',
        'security',
        createMockAuditor(
          AuditCategory.SECURITY,
          createSkippedResult(AuditCategory.SECURITY, 'Docker not installed')
        )
      );

      const result = await orchestrator.runAll('https://example.com');

      expect(result.results).toHaveLength(2);
      expect(result.skippedModules).toContain('Security');
      expect(result.failedModules).toHaveLength(0);
    });

    it('should handle exceptions thrown by modules in parallel mode', async () => {
      const config = createMockConfig(['seo', 'performance'], true);
      const orchestrator = new Orchestrator(config);

      const throwingAuditor = {
        run: vi.fn().mockRejectedValue(new Error('Unexpected error')),
      } as unknown as BaseAuditor;

      orchestrator.registerModule('SEO', 'seo', throwingAuditor);
      orchestrator.registerModule(
        'Performance',
        'performance',
        createMockAuditor(AuditCategory.PERFORMANCE, createSuccessResult(AuditCategory.PERFORMANCE))
      );

      const result = await orchestrator.runAll('https://example.com');

      expect(result.failedModules).toContain('SEO');
      expect(result.results).toHaveLength(1); // Only performance result
    });

    it('should not run any modules when signal is already aborted (parallel)', async () => {
      const config = createMockConfig(['seo', 'performance'], true);
      const orchestrator = new Orchestrator(config);

      const seoAuditor = createMockAuditor(
        AuditCategory.SEO,
        createSuccessResult(AuditCategory.SEO)
      );
      const perfAuditor = createMockAuditor(
        AuditCategory.PERFORMANCE,
        createSuccessResult(AuditCategory.PERFORMANCE)
      );

      orchestrator.registerModule('SEO', 'seo', seoAuditor);
      orchestrator.registerModule('Performance', 'performance', perfAuditor);

      const controller = new AbortController();
      controller.abort();

      const result = await orchestrator.runAll('https://example.com', controller.signal);

      expect(result.results).toHaveLength(0);
      expect(seoAuditor.run).not.toHaveBeenCalled();
      expect(perfAuditor.run).not.toHaveBeenCalled();
    });

    it('should use sequential mode by default (parallel=false)', async () => {
      const config = createMockConfig(['seo', 'performance'], false);
      const orchestrator = new Orchestrator(config);

      const executionOrder: string[] = [];

      const seoAuditor = {
        run: vi.fn().mockImplementation(async () => {
          executionOrder.push('seo-start');
          await new Promise((resolve) => setTimeout(resolve, 5));
          executionOrder.push('seo-end');
          return createSuccessResult(AuditCategory.SEO);
        }),
      } as unknown as BaseAuditor;

      const perfAuditor = {
        run: vi.fn().mockImplementation(async () => {
          executionOrder.push('perf-start');
          await new Promise((resolve) => setTimeout(resolve, 5));
          executionOrder.push('perf-end');
          return createSuccessResult(AuditCategory.PERFORMANCE);
        }),
      } as unknown as BaseAuditor;

      orchestrator.registerModule('SEO', 'seo', seoAuditor);
      orchestrator.registerModule('Performance', 'performance', perfAuditor);

      await orchestrator.runAll('https://example.com');

      // In sequential mode, seo should complete before perf starts
      expect(executionOrder).toEqual(['seo-start', 'seo-end', 'perf-start', 'perf-end']);
    });
  });
});
