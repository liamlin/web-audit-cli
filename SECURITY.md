# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

1. **Do NOT** create a public GitHub issue for security vulnerabilities
2. Email the details to the project maintainer (see package.json for contact)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment**: Within 48 hours of your report
- **Initial Assessment**: Within 7 days
- **Resolution Timeline**: Depends on severity
  - Critical: As soon as possible
  - High: Within 30 days
  - Medium/Low: Within 90 days

### Responsible Disclosure

We kindly ask that you:

- Allow reasonable time for us to fix the issue before public disclosure
- Avoid accessing or modifying data that doesn't belong to you
- Act in good faith to avoid privacy violations and service disruption

## Security Considerations

This tool runs external processes (Chrome/Lighthouse, Docker/ZAP) and accesses websites. When using web-audit-cli:

- Only audit websites you own or have permission to test
- Be cautious with `--security-scan-mode active` as it performs intrusive testing
- Review generated reports before sharing, as they may contain sensitive information about the target site
