# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`web-audit-cli` is a Node.js CLI tool, web service, and Electron desktop app that performs SEO, performance, and security audits on websites. It combines three audit engines and transforms technical findings into business-focused reports with a "Current State - Threat - Optimization - Expected Outcome" matrix. Available as a CLI tool, browser-based web interface, or desktop app (.dmg/.exe for non-technical users).

## Tech Stack

- **Runtime**: Node.js v20+ LTS (enforced at runtime)
- **Language**: TypeScript v5.x (strict mode, ES2022 target, NodeNext module)
- **CLI**: Commander.js + Inquirer.js + ora + chalk
- **SEO Engine**: Lighthouse SEO audits + Crawlee (broken links) + sitemap.xml validator
- **Performance Engine**: Lighthouse v12 + chrome-launcher (requires Chrome/Chromium)
- **Security Engine**: Passive Node.js scanner (HTTP headers, cookies, HTML) based on Mozilla Observatory and OWASP Secure Headers Project standards
- **Desktop**: Electron + electron-builder (wraps Hono server in native window)
- **Web Server**: Hono + @hono/node-server (SSE streaming)
- **Reporting**: Handlebars + Puppeteer (PDF generation)
- **Validation**: Zod for runtime type validation
- **Testing**: Vitest

## Environment Requirements

The CLI checks for required dependencies at startup and provides helpful feedback:

| Dependency      | Required For      | Behavior if Missing                       |
| --------------- | ----------------- | ----------------------------------------- |
| Node.js 20+     | All modules       | Exits with error and install instructions |
| Chrome/Chromium | SEO + Performance | Module skipped with warning               |

In **verbose mode** (`--verbose`), the CLI displays an environment summary showing the status of all dependencies before running the audit.

## Build & Development Commands

```bash
npm run build           # Compile TypeScript (src → dist)
npm run build:electron  # Compile Electron code (electron → dist-electron)
npm run dev             # Development mode with watch
npm run test            # Run tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage
npm run lint            # Lint code
npm run start:web       # Start web server (after build)
npm run start:electron  # Build + launch Electron desktop app
npm run pack:mac        # Package as macOS .dmg
npm run pack:win        # Package as Windows .exe installer
npm run pack:linux      # Package as Linux AppImage
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
│ + Crawlee)  │ (Lighthouse)│ (Passive)   │
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

### Web Mode Data Flow

```
Browser → Hono Server
    ↓
POST /api/audit → AuditService (queue + job store)
    ↓
Orchestrator (with ProgressCallback → SSE stream)
    ↓
┌─────────────┬─────────────┬──────────────┐
│ SeoAuditor  │ Performance │ Security     │
│ (Lighthouse │ Auditor     │ Auditor      │
│ + Crawlee)  │ (Lighthouse)│ (Passive)    │
└──────┬──────┴──────┬──────┴──────┬───────┘
       └─────────────┼─────────────┘
                     ↓
              MatrixEngine → BusinessReport
                     ↓
              ReportGenerator → HTML + PDF (in-memory)
                     ↓
              GET /api/audit/:id/report|pdf|result
```

### Key Modules

- `src/core/base-auditor.ts` - Abstract base class all auditors extend
- `src/core/orchestrator.ts` - Runs auditors sequentially, single module failure doesn't stop others
- `src/core/matrix-engine.ts` - Transforms technical issues to business language, generates methodology
- `src/core/knowledge-base.ts` - Maps issue IDs to localized business impact descriptions (zh-TW/en)
- `src/utils/i18n.ts` - Translation system for report strings
- `src/modules/seo/` - Lighthouse SEO audits (crawlability, meta, canonicals, robots.txt), sitemap.xml validation, Crawlee broken link detection
- `src/modules/performance/` - Lighthouse integration for Core Web Vitals (LCP, CLS, TBT), supports desktop/mobile modes
- `src/modules/security/` - Passive security scanner (headers, cookies, HTML) based on Mozilla Observatory and OWASP standards
- `src/modules/security/scanner.ts` - SecurityScanner class: checks HTTP headers, CSP quality, cookie attributes, SRI, cross-domain scripts, vulnerable libraries
- `electron/main.ts` - Electron main process: starts Hono server, creates BrowserWindow
- `electron/preload.ts` - Context bridge (isElectron flag, version)
- `electron/menu.ts` - Native app menu (File, Edit, View, Help)
- `src/modules/reporter/` - Handlebars templates + Puppeteer PDF generation
- `src/server.ts` - Web server entry point
- `src/web/app.ts` - Hono app with secure headers and static file serving
- `src/web/routes/audit.ts` - API endpoints (audit CRUD, SSE progress, report download)
- `src/web/services/audit-service.ts` - Job queue, progress emitter, report generation
- `src/web/public/index.html` - Single-page frontend (Tailwind CDN, native EventSource)
- `src/utils/ssrf-guard.ts` - Blocks private/internal IP scanning in web mode

### Core Types

All modules return `ModuleResult<AuditResult>` for consistent error handling:

- `AuditIssue` - Single finding with id, title, severity, category, suggestion
- `AuditPass` - A check that passed: id, title, category, source
- `AuditResult` - Module result with issues array, passes array, status
- `BusinessIssue` - Extended with businessImpact, fixDifficulty, estimatedEffort, expectedOutcome
- `BusinessReport` - Final report with executiveSummary, issues, passes, methodology
- `MethodologyInfo` - Tools used, tests performed, and test conditions (desktop/mobile)
- `LocalizedString` - `{ en: string; 'zh-TW': string }` for bilingual content

### Severity Levels

`CRITICAL > HIGH > MEDIUM > LOW > INFO`

Issues are sorted by severity. There are no numerical scores — the tool reports what passes and what fails according to the underlying standards.

## Critical Implementation Patterns

### Resource Cleanup

Chrome (Lighthouse) processes MUST be killed in `finally` blocks:

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

### Security Module

The security module uses a self-contained passive scanner (`SecurityScanner` in `src/modules/security/scanner.ts`). It makes a single HTTP request and analyzes:

- HTTP security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Permissions-Policy, Referrer-Policy, CORS, COOP/COEP/CORP)
- CSP quality (detects unsafe-inline, unsafe-eval, wildcards)
- Cookie security attributes (Secure, HttpOnly, SameSite, domain scoping)
- HTML body (SRI on external resources, cross-domain scripts, vulnerable JS libraries)
- Timestamp disclosure

All checks produce `SEC-*` issue IDs that map to the knowledge base. Each check also records a pass when the site meets the standard.

### Desktop Mode (Electron)

When `ELECTRON_MODE=true` is set (automatically by `electron/main.ts`):

- SSRF guard is disabled (user scans their own targets)
- Security scanner skips SSRF checks (user scans their own targets)

The desktop app starts a Hono server on a random localhost port, then loads it in a BrowserWindow. The existing frontend, SSE streaming, and audit service work unchanged.

### Chrome Check

Performance module must gracefully degrade if Chrome is not installed:

```typescript
const chromeCheck = await checkChromeInstalled();
if (!chromeCheck.installed) {
  return { success: false, status: 'skipped', error: { code: 'CHROME_NOT_INSTALLED', ... } };
}
```

### Cross-Platform Paths

Always use `path.resolve()` for temp directories and output paths.

## CLI Options

```
--url <url>            Target URL (required)
--output <dir>         Output directory (default: ./reports)
--modules <list>       Modules to run: seo,performance,security
--format <list>        Output formats: pdf,json,html (default: html)
--crawl-depth <n>      SEO crawl depth (default: 50, max: 100)
--timeout <seconds>    Total timeout (default: 300, max: 3600)
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

