/**
 * Orchestrator - Coordinates the execution of all audit modules.
 * Handles module sequencing, error tolerance, and result aggregation.
 */

import type { AuditResult, CliConfig } from '../types/index.js';
import { BaseAuditor } from './base-auditor.js';
import {
  startSpinner,
  succeedSpinner,
  warnSpinner,
  failSpinner,
  logInfo,
  logModuleStatus,
  updateSpinner,
  stopSpinner,
} from '../utils/logger.js';

/**
 * Progress event emitted during audit execution.
 */
export type ProgressCallback = (event: {
  module: string;
  status: 'running' | 'complete' | 'partial' | 'skipped' | 'failed';
  message: string;
}) => void;

/**
 * Module registration entry.
 */
interface ModuleEntry {
  name: string;
  key: 'seo' | 'performance' | 'security';
  auditor: BaseAuditor;
}

/**
 * Result from running all modules.
 */
export interface OrchestratorResult {
  results: AuditResult[];
  totalTimeMs: number;
  failedModules: string[];
  skippedModules: string[];
}

/**
 * Orchestrates the execution of audit modules.
 */
export class Orchestrator {
  private modules: ModuleEntry[] = [];
  private config: CliConfig;
  private onProgress: ProgressCallback | undefined;

  constructor(config: CliConfig, onProgress?: ProgressCallback) {
    this.config = config;
    this.onProgress = onProgress;
  }

  /**
   * Register an auditor module.
   */
  registerModule(
    name: string,
    key: 'seo' | 'performance' | 'security',
    auditor: BaseAuditor
  ): void {
    this.modules.push({ name, key, auditor });
  }

  /**
   * Run all registered modules that are enabled in config.
   * Uses parallel or sequential execution based on config.parallel flag.
   *
   * Pass an AbortSignal to enable cooperative cancellation. When the signal
   * is aborted, no further modules will be started (in-progress modules
   * run to completion).
   */
  async runAll(url: string, signal?: AbortSignal): Promise<OrchestratorResult> {
    if (this.config.parallel) {
      return this.runAllParallel(url, signal);
    }
    return this.runAllSequential(url, signal);
  }

  /**
   * Run modules sequentially (default behavior).
   * Failures are isolated - one module failure doesn't stop others.
   */
  private async runAllSequential(url: string, signal?: AbortSignal): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const results: AuditResult[] = [];
    const failedModules: string[] = [];
    const skippedModules: string[] = [];

    // Filter to only enabled modules
    const enabledModules = this.modules.filter((m) => this.config.modules.includes(m.key));

    logInfo(`Running ${enabledModules.length} audit module(s) sequentially`);

    for (const module of enabledModules) {
      // Cooperative cancellation: stop starting new modules if aborted
      if (signal?.aborted) {
        logInfo('Audit aborted, skipping remaining modules');
        break;
      }

      try {
        if (this.onProgress) {
          this.onProgress({
            module: module.key,
            status: 'running',
            message: `Running ${module.name} audit...`,
          });
        } else {
          startSpinner(`Running ${module.name} audit...`);
        }

        const result = await module.auditor.run(url);

        if (result.success && result.data) {
          results.push(result.data);

          if (result.data.status === 'success') {
            const msg = `${module.name} audit complete (${result.data.issues.length} issues found)`;
            if (this.onProgress) {
              this.onProgress({ module: module.key, status: 'complete', message: msg });
            } else {
              succeedSpinner(msg);
            }
          } else if (result.data.status === 'partial') {
            const msg = `${module.name} audit partially complete (${result.data.issues.length} issues found)`;
            if (this.onProgress) {
              this.onProgress({ module: module.key, status: 'partial', message: msg });
            } else {
              warnSpinner(msg);
            }
          }

          // Log warnings if any
          if (result.warnings.length > 0) {
            for (const warning of result.warnings) {
              logInfo(`  Warning: ${warning}`);
            }
          }
        } else if (result.data?.status === 'skipped') {
          skippedModules.push(module.name);
          results.push(result.data);
          const msg = `${module.name} audit skipped: ${result.data.errorMessage ?? 'Unknown reason'}`;
          if (this.onProgress) {
            this.onProgress({ module: module.key, status: 'skipped', message: msg });
          } else {
            warnSpinner(msg);
          }
        } else {
          failedModules.push(module.name);
          const msg = `${module.name} audit failed: ${result.error?.message ?? 'Unknown error'}`;
          if (this.onProgress) {
            this.onProgress({ module: module.key, status: 'failed', message: msg });
          } else {
            failSpinner(msg);
          }

          // Still add a failed result for completeness
          if (result.data) {
            results.push(result.data);
          }
        }
      } catch (error) {
        failedModules.push(module.name);
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (this.onProgress) {
          this.onProgress({
            module: module.key,
            status: 'failed',
            message: `${module.name} audit failed: ${message}`,
          });
        } else {
          failSpinner(`${module.name} audit failed: ${message}`);
        }
      }
    }

