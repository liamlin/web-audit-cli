/**
 * Report Generator - Creates PDF, HTML, and JSON reports.
 * Uses Handlebars for templating and Puppeteer for PDF generation.
 *
 * Template Loading:
 * The template is loaded from 'templates/report.hbs' relative to this module.
 * The template uses embedded CSS (not CDN) for offline PDF generation.
 */

import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import type { BusinessReport, BusinessIssue } from '../../types/audit.js';
import { logDebug } from '../../utils/logger.js';
import { type Locale, createTranslator, type TranslationStrings } from '../../utils/i18n.js';

/**
 * Find the Chrome executable path for the current platform.
 * Returns undefined if Chrome is not found.
 */
function findChromePath(): string | undefined {
  // Honor explicit CHROME_PATH (set by Electron, Docker, or CI environments)
  const envPath = process.env['CHROME_PATH'];
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const paths: string[] = [];

  if (process.platform === 'darwin') {
    // macOS paths
    paths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else if (process.platform === 'win32') {
    // Windows paths
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    paths.push(
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe')
    );
  } else {
    // Linux paths
    try {
      const chromePath = execSync(
        'which google-chrome || which chromium-browser || which chromium',
        {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      ).trim();
      if (chromePath) {
        return chromePath;
      }
    } catch {
      // Ignore errors
    }
    paths.push('/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium');
  }

  for (const chromePath of paths) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }

  return undefined;
}

// Get the directory of the current module (works in both src and dist)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Report Generator for creating PDF/HTML/JSON reports.
 */
export class ReportGenerator {
  private handlebars: ReturnType<typeof Handlebars.create>;
  private template: Handlebars.TemplateDelegate<BusinessReport>;
  private locale: Locale;
  private t: (key: keyof TranslationStrings, params?: Record<string, string | number>) => string;

  constructor(locale: Locale = 'zh-TW') {
    this.locale = locale;
    this.t = createTranslator(locale);
    this.handlebars = Handlebars.create();
    this.registerHelpers();
    this.template = this.loadTemplate();
  }

  /**
   * Register Handlebars helpers.
   */
  private registerHelpers(): void {
    // Translation helper
    this.handlebars.registerHelper(
      't',
      (key: keyof TranslationStrings, options?: Handlebars.HelperOptions) => {
        // Extract hash parameters for template substitution
        const params = options?.hash as Record<string, string | number> | undefined;
        return this.t(key, params);
      }
    );

    // Format date based on locale
    this.handlebars.registerHelper('formatDate', (date: Date) => {
      const locale = this.locale === 'zh-TW' ? 'zh-TW' : 'en-US';
      return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(date));
    });

    // Lowercase string
    this.handlebars.registerHelper('lowercase', (str: string) => str?.toLowerCase() ?? '');

    // Equality check
    this.handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

    // Category name mapping (localized)
    this.handlebars.registerHelper('categoryName', (category: string) => {
      const key = `category.${category.toLowerCase()}` as keyof TranslationStrings;
      return this.t(key) || category;
    });

    // Severity label (localized)
    this.handlebars.registerHelper('severityLabel', (severity: string) => {
      const key = `severity.${severity.toLowerCase()}` as keyof TranslationStrings;
      return this.t(key) || severity;
    });

    // Fix difficulty label (localized)
    this.handlebars.registerHelper('difficultyLabel', (difficulty: string) => {
      const key = `difficulty.${difficulty.toLowerCase()}` as keyof TranslationStrings;
      return this.t(key) || difficulty;
    });

    // Count issues by severity
    this.handlebars.registerHelper(
      'countBySeverity',
      (issues: BusinessIssue[], severity: string) => {
        if (!Array.isArray(issues)) {
          return 0;
        }
        return issues.filter((issue) => issue.severity === severity).length;
      }
    );

    // Check if value is not null (for showing modules that were run)
    this.handlebars.registerHelper('isNotNull', (value: unknown) => value !== null);

    // Block helper for equality comparison
    this.handlebars.registerHelper(
      'ifEquals',
      function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
        return a === b ? options.fn(this) : options.inverse(this);
      }
    );
  }

  /**
   * Load the Handlebars template.
   *
   * Attempts to load from multiple locations:
   * 1. templates/report.hbs relative to current module (dist)
   * 2. Fallback paths for development environments
   * 3. Inline default template as last resort
   */
  private loadTemplate(): Handlebars.TemplateDelegate<BusinessReport> {
    const possiblePaths = [
      // Primary: templates directory relative to compiled module
      path.join(__dirname, 'templates', 'report.hbs'),
      // Development: src directory when running with ts-node or similar
      path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        'src',
        'modules',
        'reporter',
        'templates',
        'report.hbs'
      ),
    ];

    let templateSource: string | null = null;

    for (const templatePath of possiblePaths) {
      try {
        if (fs.existsSync(templatePath)) {
          templateSource = fs.readFileSync(templatePath, 'utf-8');
          logDebug(`Loaded template from: ${templatePath}`);
          break;
        }
      } catch {
        // Continue to next path
      }
    }

    if (!templateSource) {
      logDebug('Template file not found, using default inline template');
      templateSource = this.getDefaultTemplate();
    }

    return this.handlebars.compile(templateSource);
  }

  /**
   * Generate a PDF report.
   */
  async generate(report: BusinessReport, outputPath: string): Promise<void> {
    logDebug('Generating PDF report...');

    // Compile HTML
    const html = this.template(report);

    // Try to find system Chrome first (more reliable on Apple Silicon)
    const systemChromePath = findChromePath();

    // Launch Puppeteer with robust configuration for cross-platform compatibility
    const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    };

    // Use system Chrome if available (fixes Apple Silicon issues)
    if (systemChromePath) {
      logDebug(`Using system Chrome: ${systemChromePath}`);
      launchOptions.executablePath = systemChromePath;
    }

    const browser = await puppeteer.launch(launchOptions);

    try {
      const page = await browser.newPage();

      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      // Ensure output directory exists
      await fs.ensureDir(path.dirname(outputPath));

      await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm',
        },
      });

      logDebug(`PDF saved to: ${outputPath}`);
    } finally {
      // CRITICAL: Always close browser
      await browser.close();
    }
  }

  /**
   * Generate an HTML report.
   */
  async generateHtml(report: BusinessReport, outputPath: string): Promise<void> {
    logDebug('Generating HTML report...');

    const html = this.template(report);

    // Ensure output directory exists
    await fs.ensureDir(path.dirname(outputPath));

    await fs.writeFile(outputPath, html, 'utf-8');
    logDebug(`HTML saved to: ${outputPath}`);
  }

  /**
   * Generate a JSON report.
   */
  async generateJson(report: BusinessReport, outputPath: string): Promise<void> {
    logDebug('Generating JSON report...');

    // Ensure output directory exists
    await fs.ensureDir(path.dirname(outputPath));

    await fs.writeJson(outputPath, report, { spaces: 2 });
    logDebug(`JSON saved to: ${outputPath}`);
  }

  /**
   * Default HTML template (used when template file is not found).
   * Uses embedded CSS for offline PDF generation - no CDN dependencies.
   * Matches the slide-like presentation design with table-based issue layout.
   */
  private getDefaultTemplate(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Web Audit Report - {{url}}</title>
  <style>
    /* Embedded CSS for offline PDF generation */
    :root {
      --bg-primary: #ffffff;
      --bg-secondary: #f8fafc;
      --bg-tertiary: #f1f5f9;
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #94a3b8;
      --accent: #2563eb;
      --success: #16a34a;
      --success-light: #dcfce7;
      --warning: #ca8a04;
      --warning-light: #fef9c3;
      --danger: #dc2626;
      --danger-light: #fee2e2;
      --orange: #ea580c;
      --orange-light: #ffedd5;
      --info: #6366f1;
      --info-light: #e0e7ff;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { line-height: 1.6; font-family: system-ui, -apple-system, sans-serif; color: var(--text-primary); }
    body { background: var(--bg-primary); padding: 2rem; }
    h1, h2, h3 { font-weight: 700; }
    @page { size: A4; margin: 15mm; }
    @media print { .page-break { page-break-after: always; } .issue-card { page-break-inside: avoid; } }

    /* Score colors */
    .text-green-600 { color: var(--success); }
    .text-yellow-500 { color: var(--warning); }
    .text-red-500 { color: var(--danger); }

    /* Layout */
    .cover { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
    .cover h1 { font-size: 2.5rem; margin-bottom: 1rem; }
    .cover .url { font-size: 1.25rem; color: var(--text-secondary); word-break: break-all; margin-bottom: 2rem; }
    .cover .date { font-size: 0.875rem; color: var(--text-muted); margin-top: 2rem; }

    .section { margin-bottom: 3rem; }
    .section h2 { font-size: 1.5rem; border-bottom: 3px solid var(--accent); padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
    .section p { color: var(--text-secondary); line-height: 1.7; }

    .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; margin-top: 2rem; }
    .summary-card { background: var(--bg-secondary); border-radius: 1rem; padding: 1.5rem; text-align: center; }
    .summary-card .count { font-size: 2.5rem; font-weight: 700; }
    .summary-card .label { font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.5rem; }
    .summary-card.passes .count { color: var(--success); }
    .summary-card.issues .count { color: var(--danger); }

    .passes-section { margin-top: 2rem; }
    .passes-section h3 { font-size: 1.125rem; margin-bottom: 1rem; color: var(--success); }
    .pass-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--success-light); border-radius: 0.375rem; margin-bottom: 0.5rem; font-size: 0.875rem; }
    .pass-item .check { color: var(--success); font-weight: 700; }
    .pass-source { font-size: 0.75rem; color: var(--text-muted); margin-left: auto; }

    .issue-counts { display: flex; justify-content: center; gap: 2rem; margin-top: 1.5rem; padding: 1rem; background: var(--bg-tertiary); border-radius: 0.5rem; }
    .issue-count-item { display: flex; align-items: center; gap: 0.5rem; }
    .issue-count-item .count { font-size: 1.25rem; font-weight: 700; }
    .issue-count-item .label { font-size: 0.875rem; font-weight: 500; }
    .issue-count-item.critical .count, .issue-count-item.critical .label { color: var(--danger); }
    .issue-count-item.high .count, .issue-count-item.high .label { color: var(--orange); }
    .issue-count-item.medium .count, .issue-count-item.medium .label { color: var(--warning); }
    .issue-count-item.low .count, .issue-count-item.low .label { color: var(--success); }
    .issue-count-item.info .count, .issue-count-item.info .label { color: var(--info); }

    .priority-list { list-style: none; counter-reset: priority; }
    .priority-list li { counter-increment: priority; display: flex; align-items: flex-start; gap: 1rem; padding: 1rem; background: var(--bg-secondary); border-radius: 0.5rem; margin-bottom: 0.75rem; }
    .priority-list li::before { content: counter(priority); width: 1.5rem; height: 1.5rem; background: var(--accent); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 0.75rem; flex-shrink: 0; }

    .issue-card { background: var(--bg-primary); border-radius: 0.5rem; padding: 1.25rem; margin-bottom: 1rem; border-left: 4px solid #e2e8f0; }
    .issue-card.severity-critical { border-left-color: var(--danger); background: var(--danger-light); }
    .issue-card.severity-high { border-left-color: var(--orange); background: var(--orange-light); }
    .issue-card.severity-medium { border-left-color: var(--warning); background: var(--warning-light); }
    .issue-card.severity-low { border-left-color: var(--success); background: var(--success-light); }
    .issue-card.severity-info { border-left-color: var(--info); background: var(--info-light); }

    .issue-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; gap: 1rem; }
    .issue-header-left { flex: 1; }
    .issue-title { font-size: 1rem; font-weight: 600; margin-bottom: 0.25rem; }
    .issue-desc { font-size: 0.875rem; color: var(--text-secondary); }

    .severity-badge { flex-shrink: 0; font-size: 0.625rem; font-weight: 600; padding: 0.125rem 0.5rem; border-radius: 1rem; color: white; }
    .severity-badge.critical { background: var(--danger); }
    .severity-badge.high { background: var(--orange); }
    .severity-badge.medium { background: var(--warning); }
    .severity-badge.low { background: var(--success); }
    .severity-badge.info { background: var(--info); }

    .issue-table { width: 100%; font-size: 0.875rem; border-collapse: collapse; }
    .issue-table td { padding: 0.375rem 0; vertical-align: top; }
    .issue-table td:first-child { font-weight: 500; width: 8rem; color: var(--text-secondary); }
    .issue-table td:last-child { color: var(--text-primary); }

    .affected-url-link { color: var(--accent); word-break: break-all; }
  </style>
</head>
<body>

  <!-- Cover -->
  <section class="cover">
    <h1>Web Audit Report</h1>
    <p class="url">{{url}}</p>
    <p class="date">Generated: {{formatDate generatedAt}}</p>
  </section>

  <div class="page-break"></div>

  <!-- Executive Summary -->
  <section class="section">
    <h2>Executive Summary</h2>
    <p>{{executiveSummary}}</p>
    <div class="summary-grid">
      <div class="summary-card passes">
        <div class="count">{{passes.length}}</div>
        <div class="label">Checks Passed</div>
      </div>
      <div class="summary-card issues">
        <div class="count">{{issues.length}}</div>
        <div class="label">Issues Found</div>
      </div>
    </div>
    <div class="issue-counts">
      <div class="issue-count-item critical"><span class="count">{{countBySeverity issues 'CRITICAL'}}</span><span class="label">Critical</span></div>
      <div class="issue-count-item high"><span class="count">{{countBySeverity issues 'HIGH'}}</span><span class="label">High</span></div>
      <div class="issue-count-item medium"><span class="count">{{countBySeverity issues 'MEDIUM'}}</span><span class="label">Medium</span></div>
      <div class="issue-count-item low"><span class="count">{{countBySeverity issues 'LOW'}}</span><span class="label">Low</span></div>
      <div class="issue-count-item info"><span class="count">{{countBySeverity issues 'INFO'}}</span><span class="label">Info</span></div>
    </div>
  </section>

  <!-- What's Working -->
  {{#if passes.length}}
  <section class="section passes-section">
    <h3>What's Working</h3>
    {{#each passes}}
    <div class="pass-item">
      <span class="check">✓</span>
      <span>{{title}}</span>
      <span class="pass-source">{{source}}</span>
    </div>
    {{/each}}
  </section>
  {{/if}}

  <!-- Priority Actions -->
  <section class="section">
    <h2>Priority Actions</h2>
    <ol class="priority-list">
      {{#each prioritizedRecommendations}}
      <li>{{this}}</li>
      {{/each}}
    </ol>
  </section>

  <div class="page-break"></div>

  <!-- Detailed Issues -->
  <section class="section">
    <h2>Detailed Issue Analysis</h2>
    {{#each issues}}
    <div class="issue-card severity-{{lowercase severity}}">
      <div class="issue-header">
        <div class="issue-header-left">
          <h3 class="issue-title">{{title}}</h3>
          <p class="issue-desc">{{description}}</p>
        </div>
        <span class="severity-badge {{lowercase severity}}">{{severity}}</span>
      </div>
      <table class="issue-table">
        <tr><td>Category</td><td>{{categoryName category}}</td></tr>
        <tr><td>Business Impact</td><td>{{businessImpact}}</td></tr>
        <tr><td>Expected Outcome</td><td>{{expectedOutcome}}</td></tr>
        <tr><td>Fix Difficulty</td><td>{{fixDifficulty}}</td></tr>
        <tr><td>Recommendation</td><td>{{suggestion}}</td></tr>
        {{#if affectedUrl}}<tr><td>Affected URL</td><td><span class="affected-url-link">{{affectedUrl}}</span></td></tr>{{/if}}
      </table>
    </div>
    {{/each}}
  </section>

</body>
</html>`;
  }
}