- Unit tests: Zod schema validation, knowledge-base mapping, SSRF guard, security scanner, audit service
- Integration tests: Mock HTTP responses, mock Lighthouse LHR JSON, mock SecurityScanner, Hono test client for API routes
- Avoid real Chrome in CI - use pre-recorded fixtures
- Web API tests use Hono's `app.request()` with mocked auditor/reporter modules

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

## Frontend-Backend Contract

**IMPORTANT**: The frontend (`src/web/public/index.html`) and backend API are tightly coupled. When changing one, check the other.

### Health Endpoint Contract

`GET /api/health` returns:

```typescript
{
  status: 'ok';
  securityAvailable: boolean; // always true (passive scanner is always available)
  securityMethod: 'passive';
  timestamp: string; // ISO 8601
}
```

The frontend calls this on page load to show/hide the Security module checkbox. If `securityAvailable` is false, the Security checkbox is hidden.

### Audit Request Contract

`POST /api/audit` body (validated with Zod in `src/web/routes/audit.ts`):

```typescript
{
  url: string;                                    // required, http/https only
  modules?: ('seo' | 'performance' | 'security')[]; // default: all three
  language?: 'en' | 'zh-TW';                     // default: 'en'
  performanceMode?: 'desktop' | 'mobile-4g';     // default: 'desktop'
  crawlDepth?: number;                           // default: 30, max: 50
  parallel?: boolean;                             // default: false
}
```

### SSE Progress Event Contract

`GET /api/audit/:id/progress` sends SSE events:

```typescript
// event: 'progress'
{
  module: string;   // 'seo' | 'performance' | 'security' | 'system'
  status: 'running' | 'complete' | 'partial' | 'skipped' | 'failed';
  message: string;
  timestamp: number;
}

// event: 'done' — signals stream end
{ status: 'complete' | 'failed'; error?: string; }
```

The frontend maps `module` values to UI elements by ID (`dot-seo`, `status-seo`, etc.).

### What Must Change Together

| If you change...                        | Also update...                                                    |
| --------------------------------------- | ----------------------------------------------------------------- |
| Module names (seo/performance/security) | Frontend checkbox values, progress element IDs, Zod schema        |
| Health response shape                   | Frontend `fetch('/api/health')` handler                           |
| Progress event fields                   | Frontend `updateModuleProgress()` function                        |
| Status values (running/complete/etc.)   | Frontend switch statement in `updateModuleProgress()`             |
| Audit request fields                    | Frontend form submission in `start-btn` click handler, Zod schema |
| Result response shape (BusinessReport)  | Frontend `showResults()` function                                 |
| New API endpoints                       | Frontend fetch calls                                              |

## Documentation Rules

**IMPORTANT**: Documentation must always be kept in sync with implementations.

When making code changes that affect:

- CLI options or behavior → Update `README.md` and `CLAUDE.md`
- Environment requirements → Update both docs
- New modules or features → Document in both files
- Architecture changes → Update the architecture section
- API contract changes → Update the Frontend-Backend Contract section above
- Frontend behavior → Check if backend contract needs updating

Always verify docs are accurate before completing a task.
