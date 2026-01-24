/**
 * Tests for the error-handler utility.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runModule,
  withTimeout,
  collectWarnings,
  AuditError,
  ErrorCodes,
} from '../../src/utils/error-handler.js';

// Mock the logger
vi.mock('../../src/utils/logger.js', () => ({
  logError: vi.fn(),
  logWarning: vi.fn(),
}));

describe('error-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runModule', () => {
    it('should return success result when function succeeds', async () => {
      const mockData = { value: 'test' };
      const fn = vi.fn().mockResolvedValue(mockData);

      const result = await runModule('TestModule', fn);

      expect(result.success).toBe(true);
      expect(result.data).toBe(mockData);
      expect(result.warnings).toEqual([]);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return failure result when function throws', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Something went wrong'));

      const result = await runModule('TestModule', fn);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('TESTMODULE_ERROR');
      expect(result.error?.message).toBe('Something went wrong');
      expect(result.error?.recoverable).toBe(true);
    });

    it('should handle non-Error throws', async () => {
      const fn = vi.fn().mockRejectedValue('string error');

      const result = await runModule('TestModule', fn);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Unknown error occurred');
    });

    it('should track execution time', async () => {
      const fn = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'done';
      });

      const result = await runModule('TestModule', fn);

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(45);
      expect(result.executionTimeMs).toBeLessThan(200);
    });

    it('should generate correct error code from module name with spaces', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Failed'));

      const result = await runModule('My Test Module', fn);

      expect(result.error?.code).toBe('MY_TEST_MODULE_ERROR');
    });
  });

  describe('withTimeout', () => {
    it('should return result when promise completes before timeout', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 10);
      });

      const result = await withTimeout(promise, 1000, 'Timed out');

      expect(result).toBe('success');
    });

    it('should throw when promise exceeds timeout', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 500);
      });

      await expect(withTimeout(promise, 50, 'Operation timed out')).rejects.toThrow(
        'Operation timed out'
      );
    });

    it('should propagate errors from the promise', async () => {
      const promise = Promise.reject(new Error('Promise error'));

      await expect(withTimeout(promise, 1000, 'Timed out')).rejects.toThrow('Promise error');
    });

    it('should clear timeout when promise resolves', async () => {
      vi.useFakeTimers();

      const promise = Promise.resolve('immediate');
      const resultPromise = withTimeout(promise, 1000, 'Timed out');

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('immediate');

      vi.useRealTimers();
    });
  });

  describe('ErrorCodes', () => {
    it('should have all expected error codes', () => {
      expect(ErrorCodes.URL_UNREACHABLE).toBe('URL_UNREACHABLE');
      expect(ErrorCodes.DOCKER_NOT_INSTALLED).toBe('DOCKER_NOT_INSTALLED');
      expect(ErrorCodes.DOCKER_PERMISSION_DENIED).toBe('DOCKER_PERMISSION_DENIED');
      expect(ErrorCodes.CHROME_NOT_FOUND).toBe('CHROME_NOT_FOUND');
      expect(ErrorCodes.TIMEOUT).toBe('TIMEOUT');
      expect(ErrorCodes.PARSE_ERROR).toBe('PARSE_ERROR');
      expect(ErrorCodes.NETWORK_ERROR).toBe('NETWORK_ERROR');
    });
  });

  describe('AuditError', () => {
    it('should create an error with code and message', () => {
      const error = new AuditError('TEST_CODE', 'Test message');

      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('TEST_CODE');
      expect(error.message).toBe('Test message');
      expect(error.name).toBe('AuditError');
      expect(error.recoverable).toBe(true); // default
    });

    it('should support non-recoverable errors', () => {
      const error = new AuditError('FATAL', 'Critical failure', false);

      expect(error.recoverable).toBe(false);
    });
  });

  describe('collectWarnings', () => {
    it('should add warning to array', () => {
      const warnings: string[] = [];

      collectWarnings(warnings, 'First warning');
      collectWarnings(warnings, 'Second warning');

      expect(warnings).toHaveLength(2);
      expect(warnings).toContain('First warning');
      expect(warnings).toContain('Second warning');
    });

    it('should log warning when verbose is true', async () => {
      const { logWarning } = await import('../../src/utils/logger.js');
      const warnings: string[] = [];

      collectWarnings(warnings, 'Verbose warning', true);

      expect(logWarning).toHaveBeenCalledWith('Verbose warning');
    });

    it('should not log warning when verbose is false', async () => {
      const { logWarning } = await import('../../src/utils/logger.js');
      vi.clearAllMocks();
      const warnings: string[] = [];

      collectWarnings(warnings, 'Silent warning', false);

      expect(logWarning).not.toHaveBeenCalled();
    });
  });
});