    return {
      results,
      totalTimeMs: Date.now() - startTime,
      failedModules,
      skippedModules,
    };
  }

  /**
   * Run modules in parallel using Promise.allSettled.
   * Shows real-time progress as modules complete.
   */
  private async runAllParallel(url: string, signal?: AbortSignal): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const results: AuditResult[] = [];
    const failedModules: string[] = [];
    const skippedModules: string[] = [];

    // Cooperative cancellation: bail out before launching any modules
    if (signal?.aborted) {
      return { results, totalTimeMs: Date.now() - startTime, failedModules, skippedModules };
    }

    // Filter to only enabled modules
    const enabledModules = this.modules.filter((m) => this.config.modules.includes(m.key));

    logInfo(`Running ${enabledModules.length} audit module(s) in parallel`);

    // Track pending modules for progress display
    const pendingModules = new Set(enabledModules.map((m) => m.name));
    const completedResults: Array<{
      module: ModuleEntry;
      result: Awaited<ReturnType<BaseAuditor['run']>> | null;
      error: unknown;
    }> = [];

    // Helper to update spinner with pending modules (CLI only)
    const updateCliProgress = () => {
      if (!this.onProgress && pendingModules.size > 0) {
        const names = Array.from(pendingModules).join(', ');
        updateSpinner(`Running audits... [${names}]`);
      }
    };

    // Signal all modules as running
    for (const module of enabledModules) {
      if (this.onProgress) {
        this.onProgress({
          module: module.key,
          status: 'running',
          message: `Running ${module.name} audit...`,
        });
      } else {
        logModuleStatus(module.name, 'running', `Starting ${module.name} audit...`);
      }
    }

    if (!this.onProgress) {
      startSpinner(`Running audits... [${Array.from(pendingModules).join(', ')}]`);
    }

    // Run all modules in parallel, emitting progress as each completes
    const promises = enabledModules.map(async (module) => {
      try {
        const result = await module.auditor.run(url);
        pendingModules.delete(module.name);
        completedResults.push({ module, result, error: null });
        this.emitParallelResult(module, result, null, results, failedModules, skippedModules);
        updateCliProgress();
        return { module, result, error: null };
      } catch (error) {
        pendingModules.delete(module.name);
        completedResults.push({ module, result: null, error });
        this.emitParallelResult(module, null, error, results, failedModules, skippedModules);
        updateCliProgress();
        return { module, result: null, error };
      }
    });

    await Promise.allSettled(promises);

    if (!this.onProgress) {
      stopSpinner();

      // CLI: log final results
      for (const { module, result, error } of completedResults) {
        if (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logModuleStatus(module.name, 'failed', `${module.name} audit failed: ${message}`);
        } else if (result?.success && result.data) {
          if (result.data.status === 'success') {
            logModuleStatus(
              module.name,
              'success',
              `${module.name} audit complete (${result.data.issues.length} issues found)`
            );
          } else if (result.data.status === 'partial') {
            logModuleStatus(
              module.name,
              'warning',
              `${module.name} audit partially complete (${result.data.issues.length} issues found)`
            );
          }
          if (result.warnings.length > 0) {
            for (const warning of result.warnings) {
              logInfo(`  [${module.name}] Warning: ${warning}`);
            }
          }
        } else if (result?.data?.status === 'skipped') {
          logModuleStatus(
            module.name,
            'warning',
            `${module.name} audit skipped: ${result.data.errorMessage ?? 'Unknown reason'}`
          );
        } else {
          logModuleStatus(
            module.name,
            'failed',
            `${module.name} audit failed: ${result?.error?.message ?? 'Unknown error'}`
          );
        }
      }
    }

    return {
      results,
      totalTimeMs: Date.now() - startTime,
      failedModules,
      skippedModules,
    };
  }

  /**
   * Process a single parallel module result: push to results arrays and emit onProgress.
   */
  private emitParallelResult(
    module: ModuleEntry,
    result: Awaited<ReturnType<BaseAuditor['run']>> | null,
    error: unknown,
    results: AuditResult[],
    failedModules: string[],
    skippedModules: string[]
  ): void {
    if (error) {
      failedModules.push(module.name);
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (this.onProgress) {
        this.onProgress({
          module: module.key,
          status: 'failed',
          message: `${module.name} audit failed: ${message}`,
        });
      }
      return;
    }

    if (!result) {
      failedModules.push(module.name);
      if (this.onProgress) {
        this.onProgress({
          module: module.key,
          status: 'failed',
          message: `${module.name} audit failed: No result`,
        });
      }
      return;
    }

    if (result.success && result.data) {
      results.push(result.data);
      if (result.data.status === 'success') {
        const msg = `${module.name} audit complete (${result.data.issues.length} issues found)`;
        if (this.onProgress) {
          this.onProgress({ module: module.key, status: 'complete', message: msg });
        }
      } else if (result.data.status === 'partial') {
        const msg = `${module.name} audit partially complete (${result.data.issues.length} issues found)`;
        if (this.onProgress) {
          this.onProgress({ module: module.key, status: 'partial', message: msg });
        }
      }
    } else if (result.data?.status === 'skipped') {
      skippedModules.push(module.name);
      results.push(result.data);
      const msg = `${module.name} audit skipped: ${result.data.errorMessage ?? 'Unknown reason'}`;
      if (this.onProgress) {
        this.onProgress({ module: module.key, status: 'skipped', message: msg });
      }
    } else {
      failedModules.push(module.name);
      const msg = `${module.name} audit failed: ${result.error?.message ?? 'Unknown error'}`;
      if (this.onProgress) {
        this.onProgress({ module: module.key, status: 'failed', message: msg });
      }
      if (result.data) {
        results.push(result.data);
      }
    }
  }
}
