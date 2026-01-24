/**
 * Unified error handling utilities.
 */

import type { ModuleResult, AuditResult } from '../types/audit.js';
import { logError, logWarning } from './logger.js';

/**
 * Wraps a module execution with timing and error handling.
 */
export async function runModule<T = AuditResult>(
  moduleName: string,
  fn: () => Promise<T>
): Promise<ModuleResult<T>> {
  const startTime = Date.now();

  try {
    const data = await fn();
    return {
      success: true,
      data,
      warnings: [],
      executionTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';

    logError(`${moduleName} failed: ${message}`);

    return {
      success: false,
      error: {
        code: `${moduleName.toUpperCase().replace(/\s+/g, '_')}_ERROR`,
        message,
        recoverable: true,
      },
      warnings: [],
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Wraps an async operation with timeout.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Standard error codes for the application.
 */
export const ErrorCodes = {
  URL_UNREACHABLE: 'URL_UNREACHABLE',
  DOCKER_NOT_INSTALLED: 'DOCKER_NOT_INSTALLED',
  DOCKER_PERMISSION_DENIED: 'DOCKER_PERMISSION_DENIED',
  CHROME_NOT_FOUND: 'CHROME_NOT_FOUND',
  TIMEOUT: 'TIMEOUT',
  PARSE_ERROR: 'PARSE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

/**
 * Custom error class with error code.
 */
export class AuditError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly recoverable: boolean = true
  ) {
    super(message);
    this.name = 'AuditError';
  }
}

/**
 * Handles warnings by logging and collecting them.
 */
export function collectWarnings(warnings: string[], message: string, verbose = false): void {
  warnings.push(message);
  if (verbose) {
    logWarning(message);
  }
}
