# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0](https://github.com/liamlin/web-audit-cli/compare/v0.2.0...v0.3.0) (2026-03-03)


### Features

* add web server, desktop app, passive security scanner, and release prep ([ad06a74](https://github.com/liamlin/web-audit-cli/commit/ad06a74534b929f15cb469521a7c9c1cdc693de9))

## [0.2.0](https://github.com/liamlin/web-audit-cli/compare/v0.1.0...v0.2.0) (2026-01-26)


### Features

* enhance SEO auditor with Lighthouse and sitemap validation ([#2](https://github.com/liamlin/web-audit-cli/issues/2)) ([4527fdc](https://github.com/liamlin/web-audit-cli/commit/4527fdc05d20f2a4fc6aff7dacaa3baebd294cb3))

## [0.1.0] - 2025-01-26

### Added

- **SEO Audit Module**: Crawlee-based crawler detecting broken links, missing meta tags, H1 issues, and canonical problems
- **Performance Audit Module**: Lighthouse integration for Core Web Vitals (LCP, CLS, TBT) with desktop and mobile-4g modes
- **Security Audit Module**: OWASP ZAP via Docker for passive and active security scanning
- **Business Reports**: Transform technical findings into stakeholder-friendly language with impact assessments
- **Multi-language Support**: Reports in Traditional Chinese (zh-TW) and English (en)
- **Audit Methodology Section**: Reports include tool credibility and testing conditions for transparency
- **Parallel Execution**: Optional `--parallel` flag for concurrent module execution
- **Environment Detection**: Automatic checking of Node.js, Chrome, and Docker with graceful degradation
- **Slide-like HTML Reports**: Keyboard navigation support (arrows, space, page up/down)
- **Multiple Output Formats**: PDF, HTML, and JSON report generation

### Features

- Priority Actions: Top 5 issues highlighted for immediate attention
- Severity-based Scoring: CRITICAL (-20), HIGH (-10), MEDIUM (-5), LOW (-2)
- Health Score Weights: Security (40%), Performance (35%), SEO (25%)
- Verbose Mode: Detailed logging with `--verbose` flag
