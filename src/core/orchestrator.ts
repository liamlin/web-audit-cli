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

  constructor(config: CliConfig) {
    this.config = config;
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
   */
  async runAll(url: string): Promise<OrchestratorResult> {
    if (this.config.parallel) {
      return this.runAllParallel(url);
    }
    return this.runAllSequential(url);
  }

  /**
   * Run modules sequentially (default behavior).
   * Failures are isolated - one module failure doesn't stop others.
   */
  private async runAllSequential(url: string): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const results: AuditResult[] = [];
    const failedModules: string[] = [];
    const skippedModules: string[] = [];

    // Filter to only enabled modules
    const enabledModules = this.modules.filter((m) => this.config.modules.includes(m.key));

    logInfo(`Running ${enabledModules.length} audit module(s) sequentially`);

    for (const module of enabledModules) {
      try {
        startSpinner(`Running ${module.name} audit...`);

        const result = await module.auditor.run(url);

        if (result.success && result.data) {
          results.push(result.data);

          if (result.data.status === 'success') {
            succeedSpinner(`${module.name} audit complete (score: ${result.data.score})`);
          } else if (result.data.status === 'partial') {
            warnSpinner(`${module.name} audit partially complete (score: ${result.data.score})`);
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
          warnSpinner(
            `${module.name} audit skipped: ${result.data.errorMessage ?? 'Unknown reason'}`
          );
        } else {
          failedModules.push(module.name);
          failSpinner(`${module.name} audit failed: ${result.error?.message ?? 'Unknown error'}`);

          // Still add a failed result for completeness
          if (result.data) {
            results.push(result.data);
          }
        }
      } catch (error) {
        failedModules.push(module.name);
        const message = error instanceof Error ? error.message : 'Unknown error';
        failSpinner(`${module.name} audit failed: ${message}`);
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
  private async runAllParallel(url: string): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const results: AuditResult[] = [];
    const failedModules: string[] = [];
    const skippedModules: string[] = [];

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

    // Helper to update spinner with pending modules
    const updateProgress = () => {
      if (pendingModules.size > 0) {
        const names = Array.from(pendingModules).join(', ');
        updateSpinner(`Running audits... [${names}]`);
      }
    };

    // Log that all modules are starting
    for (const module of enabledModules) {
      logModuleStatus(module.name, 'running', `Starting ${module.name} audit...`);
    }

    // Start a spinner to show progress
    startSpinner(`Running audits... [${Array.from(pendingModules).join(', ')}]`);

    // Run all modules in parallel, tracking completion
    const promises = enabledModules.map(async (module) => {
      try {
        const result = await module.auditor.run(url);
        pendingModules.delete(module.name);
        completedResults.push({ module, result, error: null });
        updateProgress();
        return { module, result, error: null };
      } catch (error) {
        pendingModules.delete(module.name);
        completedResults.push({ module, result: null, error });
        updateProgress();
        return { module, result: null, error };
      }
    });

    await Promise.allSettled(promises);

    // Stop the spinner before showing results
    stopSpinner();

    // Process results in completion order
    for (const { module, result, error } of completedResults) {
      if (error) {
        failedModules.push(module.name);
        const message = error instanceof Error ? error.message : 'Unknown error';
        logModuleStatus(module.name, 'failed', `${module.name} audit failed: ${message}`);
        continue;
      }

      if (!result) {
        failedModules.push(module.name);
        logModuleStatus(module.name, 'failed', `${module.name} audit failed: No result`);
        continue;
      }

      if (result.success && result.data) {
        results.push(result.data);

        if (result.data.status === 'success') {
          logModuleStatus(
            module.name,
            'success',
            `${module.name} audit complete (score: ${result.data.score})`
          );
        } else if (result.data.status === 'partial') {
          logModuleStatus(
            module.name,
            'warning',
            `${module.name} audit partially complete (score: ${result.data.score})`
          );
        }

        // Log warnings if any
        if (result.warnings.length > 0) {
          for (const warning of result.warnings) {
            logInfo(`  [${module.name}] Warning: ${warning}`);
          }
        }
      } else if (result.data?.status === 'skipped') {
        skippedModules.push(module.name);
        results.push(result.data);
        logModuleStatus(
          module.name,
          'warning',
          `${module.name} audit skipped: ${result.data.errorMessage ?? 'Unknown reason'}`
        );
      } else {
        failedModules.push(module.name);
        logModuleStatus(
          module.name,
          'failed',
          `${module.name} audit failed: ${result.error?.message ?? 'Unknown error'}`
        );

        // Still add a failed result for completeness
        if (result.data) {
          results.push(result.data);
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
}
