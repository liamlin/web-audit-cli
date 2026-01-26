# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`web-audit-cli` is a Node.js CLI tool that performs SEO, performance, and security audits on websites. It combines three audit engines and transforms technical findings into business-focused reports with a "Current State - Threat - Optimization - Expected Outcome" matrix.

## Tech Stack

- **Runtime**: Node.js v20+ LTS (enforced at runtime)
- **Language**: TypeScript v5.x (strict mode, ES2022 target, NodeNext module)
- **CLI**: Commander.js + Inquirer.js + ora + chalk
- **SEO Engine**: Lighthouse SEO audits + Crawlee (broken links) + sitemap.xml validator
- **Performance Engine**: Lighthouse v12 + chrome-launcher (requires Chrome/Chromium)
- **Security Engine**: OWASP ZAP via Docker (requires Docker)
- **Reporting**: Handlebars + Puppeteer (PDF generation)
- **Validation**: Zod for runtime type validation
- **Testing**: Vitest

## Environment Requirements

The CLI checks for required dependencies at startup and provides helpful feedback:

| Dependency      | Required For      | Behavior if Missing                       |
| --------------- | ----------------- | ----------------------------------------- |
| Node.js 20+     | All modules       | Exits with error and install instructions |
| Chrome/Chromium | SEO + Performance | Module skipped with warning               |
| Docker          | Security module   | Module skipped with warning               |

In **verbose mode** (`--verbose`), the CLI displays an environment summary showing the status of all dependencies before running the audit.

## Build & Development Commands

```bash
npm run build        # Compile TypeScript
npm run dev          # Development mode with watch
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run lint         # Lint code
```

## Version Management

This project uses [release-please](https://github.com/googleapis/release-please) for automated versioning and releases.

### How It Works

1. **Single source of truth**: Version is defined only in `package.json`
2. **Conventional commits**: Commit messages determine version bumps:
   - `fix:` → patch version bump (0.1.0 → 0.1.1)
   - `feat:` → minor version bump (0.1.0 → 0.2.0)
   - `feat!:` or `BREAKING CHANGE:` → major version bump (but minor while pre-1.0)
3. **Automated release PRs**: When commits land on `main`, release-please creates/updates a Release PR
4. **Merging releases**: Merging the Release PR triggers version bump, CHANGELOG update, and GitHub release

### Key Files

- `package.json` - Source of truth for version
- `.release-please-manifest.json` - Tracks current version for release-please
- `release-please-config.json` - Configuration for changelog sections and behavior
- `.github/workflows/release.yml` - GitHub Actions workflow

### Important

- **Never manually edit** the version in `package.json` - let release-please handle it
- The CLI reads its version from `package.json` at runtime (no hardcoded versions)
- Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/) format

## Architecture

### Data Flow

```
CLI Entry (Commander.js)
    ↓
Orchestrator (sequential execution, fault-tolerant)
    ↓
┌─────────────┬─────────────┬─────────────┐
│ SeoAuditor  │ Performance │ Security    │
│ (Lighthouse │ Auditor     │ Auditor     │
│ + Crawlee)  │ (Lighthouse)│ (ZAP/Docker)│
└──────┬──────┴──────┬──────┴──────┬──────┘
       │             │             │
       └─────────────┼─────────────┘
                     ↓
              AuditResult[] (unified format)
                     ↓
              MatrixEngine (knowledge-base.ts mapping)
                     ↓
              BusinessReport
                     ↓
              ReportGenerator (PDF/HTML/JSON)
```

### Key Modules

- `src/core/base-auditor.ts` - Abstract base class all auditors extend
- `src/core/orchestrator.ts` - Runs auditors sequentially, single module failure doesn't stop others
- `src/core/matrix-engine.ts` - Transforms technical issues to business language, generates methodology
- `src/core/knowledge-base.ts` - Maps issue IDs to localized business impact descriptions (zh-TW/en)
- `src/utils/i18n.ts` - Translation system for report strings
- `src/modules/seo/` - Lighthouse SEO audits (crawlability, meta, canonicals, robots.txt), sitemap.xml validation, Crawlee broken link detection
- `src/modules/performance/` - Lighthouse integration for Core Web Vitals (LCP, CLS, TBT), supports desktop/mobile modes
- `src/modules/security/` - Docker-based OWASP ZAP passive/active scanning
- `src/modules/reporter/` - Handlebars templates + Puppeteer PDF generation

### Core Types

All modules return `ModuleResult<AuditResult>` for consistent error handling:

