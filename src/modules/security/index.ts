/**
 * Security Auditor - Runs OWASP ZAP via Docker for security scanning.
 * Supports passive (faster) and active (more thorough) scan modes.
 */

import { randomUUID } from 'crypto';
import fs from 'fs-extra';
import * as path from 'path';
import {
  AuditCategory,
  AuditSeverity,
  type AuditIssue,
  type AuditResult,
  type ModuleResult,
} from '../../types/index.js';
import { BaseAuditor } from '../../core/base-auditor.js';
import { logDebug, logWarning } from '../../utils/logger.js';
import { checkDockerInstalled, checkDockerRunning, runZapDocker } from './docker-runner.js';
import { generateZapConfig, cleanupZapFiles } from './zap-config-gen.js';

/**
 * ZAP alert structure from the JSON report.
 * Supports both traditional-json format (alertRef) and newer formats (pluginId).
 */
interface ZapAlert {
  pluginId?: string;
  alertRef?: string;
  name: string;
  riskcode: number | string;
  confidence: number | string;
  description: string;
  solution: string;
  uri?: string;
  instances?: Array<{ uri: string }>;
  other?: string;
  reference?: string;
}

/**
 * ZAP report structure.
 */
interface ZapReport {
  site: Array<{
    alerts: ZapAlert[];
  }>;
}

/**
 * ZAP risk code to severity mapping.
 */
const ZAP_RISK_MAPPING: Record<number, AuditSeverity> = {
  3: AuditSeverity.CRITICAL, // High
  2: AuditSeverity.HIGH, // Medium
  1: AuditSeverity.MEDIUM, // Low
  0: AuditSeverity.INFO, // Informational
};

/**
 * Security Auditor implementation using OWASP ZAP via Docker.
 */
export class SecurityAuditor extends BaseAuditor {
  protected readonly category = AuditCategory.SECURITY;

  private readonly tempDir: string;

  constructor(config: import('../../types/index.js').CliConfig) {
    super(config);
    // Use unique temp directory per instance to support parallel execution
    this.tempDir = path.resolve(process.cwd(), 'temp', `security-${randomUUID().slice(0, 8)}`);
  }

  /**
   * Run the security audit.
   */
  async run(url: string): Promise<ModuleResult<AuditResult>> {
    const startTime = Date.now();

    // Warn if active scanning is enabled
    if (this.config.securityScanMode === 'active') {
      logWarning('Active security scanning enabled!');
      logWarning('Active scanning sends attack payloads to the target server which may:');
      logWarning('  - Cause high server load');
      logWarning('  - Trigger security alerts/blocks');
      logWarning('  - Potentially corrupt data in test environments');
      logWarning('Only use active scanning on systems you own and have permission to test.');
    }

    // Check Docker availability
    const dockerInstalled = await checkDockerInstalled();
    if (!dockerInstalled) {
      return {
        success: false,
        data: this.createSkippedResult(
          url,
          'Docker is not installed. Please install Docker to enable security scanning.'
        ),
        warnings: ['Docker not installed, security scan skipped'],
        error: {
          code: 'DOCKER_NOT_INSTALLED',
          message: 'Please install Docker to enable security scanning',
          recoverable: true,
        },
        executionTimeMs: Date.now() - startTime,
      };
    }

    const dockerRunning = await checkDockerRunning();
    if (!dockerRunning) {
      return {
        success: false,
        data: this.createSkippedResult(
          url,
          'Docker daemon is not running. Please start Docker to enable security scanning.'
        ),
        warnings: ['Docker daemon not running, security scan skipped'],
        error: {
          code: 'DOCKER_NOT_RUNNING',
          message: 'Please start Docker to enable security scanning',
          recoverable: true,
        },
        executionTimeMs: Date.now() - startTime,
      };
    }

    try {
      // Generate ZAP configuration
      logDebug('Generating ZAP configuration...');
      const configPath = await generateZapConfig({
        targetUrl: url,
        outputDir: this.tempDir,
        scanMode: this.config.securityScanMode,
        spiderDuration: 1,
        passiveScanDuration: 2,
        activeScanDuration: this.config.securityScanMode === 'active' ? 5 : 0,
      });

      // Run ZAP
      logDebug('Running OWASP ZAP...');
      const timeoutMs = Math.min(this.config.timeout * 1000, 10 * 60 * 1000);
      await runZapDocker(configPath, this.tempDir, timeoutMs);

      // Parse results
      const reportPath = path.join(this.tempDir, 'zap-report.json');
      const issues = await this.parseZapReport(reportPath, url);

      // Create result
      const result = this.createResult(url, issues, {
        scanMode: this.config.securityScanMode,
        alertCount: issues.length,
      });

      return {
        success: true,
        data: result,
        warnings: [],
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';

      logWarning(`Security scan failed: ${message}`);

      return {
        success: false,
        data: this.createFailedResult(url, message),
        warnings: [],
        error: {
          code: 'SECURITY_SCAN_ERROR',
          message,
          recoverable: true,
        },
        executionTimeMs: Date.now() - startTime,
      };
    } finally {
      // Cleanup temporary files
      try {
        await cleanupZapFiles(this.tempDir);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Parse the ZAP JSON report and convert to AuditIssues.
   */
  private async parseZapReport(reportPath: string, _url: string): Promise<AuditIssue[]> {
    // Check if report exists
    const exists = await fs.pathExists(reportPath);
    if (!exists) {
      throw new Error(
        'ZAP report not found. The security scan may have failed to complete properly.'
      );
    }

    // Read and parse report
    const reportContent = await fs.readFile(reportPath, 'utf-8');
    const report: ZapReport = JSON.parse(reportContent);

    // Extract alerts from all sites
    const alerts: ZapAlert[] = [];
    for (const site of report.site ?? []) {
      alerts.push(...(site.alerts ?? []));
    }

    // Convert to AuditIssues
    return alerts.map((alert) => this.mapZapAlertToIssue(alert));
  }

  /**
   * Convert a ZAP alert to an AuditIssue.
   */
  private mapZapAlertToIssue(alert: ZapAlert): AuditIssue {
    // Handle different field names in ZAP report formats
    const alertId = alert.pluginId || alert.alertRef || 'unknown';
    const riskCode =
      typeof alert.riskcode === 'string' ? parseInt(alert.riskcode, 10) : alert.riskcode;
    const confidence =
      typeof alert.confidence === 'string' ? parseInt(alert.confidence, 10) : alert.confidence;

    // Get affected URL from either uri field or first instance
    const affectedUrl = alert.uri || alert.instances?.[0]?.uri;

    // Build issue params - only include affectedUrl if defined
    const issueParams: Parameters<typeof this.createIssue>[0] = {
      id: `ZAP-${alertId}`,
      title: alert.name,
      description: this.cleanDescription(alert.description),
      severity: ZAP_RISK_MAPPING[riskCode] ?? AuditSeverity.INFO,
      suggestion: this.cleanDescription(alert.solution),
      rawValue: {
        pluginId: alertId,
        riskcode: riskCode,
        confidence: confidence,
        reference: alert.reference,
        other: alert.other,
      },
    };

    if (affectedUrl) {
      issueParams.affectedUrl = affectedUrl;
    }

    return this.createIssue(issueParams);
  }

  /**
   * Clean up ZAP description text (remove HTML tags, normalize whitespace).
   */
  private cleanDescription(text: string): string {
    if (!text) {
      return '';
    }

    return text
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
}
