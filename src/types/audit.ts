/**
 * Core type definitions for the web-audit-cli tool.
 * These types define the unified data format used across all audit modules.
 */

/**
 * Severity levels for audit issues.
 * Used to prioritize issues and calculate scores.
 */
export enum AuditSeverity {
  /** Requires immediate attention - major security or functionality risk */
  CRITICAL = 'CRITICAL',
  /** Should be addressed soon - significant impact on quality */
  HIGH = 'HIGH',
  /** Recommended to fix - moderate impact */
  MEDIUM = 'MEDIUM',
  /** Nice to have - minor improvement */
  LOW = 'LOW',
  /** Informational only - no action required */
  INFO = 'INFO',
}

/**
 * Categories of audit checks.
 */
export enum AuditCategory {
  SEO = 'SEO',
  PERFORMANCE = 'PERFORMANCE',
  SECURITY = 'SECURITY',
}

/**
 * A single audit finding/issue.
 */
export interface AuditIssue {
  /**
   * Unique technical identifier for this issue type.
   * Examples: 'LCP-TOO-SLOW', 'ZAP-10035', 'BROKEN-LINK-404'
   */
  id: string;

  /** Human-readable title for the issue */
  title: string;

  /** Technical description of what was found */
  description: string;

  /** How severe this issue is */
  severity: AuditSeverity;

  /** Which audit category this belongs to */
  category: AuditCategory;

  /** Technical suggestion for fixing the issue */
  suggestion: string;

  /** Original raw value or object from the audit engine (for advanced analysis) */
  rawValue?: unknown;

  /** The specific URL where this issue was found (if applicable) */
  affectedUrl?: string;
}

/**
 * Result from a single audit module (SEO, Performance, or Security).
 */
export interface AuditResult {
  /** The URL that was audited */
  url: string;

  /** When this audit was performed */
  timestamp: Date;

  /**
   * Score for this category (0-100).
   * 100 = no issues found, lower scores based on issue severity.
   */
  score: number;

  /** Which category this result belongs to */
  category: AuditCategory;

  /** All issues found during the audit */
  issues: AuditIssue[];

  /** Execution status of this module */
  status: 'success' | 'partial' | 'skipped' | 'failed';

  /** Error message if status is 'failed' or 'skipped' */
  errorMessage?: string;

  /** Additional metadata from the audit engine */
  metadata?: Record<string, unknown>;
}

/**
 * Wrapper for module execution results.
 * Provides consistent error handling and timing across all modules.
 */
export interface ModuleResult<T = AuditResult> {
  /** Whether the module completed successfully */
  success: boolean;

  /** The actual result data (if successful or partial) */
  data?: T;

  /** Error information (if failed) */
  error?: {
    /** Error code for programmatic handling */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Whether the audit can continue without this module */
    recoverable: boolean;
  };

  /** Non-fatal warnings encountered during execution */
  warnings: string[];

  /** How long the module took to execute (in milliseconds) */
  executionTimeMs: number;
}

/**
 * Information about a tool used in the audit.
 */
export interface ToolInfo {
  /** Tool name */
  name: string;
  /** Tool version */
  version: string;
  /** What the tool does */
  purpose: string;
  /** Why this tool is credible/trustworthy */
  credibility: string;
}

/**
 * Information about tests performed in each category.
 */
export interface TestInfo {
  /** Category name (SEO, Performance, Security) */
  category: string;
  /** Description of tests performed */
  description: string;
  /** Number of checks/tests run (if applicable) */
  checkCount?: number;
}

/**
 * Methodology information explaining how the audit was conducted.
 * This section adds credibility to the report by explaining:
 * - What tools were used and why they're trustworthy
 * - What tests were performed
 * - Test conditions (e.g., desktop vs mobile)
 */
export interface MethodologyInfo {
  /** Tools used in the audit */
  toolsUsed: ToolInfo[];
  /** Tests performed in each category */
  testsPerformed: TestInfo[];
  /** When the audit was conducted */
  auditDate: Date;
  /** How long the audit took (in milliseconds) */
  auditDuration?: number;
  /** Performance test specification (e.g., "Desktop, No Throttling") */
  performanceTestSpec?: string;
}

/**
 * An audit issue enriched with business context.
 * Created by the MatrixEngine from raw AuditIssues.
 */
export interface BusinessIssue extends AuditIssue {
  /** Business impact description in non-technical language */
  businessImpact: string;

  /** How difficult is this to fix */
  fixDifficulty: 'Low' | 'Medium' | 'High';

  /** Estimated time to fix */
  estimatedEffort: string;

  /** What improvement to expect after fixing */
  expectedOutcome: string;
}

/**
 * The final business-oriented report.
 * Suitable for decision-makers and stakeholders.
 */
export interface BusinessReport {
  /** The URL that was audited */
  url: string;

  /** When this report was generated */
  generatedAt: Date;

  /**
   * Overall health score (0-100).
   * Weighted average: Security 40%, Performance 35%, SEO 25%
   */
  healthScore: number;

  /** Individual scores for each category (null if module was not run) */
  categoryScores: {
    seo: number | null;
    performance: number | null;
    security: number | null;
  };

  /** Auto-generated summary for executives */
  executiveSummary: string;

  /** All issues with business context, sorted by priority */
  issues: BusinessIssue[];

  /** Top 5 prioritized recommendations */
  prioritizedRecommendations: string[];

  /** Original audit results for technical reference */
  rawResults: AuditResult[];

  /** Methodology information explaining how the audit was conducted */
  methodology: MethodologyInfo;

  /** Report language code (e.g., 'zh-TW', 'en') */
  language: string;
}
