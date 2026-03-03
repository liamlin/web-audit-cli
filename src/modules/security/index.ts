/**
 * Security Auditor - Passive security scanner based on
 * Mozilla Observatory and OWASP Secure Headers Project standards.
 */

import { AuditCategory, type AuditResult, type ModuleResult } from '../../types/index.js';
import { BaseAuditor } from '../../core/base-auditor.js';
import { logDebug, logWarning } from '../../utils/logger.js';
import { SecurityScanner } from './scanner.js';

/**
 * Security Auditor implementation using a passive Node.js scanner.
 */
export class SecurityAuditor extends BaseAuditor {
  protected readonly category = AuditCategory.SECURITY;

  /**
   * Run the security audit using the passive scanner.
   */
  async run(url: string): Promise<ModuleResult<AuditResult>> {
    const startTime = Date.now();

    logDebug('Running passive security scanner');

    try {
      const scanner = new SecurityScanner({
        skipSsrfCheck: !!process.env['ELECTRON_MODE'],
      });
      const { issues, passes } = await scanner.scan(url);

      const result = this.createResult(
        url,
        issues,
        {
          scanMode: 'passive',
          scanMethod: 'passive',
          alertCount: issues.length,
        },
        passes
      );

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
        error: { code: 'SECURITY_SCAN_ERROR', message, recoverable: true },
        executionTimeMs: Date.now() - startTime,
      };
    }
  }
}
