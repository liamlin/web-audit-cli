/**
 * Abstract base class for all audit modules.
 * Provides common functionality and ensures consistent interface.
 */

import type {
  AuditCategory,
  AuditIssue,
  AuditResult,
  AuditSeverity,
  CliConfig,
  ModuleResult,
} from '../types/index.js';

/**
 * Parameters for creating an audit issue (without category).
 */
export interface CreateIssueParams {
  id: string;
  title: string;
  description: string;
  severity: AuditSeverity;
  suggestion: string;
  rawValue?: unknown;
  affectedUrl?: string;
}

/**
 * Abstract base class that all auditors must extend.
 */
export abstract class BaseAuditor {
  /** The CLI configuration */
  protected config: CliConfig;

  /** The audit category this auditor handles */
  protected abstract readonly category: AuditCategory;

  constructor(config: CliConfig) {
    this.config = config;
  }

  /**
   * Run the audit for the given URL.
   * Each auditor must implement this method.
   */
  abstract run(url: string): Promise<ModuleResult<AuditResult>>;

  /**
   * Create an AuditIssue with the correct category automatically filled in.
   */
  protected createIssue(params: CreateIssueParams): AuditIssue {
    return {
      ...params,
      category: this.category,
    };
  }

  /**
   * Calculate score based on issues found.
   * Uses a deduction-based scoring system.
   */
  protected calculateScore(issues: AuditIssue[]): number {
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
   * Create a successful AuditResult.
   */
  protected createResult(
    url: string,
    issues: AuditIssue[],
    metadata?: Record<string, unknown>
  ): AuditResult {
    const result: AuditResult = {
      url,
      timestamp: new Date(),
      score: this.calculateScore(issues),
      category: this.category,
      issues,
      status: 'success',
    };
    if (metadata) {
      result.metadata = metadata;
    }
    return result;
  }

  /**
   * Create a partial AuditResult (some checks failed but results are usable).
   */
  protected createPartialResult(
    url: string,
    issues: AuditIssue[],
    errorMessage: string,
    metadata?: Record<string, unknown>
  ): AuditResult {
    const result: AuditResult = {
      url,
      timestamp: new Date(),
      score: this.calculateScore(issues),
      category: this.category,
      issues,
      status: 'partial',
      errorMessage,
    };
    if (metadata) {
      result.metadata = metadata;
    }
    return result;
  }

  /**
   * Create a skipped AuditResult (module could not run due to missing dependencies).
   */
  protected createSkippedResult(url: string, errorMessage: string): AuditResult {
    return {
      url,
      timestamp: new Date(),
      score: 0,
      category: this.category,
      issues: [],
      status: 'skipped',
      errorMessage,
    };
  }

  /**
   * Create a failed AuditResult.
   */
  protected createFailedResult(url: string, errorMessage: string): AuditResult {
    return {
      url,
      timestamp: new Date(),
      score: 0,
      category: this.category,
      issues: [],
      status: 'failed',
      errorMessage,
    };
  }
}
