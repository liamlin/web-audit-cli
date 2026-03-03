# Contributing to web-audit-cli

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/liamlin/web-audit-cli.git
   cd web-audit-cli
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the project**

   ```bash
   npm run build
   ```

4. **Run tests**
   ```bash
   npm run test
   ```

## Development Workflow

### Running in Development Mode

```bash
npm run dev          # Watch mode - recompiles on changes
npm run test:watch   # Watch mode for tests
```

### Runtime Modes

The project has three runtime modes, each with its own entry point:

| Mode        | Entry Point        | Start Command                  |
| ----------- | ------------------ | ------------------------------ |
| **CLI**     | `src/index.ts`     | `node dist/index.js --url ...` |
| **Web**     | `src/server.ts`    | `npm run start:web`            |
| **Desktop** | `electron/main.ts` | `npm run start:electron`       |

The web and desktop modes share the same Hono server and frontend (`src/web/`). The desktop app wraps the web server in an Electron BrowserWindow.

### Code Style

- **TypeScript**: Strict mode enabled with ES2022 target
- **Formatting**: Prettier (run `npm run format`)
- **Linting**: ESLint with TypeScript rules (run `npm run lint`)

The project uses husky pre-commit hooks to automatically run ESLint and Prettier on staged files.

### Running the Full Test Suite

```bash
npm run test           # Run all tests
npm run test:coverage  # Run with coverage report
```

## Submitting Changes

### Pull Request Process

1. Fork the repository and create a feature branch
2. Make your changes with clear, descriptive commits
3. Ensure all tests pass (`npm run test`)
4. Ensure code passes linting (`npm run lint`)
5. Update documentation if needed (README.md, CLAUDE.md)
6. Submit a pull request with a clear description

### Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Use `npm run commit` to launch the interactive Commitizen prompt, or write commits manually following this format:

```
<type>(<scope>): <subject>

[optional body]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system or dependency changes
- `ci`: CI configuration changes
- `chore`: Other changes (e.g., tooling)

**Examples:**

- `feat(seo): add canonical URL detection`
- `fix(performance): handle Chrome crash gracefully`
- `docs: update CLI options in README`

### Adding New Issue Types

When adding new audit checks:

1. Add the issue in the relevant auditor module using `this.createIssue()`
2. Add business context in `src/core/knowledge-base.ts`
3. Provide translations for both `en` and `zh-TW`

## Reporting Issues

- **Bugs**: Use the bug report template in GitHub Issues
- **Features**: Use the feature request template
- **Security**: See [SECURITY.md](SECURITY.md) for reporting vulnerabilities

## Questions?

Feel free to open an issue for questions or discussion.