- `AuditIssue` - Single finding with id, title, severity, category, suggestion
- `AuditResult` - Module result with score (0-100), issues array, status
- `BusinessIssue` - Extended with businessImpact, fixDifficulty, estimatedEffort, expectedOutcome
- `BusinessReport` - Final report with healthScore, categoryScores, executiveSummary, methodology
- `MethodologyInfo` - Tools used, tests performed, and test conditions (desktop/mobile)
- `LocalizedString` - `{ en: string; 'zh-TW': string }` for bilingual content

### Severity Levels

`CRITICAL > HIGH > MEDIUM > LOW > INFO`

Score deduction: CRITICAL (-20), HIGH (-10), MEDIUM (-5), LOW (-2), INFO (0)

### Health Score Weights

Security (40%) > Performance (35%) > SEO (25%)

## Critical Implementation Patterns

### Resource Cleanup

Chrome (Lighthouse) and Docker (ZAP) processes MUST be killed in `finally` blocks:

```typescript
let chrome: LaunchedChrome | null = null;
try {
  chrome = await chromeLauncher.launch({...});
  // ... use chrome
} finally {
  if (chrome) await chrome.kill();
}
```

### Error Tolerance

Individual module failures should not crash the entire audit. Use `ModuleResult` wrapper with `status: 'partial' | 'skipped' | 'failed'`.

### Docker Check

Security module must gracefully degrade if Docker is not installed:

```typescript
const dockerInstalled = await checkDockerInstalled();
if (!dockerInstalled) {
  return { success: false, status: 'skipped', ... };
}
```

### Chrome Check

Performance module must gracefully degrade if Chrome is not installed:

```typescript
const chromeCheck = await checkChromeInstalled();
if (!chromeCheck.installed) {
  return { success: false, status: 'skipped', error: { code: 'CHROME_NOT_INSTALLED', ... } };
}
```

### Cross-Platform Paths

Always use `path.resolve()` for Docker volume mounts and temp directories.

## CLI Options

```
--url <url>            Target URL (required)
--output <dir>         Output directory (default: ./reports)
--modules <list>       Modules to run: seo,performance,security
--format <list>        Output formats: pdf,json,html (default: html)
--crawl-depth <n>      SEO crawl depth (default: 50, max: 100)
--timeout <seconds>    Total timeout (default: 300, max: 3600)
--security-scan-mode   passive | active (default: passive)
--performance-mode     desktop | mobile-4g (default: desktop)
--language             zh-TW | en (default: en)
--parallel             Run modules in parallel (default: false)
--verbose              Enable detailed logging
```

## Internationalization (i18n)

Reports support Traditional Chinese (zh-TW) and English (en). The default is English (en).

### Key i18n Files

- `src/utils/i18n.ts` - Translation system with `createTranslator()` function
- `src/core/knowledge-base.ts` - All issue entries use `LocalizedString` type

### LocalizedString Pattern

```typescript
interface LocalizedString {
  en: string;
  'zh-TW': string;
}

// Usage in knowledge-base.ts
{
  businessImpact: {
    en: 'Users may leave due to slow loading...',
    'zh-TW': '使用者可能因載入緩慢而離開...',
  },
}
```

### Adding Translations

When adding new knowledge base entries, always provide both languages:

```typescript
'NEW-ISSUE-ID': {
  businessImpact: { en: '...', 'zh-TW': '...' },
  fixDifficulty: 'Medium',
  estimatedEffort: { en: '2-4 hours', 'zh-TW': '2-4 小時' },
  expectedOutcome: { en: '...', 'zh-TW': '...' },
}
```

## Testing Strategy

- Unit tests: Zod schema validation, score calculation, knowledge-base mapping
- Integration tests: Mock HTTP responses (nock), mock Lighthouse LHR JSON, mock Docker/ZAP output
- Avoid real Chrome/Docker in CI - use pre-recorded fixtures

## Running the CLI

```bash
# After building
node dist/index.js --url https://example.com

# English report with mobile performance testing
node dist/index.js --url https://example.com --language en --performance-mode mobile-4g

# Or with npm link (after npm link)
web-audit --url https://example.com --modules seo,performance --format pdf,json
```

## Adding New Issue Types

1. Define the issue ID pattern (e.g., `NEW-ISSUE-TYPE`)
2. Add the issue in the relevant auditor module using `this.createIssue()`
3. Add the business context entry in `src/core/knowledge-base.ts` with both `en` and `zh-TW` translations
4. The MatrixEngine will automatically enrich issues with localized business context

## Documentation Rules

**IMPORTANT**: Documentation must always be kept in sync with implementations.

When making code changes that affect:

- CLI options or behavior → Update `README.md` and `CLAUDE.md`
- Environment requirements → Update both docs
- New modules or features → Document in both files
- Architecture changes → Update the architecture section

Always verify docs are accurate before completing a task.
