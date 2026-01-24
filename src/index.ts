#!/usr/bin/env node

/**
 * web-audit-cli - A comprehensive CLI tool for website SEO, performance, and security auditing.
 *
 * This is the main entry point for the CLI application.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import inquirer from 'inquirer';

import { CliConfigSchema, type CliConfig } from './types/config.js';

// Read version from package.json (single source of truth)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  await fs.readFile(path.resolve(__dirname, '../package.json'), 'utf-8')
);
const VERSION = packageJson.version as string;
import { Orchestrator } from './core/orchestrator.js';
import { MatrixEngine } from './core/matrix-engine.js';
import {
  SeoAuditor,
  PerformanceAuditor,
  SecurityAuditor,
  ReportGenerator,
} from './modules/index.js';
import {
  setVerbose,
  startSpinner,
  succeedSpinner,
  failSpinner,
  logError,
  logSuccess,
} from './utils/logger.js';
import { checkChromeInstalled } from './modules/performance/chrome-detector.js';
import { checkDockerInstalled, checkDockerRunning } from './modules/security/docker-runner.js';

/**
 * Minimum required Node.js version.
 * Required by undici (via cheerio) which needs Node 20+ for File global.
 */
const MIN_NODE_VERSION = '20.0.0';

/**
 * Environment check result.
 */
interface EnvironmentStatus {
  nodeVersion: { ok: boolean; current: string; required: string };
  chrome: { installed: boolean; version?: string; path?: string };
  docker: { installed: boolean; running: boolean };
}

/**
 * Parse a version string into comparable numbers.
 */
function parseVersion(version: string): number[] {
  return version
    .replace(/^v/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

/**
 * Compare two version strings.
 * Returns: -1 if a < b, 0 if equal, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const partsA = parseVersion(a);
  const partsB = parseVersion(b);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) {
      return -1;
    }
    if (numA > numB) {
      return 1;
    }
  }
  return 0;
}

/**
 * Check if current Node.js version meets minimum requirement.
 */
function checkNodeVersion(): { ok: boolean; current: string; required: string } {
  const current = process.version.replace(/^v/, '');
  const ok = compareVersions(current, MIN_NODE_VERSION) >= 0;
  return { ok, current, required: MIN_NODE_VERSION };
}

/**
 * Check all environment dependencies.
 */
async function checkEnvironment(): Promise<EnvironmentStatus> {
  const nodeVersion = checkNodeVersion();

  // Check Chrome and Docker in parallel
  const [chromeResult, dockerInstalled] = await Promise.all([
    checkChromeInstalled(),
    checkDockerInstalled(),
  ]);

  // Only check if Docker is running if it's installed
  const dockerRunning = dockerInstalled ? await checkDockerRunning() : false;

  const chromeStatus: EnvironmentStatus['chrome'] = {
    installed: chromeResult.installed,
  };
  if (chromeResult.version) {
    chromeStatus.version = chromeResult.version;
  }
  if (chromeResult.path) {
    chromeStatus.path = chromeResult.path;
  }

  return {
    nodeVersion,
    chrome: chromeStatus,
    docker: {
      installed: dockerInstalled,
      running: dockerRunning,
    },
  };
}

/**
 * Display environment status summary (verbose mode).
 */
function showEnvironmentSummary(env: EnvironmentStatus): void {
  console.log(chalk.cyan('\n  Environment Status:'));

  // Node.js
  const nodeIcon = env.nodeVersion.ok ? chalk.green('✔') : chalk.red('✖');
  const nodeStatus = env.nodeVersion.ok
    ? chalk.green(`v${env.nodeVersion.current}`)
    : chalk.red(`v${env.nodeVersion.current} (requires v${env.nodeVersion.required}+)`);
  console.log(`    ${nodeIcon} Node.js: ${nodeStatus}`);

  // Chrome
  const chromeIcon = env.chrome.installed ? chalk.green('✔') : chalk.yellow('○');
  const chromeStatus = env.chrome.installed
    ? chalk.green(`v${env.chrome.version || 'unknown'}`)
    : chalk.yellow('Not found (performance audit will be skipped)');
  console.log(`    ${chromeIcon} Chrome: ${chromeStatus}`);

  // Docker
  let dockerIcon: string;
  let dockerStatus: string;
  if (env.docker.installed && env.docker.running) {
    dockerIcon = chalk.green('✔');
    dockerStatus = chalk.green('Installed and running');
  } else if (env.docker.installed) {
    dockerIcon = chalk.yellow('○');
    dockerStatus = chalk.yellow('Installed but not running (security audit will be skipped)');
  } else {
    dockerIcon = chalk.yellow('○');
    dockerStatus = chalk.yellow('Not found (security audit will be skipped)');
  }
  console.log(`    ${dockerIcon} Docker: ${dockerStatus}`);

  console.log('');
}

/**
 * Display the CLI banner.
 */
function showBanner(): void {
  console.log(
    chalk.cyan(`
╔══════════════════════════════════════════╗
║         🔍 Web Audit CLI v${VERSION.padEnd(14)} ║
╚══════════════════════════════════════════╝
`)
  );
}

/**
 * Display active scan warning and prompt for confirmation.
 * Returns true if user confirms, false otherwise.
 */
async function confirmActiveScan(): Promise<boolean> {
  console.log(
    chalk.yellow.bold(`
╔══════════════════════════════════════════════════════════════════╗
║  WARNING: Active security scanning enabled!                      ║
╠══════════════════════════════════════════════════════════════════╣
║  Active scanning sends attack payloads to the target server      ║
║  which may:                                                      ║
║                                                                  ║
║    - Cause high server load                                      ║
║    - Trigger security alerts/blocks                              ║
║    - Potentially corrupt data in test environments               ║
║                                                                  ║
║  Only use active scanning on systems you own and have            ║
║  permission to test.                                             ║
╚══════════════════════════════════════════════════════════════════╝
`)
  );

  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Do you want to proceed with active security scanning?',
      default: false,
    },
  ]);

  return confirmed;
}

