/**
 * ZAP Automation Framework configuration generator.
 * Creates YAML configuration files for OWASP ZAP scans.
 */

import fs from 'fs-extra';
import * as path from 'path';

/**
 * Escape a string for safe YAML double-quoted string interpolation.
 * Prevents YAML injection attacks by escaping special characters.
 */
function escapeYamlString(str: string): string {
  return str
    .replace(/\\/g, '\\\\') // Escape backslashes first
    .replace(/"/g, '\\"') // Escape double quotes
    .replace(/\n/g, '\\n') // Escape newlines
    .replace(/\r/g, '\\r') // Escape carriage returns
    .replace(/\t/g, '\\t'); // Escape tabs
}

/**
 * Options for ZAP scan configuration.
 */
export interface ZapConfigOptions {
  /** Target URL to scan */
  targetUrl: string;
  /** Output directory for config and reports */
  outputDir: string;
  /** Scan mode: passive (faster) or active (more thorough) */
  scanMode: 'passive' | 'active';
  /** Spider duration in minutes */
  spiderDuration?: number;
  /** Passive scan wait duration in minutes */
  passiveScanDuration?: number;
  /** Active scan duration in minutes (only used if scanMode is 'active') */
  activeScanDuration?: number;
}

/**
 * Generate a ZAP Automation Framework YAML configuration.
 */
export async function generateZapConfig(options: ZapConfigOptions): Promise<string> {
  const {
    targetUrl,
    outputDir,
    scanMode,
    spiderDuration = 1,
    passiveScanDuration = 2,
    activeScanDuration = 5,
  } = options;

  // Build the YAML configuration
  const config = buildZapConfig({
    targetUrl,
    scanMode,
    spiderDuration,
    passiveScanDuration,
    activeScanDuration,
  });

  // Ensure output directory exists
  await fs.ensureDir(outputDir);

  // Write config file
  const configPath = path.join(outputDir, 'zap-config.yaml');
  await fs.writeFile(configPath, config, 'utf-8');

  return configPath;
}

/**
 * Build the YAML configuration string.
 */
function buildZapConfig(params: {
  targetUrl: string;
  scanMode: 'passive' | 'active';
  spiderDuration: number;
  passiveScanDuration: number;
  activeScanDuration: number;
}): string {
  const { targetUrl, scanMode, spiderDuration, passiveScanDuration, activeScanDuration } = params;

  // Escape URL for safe YAML interpolation (prevents injection attacks)
  const safeUrl = escapeYamlString(targetUrl);

  // Base configuration
  let yaml = `---
env:
  contexts:
    - name: "audit-context"
      urls:
        - "${safeUrl}"
      includePaths:
        - "${safeUrl}.*"

jobs:
  # Spider to build site tree
  - type: spider
    parameters:
      context: "audit-context"
      maxDuration: ${spiderDuration}
      maxChildren: 10

  # Wait for passive scan to complete
  - type: passiveScan-wait
    parameters:
      maxDuration: ${passiveScanDuration}
`;

  // Add active scan if requested
  if (scanMode === 'active') {
    yaml += `
  # Active scan (more thorough but takes longer)
  - type: activeScan
    parameters:
      context: "audit-context"
      maxScanDurationInMins: ${activeScanDuration}
`;
  }

  // Add report generation
  yaml += `
  # Generate JSON report
  - type: report
    parameters:
      template: "traditional-json"
      reportDir: "/zap/wrk"
      reportFile: "zap-report.json"
`;

  return yaml;
}

/**
 * Clean up ZAP temporary files and the instance directory.
 * Removes both the files and the unique temp directory created for this run.
 */
export async function cleanupZapFiles(outputDir: string): Promise<void> {
  const files = ['zap-config.yaml', 'zap-report.json'];

  for (const file of files) {
    const filePath = path.join(outputDir, file);
    try {
      await fs.remove(filePath);
    } catch {
      // Ignore cleanup errors
    }
  }

  // Remove the instance directory itself if it's a security-* subdirectory
  const dirName = path.basename(outputDir);
  if (dirName.startsWith('security-')) {
    try {
      await fs.rmdir(outputDir);
    } catch {
      // Ignore cleanup errors (directory may not be empty or already removed)
    }
  }
}
