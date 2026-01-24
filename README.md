# web-audit-cli

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

A comprehensive CLI tool for website SEO, performance, and security auditing. Combines three audit engines and transforms technical findings into business-focused reports.

## Features

- **SEO Audit**: Crawls websites to find broken links, missing meta tags, H1 issues, and more
- **Performance Audit**: Uses Lighthouse to analyze Core Web Vitals (LCP, CLS, TBT) with desktop or mobile simulation
- **Security Audit**: Runs OWASP ZAP via Docker for passive/active security scanning
- **Business Reports**: Transforms technical issues into stakeholder-friendly language with impact assessments
- **Multi-language Support**: Reports available in Traditional Chinese (繁體中文) and English
- **Audit Methodology**: Reports include tool credibility and testing methodology for transparency

## Requirements

- **Node.js v20+** (required - enforced at runtime)
- **Chrome/Chromium** (optional - for performance auditing via Lighthouse)
- **Docker** (optional - for security scanning via OWASP ZAP)

### Environment Detection

The CLI automatically checks for dependencies at startup:

- If Node.js version is below 20.0, the CLI exits with an error and installation instructions
- If Chrome is not found, the performance module is skipped with a warning
- If Docker is not installed or not running, the security module is skipped with a warning

Use `--verbose` to see a detailed environment summary before the audit runs.

## Installation

```bash
npm install
npm run build
npm link  # Makes 'web-audit' command available globally
```

## Usage

```bash
# Basic usage - audit all modules
web-audit --url https://example.com

# SEO and performance only
web-audit --url https://example.com --modules seo,performance

# Output in multiple formats
web-audit --url https://example.com --format pdf,json,html

# English report with mobile performance testing
web-audit --url https://example.com --language en --performance-mode mobile-4g

# Enable verbose logging
web-audit --url https://example.com --verbose
```

## CLI Options

| Option                     | Description                               | Default     |
| -------------------------- | ----------------------------------------- | ----------- |
| `-u, --url <url>`          | Target URL to audit (required)            | -           |
| `-o, --output <dir>`       | Output directory for reports              | `./reports` |
| `-m, --modules <list>`     | Modules to run (seo,performance,security) | All modules |
| `-f, --format <list>`      | Output formats (pdf,json,html)            | `html`      |
| `-d, --crawl-depth <n>`    | Max pages to crawl for SEO (1-100)        | `50`        |
| `-t, --timeout <seconds>`  | Total timeout (60-3600)                   | `300`       |
| `-s, --security-scan-mode` | Security scan mode (passive/active)       | `passive`   |
| `-p, --performance-mode`   | Performance test mode (desktop/mobile-4g) | `desktop`   |
| `-l, --language <lang>`    | Report language (zh-TW/en)                | `en`        |
| `-v, --verbose`            | Enable detailed logging                   | `false`     |
| `--parallel`               | Run audit modules in parallel             | `false`     |

## Output

Report filenames include the domain for easy identification (e.g., `audit-example-com-1705435200000.html`).

The tool generates reports with:

- **Category Scores**: Individual scores for SEO, Performance, and Security
- **Executive Summary**: Business-friendly overview of findings
- **Audit Methodology**: Tools used, their credibility, and test conditions (desktop/mobile)
- **Priority Actions**: Top 5 issues to address
- **Detailed Analysis**: Each issue with business impact, fix difficulty, and expected outcome

The HTML report features a slide-like presentation with keyboard navigation (arrows, space, page up/down).

### Performance Modes

| Mode        | Description                            | Use Case                                   |
| ----------- | -------------------------------------- | ------------------------------------------ |
| `desktop`   | No throttling, real device performance | Matches actual desktop browsing experience |
| `mobile-4g` | Simulated 4G network + CPU throttling  | Tests mobile user experience               |

The test conditions are clearly labeled in reports to ensure transparency when comparing results.

## Development

```bash
npm run dev          # Watch mode
npm run build        # Build
npm run test         # Run tests
npm run test:watch   # Watch tests
npm run test:coverage # Coverage report
```

## Architecture

```
CLI Entry → Orchestrator → [SEO|Performance|Security] Auditors
                ↓
         AuditResult[]
                ↓
         MatrixEngine (adds business context)
                ↓
         BusinessReport
                ↓
         ReportGenerator (PDF/HTML/JSON)
```

## Versioning & Releases

This project uses [Semantic Versioning](https://semver.org/) and [release-please](https://github.com/googleapis/release-please) for automated releases.

### How Releases Work

1. Make changes using [Conventional Commits](https://www.conventionalcommits.org/):
   - `fix: description` → patch release (0.1.0 → 0.1.1)
   - `feat: description` → minor release (0.1.0 → 0.2.0)
   - `feat!: description` or `BREAKING CHANGE:` → major release (0.1.0 → 1.0.0)

2. Push to `main` - release-please automatically creates/updates a Release PR

3. Merge the Release PR to trigger:
   - Version bump in `package.json`
   - `CHANGELOG.md` update
   - Git tag and GitHub Release

### Pre-1.0 Status

While the version is below 1.0.0, the API and CLI interface may change. We follow `bump-minor-pre-major` convention:

- Breaking changes bump minor version (0.1.0 → 0.2.0)
- New features and fixes bump patch version (0.1.0 → 0.1.1)

## License

MIT