/**
 * Check if a URL is reachable.
 */
async function checkUrlReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
    });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Sanitize a URL's domain for use in a filename.
 */
function sanitizeDomainForFilename(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname
      .replace(/\./g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toLowerCase()
      .slice(0, 50); // Limit length
  } catch {
    return 'unknown';
  }
}

/**
 * Display the results summary.
 */
function showSummary(report: import('./types/audit.js').BusinessReport, outputPath: string): void {
  const criticalCount = report.issues.filter((i) => i.severity === 'CRITICAL').length;
  const highCount = report.issues.filter((i) => i.severity === 'HIGH').length;
  const mediumCount = report.issues.filter((i) => i.severity === 'MEDIUM').length;

  // Build category scores section dynamically (only show modules that were run)
  const scoreLines: string[] = [];
  if (report.categoryScores.seo !== null) {
    scoreLines.push(`    SEO:         ${report.categoryScores.seo}`);
  }
  if (report.categoryScores.performance !== null) {
    scoreLines.push(`    Performance: ${report.categoryScores.performance}`);
  }
  if (report.categoryScores.security !== null) {
    scoreLines.push(`    Security:    ${report.categoryScores.security}`);
  }

  console.log(
    chalk.green(`
══════════════════════════════════════════
  📊 Audit Results Summary
══════════════════════════════════════════
  Category Scores:
${scoreLines.join('\n')}

  Issues Found: ${report.issues.length}
    - Critical: ${criticalCount}
    - High:     ${highCount}
    - Medium:   ${mediumCount}

  📄 Report saved to: ${outputPath}
══════════════════════════════════════════
`)
  );
}

/**
 * Parse CLI arguments into a validated config.
 */
function parseCliArgs(options: Record<string, unknown>): CliConfig {
  // Parse modules and format as arrays
  const modules =
    typeof options.modules === 'string'
      ? options.modules.split(',').map((m: string) => m.trim())
      : options.modules;

  const format =
    typeof options.format === 'string'
      ? options.format.split(',').map((f: string) => f.trim())
      : options.format;

  // Prepare input for validation
  const input = {
    url: options.url as string,
    output: options.output as string | undefined,
    modules,
    format,
    crawlDepth: options.crawlDepth ? parseInt(options.crawlDepth as string, 10) : undefined,
    timeout: options.timeout ? parseInt(options.timeout as string, 10) : undefined,
    securityScanMode: options.securityScanMode as 'passive' | 'active' | undefined,
    performanceMode: options.performanceMode as 'desktop' | 'mobile-4g' | undefined,
    language: options.language as 'zh-TW' | 'en' | undefined,
    verbose: options.verbose as boolean | undefined,
    parallel: options.parallel as boolean | undefined,
  };

  // Validate with Zod
  const result = CliConfigSchema.safeParse(input);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${errors}`);
  }

  return result.data;
}

/**
 * Main CLI function.
 */
async function main(): Promise<void> {
  // Check Node.js version first (before anything else)
  const nodeCheck = checkNodeVersion();
  if (!nodeCheck.ok) {
    console.error(
      chalk.red(
        `\n  ✖ Node.js v${nodeCheck.required}+ is required (current: v${nodeCheck.current})\n`
      )
    );
    console.error(chalk.yellow('    Please upgrade Node.js: https://nodejs.org/\n'));
    process.exit(1);
  }

  const program = new Command();

  program
    .name('web-audit')
    .description('A comprehensive CLI tool for website SEO, performance, and security auditing')
    .version(VERSION)
    .requiredOption('-u, --url <url>', 'Target URL to audit')
    .option('-o, --output <dir>', 'Output directory for reports', './reports')
    .option(
      '-m, --modules <modules>',
      'Comma-separated list of modules to run (seo,performance,security)',
      'seo,performance,security'
    )
    .option(
      '-f, --format <formats>',
      'Comma-separated list of output formats (pdf,json,html)',
      'html'
    )
    .option('-d, --crawl-depth <number>', 'Maximum number of pages to crawl for SEO (1-100)', '50')
    .option('-t, --timeout <seconds>', 'Total timeout in seconds (60-3600)', '300')
    .option(
      '-s, --security-scan-mode <mode>',
      'Security scan mode: "passive" (safe, observes traffic only) or "active" (sends attack payloads - use only on systems you own)',
      'passive'
    )
    .option(
      '-p, --performance-mode <mode>',
      'Performance test mode: "desktop" (no throttling, default) or "mobile-4g" (simulates mobile 4G conditions)',
      'desktop'
    )
    .option(
      '-l, --language <lang>',
      'Report language: "en" (English, default) or "zh-TW" (Traditional Chinese)',
      'en'
    )
    .option('-v, --verbose', 'Enable verbose logging', false)
    .option('--parallel', 'Run audit modules in parallel for faster execution', false)
    .action(async (options) => {
      showBanner();

      try {
        // Parse and validate configuration
        const config = parseCliArgs(options);

        // Set verbose mode
        setVerbose(config.verbose);

        // Check environment dependencies
        if (config.verbose) {
          startSpinner('Checking environment dependencies...');
        }
        const envStatus = await checkEnvironment();

        if (config.verbose) {
          succeedSpinner('Environment check complete');
          showEnvironmentSummary(envStatus);
        } else {
          // In non-verbose mode, still warn about missing dependencies that affect requested modules
          const warnings: string[] = [];
          if (config.modules.includes('performance') && !envStatus.chrome.installed) {
            warnings.push('Chrome not found - performance audit will be skipped');
          }
          if (config.modules.includes('security') && !envStatus.docker.installed) {
            warnings.push('Docker not found - security audit will be skipped');
          } else if (config.modules.includes('security') && !envStatus.docker.running) {
            warnings.push('Docker not running - security audit will be skipped');
          }
          for (const warning of warnings) {
            console.log(chalk.yellow(`  ⚠ ${warning}`));
          }
          if (warnings.length > 0) {
            console.log('');
          }
        }

        // Check URL reachability
        startSpinner(`Checking URL reachability: ${config.url}`);
        const isReachable = await checkUrlReachable(config.url);

        if (!isReachable) {
          failSpinner(`URL is not reachable: ${config.url}`);
          logError('Please check the URL and ensure the target server is accessible.');
          process.exit(1);
        }
        succeedSpinner('URL is reachable');

        // Check if active security scanning is enabled and prompt for confirmation
        if (config.modules.includes('security') && config.securityScanMode === 'active') {
          const confirmed = await confirmActiveScan();
          if (!confirmed) {
            console.log(
              chalk.yellow('\nActive scan cancelled. You can run with passive mode instead:')
            );
            console.log(chalk.gray('  web-audit -u ' + config.url + ' -s passive\n'));
            process.exit(0);
          }
          console.log(chalk.green('\nProceeding with active security scan...\n'));
        }

        // Set up orchestrator
        const orchestrator = new Orchestrator(config);

        // Register enabled modules
        if (config.modules.includes('seo')) {
          orchestrator.registerModule('SEO', 'seo', new SeoAuditor(config));
        }
        if (config.modules.includes('performance')) {
          orchestrator.registerModule('Performance', 'performance', new PerformanceAuditor(config));
        }
        if (config.modules.includes('security')) {
          orchestrator.registerModule('Security', 'security', new SecurityAuditor(config));
        }

        // Run all audits
        const { results, totalTimeMs, failedModules, skippedModules } = await orchestrator.runAll(
          config.url
        );

        // Check if we have any results
        if (results.length === 0) {
          logError('No audit results were generated. All modules failed.');
          process.exit(1);
        }

        // Generate business report
        startSpinner('Generating business report...');
        const matrixEngine = new MatrixEngine(config.language);
        const businessReport = matrixEngine.enhanceReport(results);
        succeedSpinner('Business report generated');

        // Generate output files
        const reporter = new ReportGenerator(config.language);
        const timestamp = Date.now();
        const domain = sanitizeDomainForFilename(config.url);
        const baseFilename = `audit-${domain}-${timestamp}`;

        await fs.ensureDir(config.output);

        let primaryOutputPath = '';

        // Generate requested formats
        for (const format of config.format) {
          const outputPath = path.join(config.output, `${baseFilename}.${format}`);

          startSpinner(`Generating ${format.toUpperCase()} report...`);

          try {
            switch (format) {
              case 'pdf':
                await reporter.generate(businessReport, outputPath);
                break;
              case 'html':
                await reporter.generateHtml(businessReport, outputPath);
                break;
              case 'json':
                await reporter.generateJson(businessReport, outputPath);
                break;
            }

            succeedSpinner(`${format.toUpperCase()} report saved`);

            if (!primaryOutputPath) {
              primaryOutputPath = outputPath;
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            failSpinner(`Failed to generate ${format.toUpperCase()}: ${message}`);
          }
        }

        // Show summary
        showSummary(businessReport, primaryOutputPath);

        // Report warnings about failed/skipped modules
        if (failedModules.length > 0) {
          console.log(chalk.yellow(`  ⚠ Failed modules: ${failedModules.join(', ')}`));
        }
        if (skippedModules.length > 0) {
          console.log(chalk.yellow(`  ⚠ Skipped modules: ${skippedModules.join(', ')}`));
        }

        console.log(chalk.gray(`\n  Total execution time: ${(totalTimeMs / 1000).toFixed(1)}s`));

        logSuccess('Audit complete!');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        logError(message);
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

// Run the CLI
main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
