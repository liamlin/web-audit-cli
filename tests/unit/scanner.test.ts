/**
 * Unit tests for SecurityScanner.
 * Mocks global fetch to test each security check independently.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditSeverity, AuditCategory } from '../../src/types/index.js';

// Mock ssrf-guard before importing the scanner
vi.mock('../../src/utils/ssrf-guard.js', () => ({
  revalidateIp: vi.fn().mockResolvedValue(null),
}));

import { revalidateIp } from '../../src/utils/ssrf-guard.js';
import { SecurityScanner } from '../../src/modules/security/scanner.js';

// Helper to create a mock Response
function mockResponse(options: {
  headers?: Record<string, string>;
  body?: string;
  url?: string;
}): Response {
  const headers = new Headers(options.headers ?? {});
  const response = new Response(options.body ?? '<html></html>', {
    status: 200,
    headers,
  });
  // Override the url property (Response.url is read-only)
  Object.defineProperty(response, 'url', {
    value: options.url ?? 'https://example.com',
  });
  return response;
}

describe('SecurityScanner', () => {
  let scanner: SecurityScanner;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    scanner = new SecurityScanner();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('HTTP Security Headers', () => {
    it('should detect missing Strict-Transport-Security', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: {},
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const hsts = issues.find((i) => i.id === 'SEC-HEADERS-HSTS');
      expect(hsts).toBeDefined();
      expect(hsts!.severity).toBe(AuditSeverity.MEDIUM);
      expect(hsts!.category).toBe(AuditCategory.SECURITY);
    });

    it('should pass when HSTS max-age meets the 180-day threshold', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'strict-transport-security': 'max-age=31536000' },
        })
      );

      const { issues, passes } = await scanner.scan('https://example.com');
      expect(issues.find((i) => i.id === 'SEC-HEADERS-HSTS')).toBeUndefined();
      expect(passes.find((p) => p.id === 'SEC-HEADERS-HSTS')).toBeDefined();
    });

    it('should pass when HSTS max-age is exactly 15552000 (180 days)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'strict-transport-security': 'max-age=15552000' },
        })
      );

      const { issues, passes } = await scanner.scan('https://example.com');
      expect(issues.find((i) => i.id === 'SEC-HEADERS-HSTS')).toBeUndefined();
      expect(passes.find((p) => p.id === 'SEC-HEADERS-HSTS')).toBeDefined();
    });

    it('should issue when HSTS max-age=0 effectively disables HSTS', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'strict-transport-security': 'max-age=0' },
        })
      );

      const { issues, passes } = await scanner.scan('https://example.com');
      const hsts = issues.find((i) => i.id === 'SEC-HEADERS-HSTS');
      expect(hsts).toBeDefined();
      expect(hsts!.severity).toBe(AuditSeverity.MEDIUM);
      expect(hsts!.description).toContain('max-age is 0');
      expect(passes.find((p) => p.id === 'SEC-HEADERS-HSTS')).toBeUndefined();
    });

    it('should issue when HSTS max-age is too low (86400 = 1 day)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'strict-transport-security': 'max-age=86400' },
        })
      );

      const { issues, passes } = await scanner.scan('https://example.com');
      const hsts = issues.find((i) => i.id === 'SEC-HEADERS-HSTS');
      expect(hsts).toBeDefined();
      expect(hsts!.severity).toBe(AuditSeverity.MEDIUM);
      expect(hsts!.description).toContain('86400');
      expect(passes.find((p) => p.id === 'SEC-HEADERS-HSTS')).toBeUndefined();
    });

    it('should detect missing Content-Security-Policy', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: {},
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const csp = issues.find((i) => i.id === 'SEC-HEADERS-CSP');
      expect(csp).toBeDefined();
      expect(csp!.severity).toBe(AuditSeverity.MEDIUM);
    });

    it('should not flag when CSP header is present and strong', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': "default-src 'self'" },
        })
      );

      const { issues, passes } = await scanner.scan('https://example.com');
      expect(issues.find((i) => i.id === 'SEC-HEADERS-CSP')).toBeUndefined();
      expect(passes.find((p) => p.id === 'SEC-HEADERS-CSP')).toBeDefined();
    });

    it('should not emit CSP pass when CSP header is present but weak', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'" },
        })
      );

      const { issues, passes } = await scanner.scan('https://example.com');
      // No SEC-HEADERS-CSP issue (header IS present)
      expect(issues.find((i) => i.id === 'SEC-HEADERS-CSP')).toBeUndefined();
      // But no SEC-HEADERS-CSP pass either (CSP is weak)
      expect(passes.find((p) => p.id === 'SEC-HEADERS-CSP')).toBeUndefined();
      // Should have the weak CSP issue instead
      expect(issues.find((i) => i.id === 'SEC-CSP-WEAK')).toBeDefined();
    });

    it('should detect missing X-Frame-Options', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: {},
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const xfo = issues.find((i) => i.id === 'SEC-HEADERS-XFO');
      expect(xfo).toBeDefined();
      expect(xfo!.severity).toBe(AuditSeverity.MEDIUM);
    });

    it('should not flag X-Frame-Options when CSP has frame-ancestors', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': "frame-ancestors 'self'" },
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const xfo = issues.find((i) => i.id === 'SEC-HEADERS-XFO');
      expect(xfo).toBeUndefined();
    });

    it('should detect missing X-Content-Type-Options', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: {},
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const xcto = issues.find((i) => i.id === 'SEC-HEADERS-XCTO');
      expect(xcto).toBeDefined();
      expect(xcto!.severity).toBe(AuditSeverity.LOW);
    });

    it('should not flag when X-Content-Type-Options is nosniff', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'x-content-type-options': 'nosniff' },
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const xcto = issues.find((i) => i.id === 'SEC-HEADERS-XCTO');
      expect(xcto).toBeUndefined();
    });

    it('should detect missing Permissions-Policy', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: {},
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const pp = issues.find((i) => i.id === 'SEC-HEADERS-PP');
      expect(pp).toBeDefined();
      expect(pp!.severity).toBe(AuditSeverity.LOW);
    });

    it('should not flag when Permissions-Policy is present', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'permissions-policy': 'camera=(), microphone=()' },
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const pp = issues.find((i) => i.id === 'SEC-HEADERS-PP');
      expect(pp).toBeUndefined();
    });

    it('should detect missing Referrer-Policy', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: {},
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const rp = issues.find((i) => i.id === 'SEC-HEADERS-RP');
      expect(rp).toBeDefined();
      expect(rp!.severity).toBe(AuditSeverity.LOW);
    });

    it('should not flag when Referrer-Policy is present', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'referrer-policy': 'strict-origin-when-cross-origin' },
        })
      );

      const { issues, passes } = await scanner.scan('https://example.com');
      expect(issues.find((i) => i.id === 'SEC-HEADERS-RP')).toBeUndefined();
      expect(passes.find((p) => p.id === 'SEC-HEADERS-RP')).toBeDefined();
    });

    it('should detect overly permissive CORS (wildcard)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'access-control-allow-origin': '*' },
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const cors = issues.find((i) => i.id === 'SEC-HEADERS-CORS');
      expect(cors).toBeDefined();
      expect(cors!.severity).toBe(AuditSeverity.MEDIUM);
    });

    it('should pass when CORS is restricted to specific origin', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'access-control-allow-origin': 'https://trusted.com' },
        })
      );

      const { issues, passes } = await scanner.scan('https://example.com');
      expect(issues.find((i) => i.id === 'SEC-HEADERS-CORS')).toBeUndefined();
      expect(passes.find((p) => p.id === 'SEC-HEADERS-CORS')).toBeDefined();
    });

    it('should detect Server header version disclosure', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { server: 'Apache/2.4.51' },
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const server = issues.find((i) => i.id === 'SEC-INFO-SERVER');
      expect(server).toBeDefined();
      expect(server!.severity).toBe(AuditSeverity.LOW);
    });

    it('should not flag Server header without version info', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { server: 'nginx' },
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      expect(issues.find((i) => i.id === 'SEC-INFO-SERVER')).toBeUndefined();
    });

    it('should detect missing Cross-Origin-Opener-Policy', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: {},
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const coop = issues.find((i) => i.id === 'SEC-HEADERS-COOP');
      expect(coop).toBeDefined();
      expect(coop!.severity).toBe(AuditSeverity.INFO);
    });

    it('should pass when COOP is set', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'cross-origin-opener-policy': 'same-origin' },
        })
      );

      const { issues, passes } = await scanner.scan('https://example.com');
      expect(issues.find((i) => i.id === 'SEC-HEADERS-COOP')).toBeUndefined();
      expect(passes.find((p) => p.id === 'SEC-HEADERS-COOP')).toBeDefined();
    });

    it('should detect missing Cross-Origin-Embedder-Policy', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: {},
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const coep = issues.find((i) => i.id === 'SEC-HEADERS-COEP');
      expect(coep).toBeDefined();
      expect(coep!.severity).toBe(AuditSeverity.INFO);
    });

    it('should detect missing Cross-Origin-Resource-Policy', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: {},
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const corp = issues.find((i) => i.id === 'SEC-HEADERS-CORP');
      expect(corp).toBeDefined();
      expect(corp!.severity).toBe(AuditSeverity.INFO);
    });

    it('should pass when COEP and CORP are set', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: {
            'cross-origin-embedder-policy': 'require-corp',
            'cross-origin-resource-policy': 'same-origin',
          },
        })
      );

      const { passes } = await scanner.scan('https://example.com');
      expect(passes.find((p) => p.id === 'SEC-HEADERS-COEP')).toBeDefined();
      expect(passes.find((p) => p.id === 'SEC-HEADERS-CORP')).toBeDefined();
    });
  });

  describe('CSP Quality', () => {
    it('should detect unsafe-inline in CSP', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'" },
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const weakCsp = issues.find((i) => i.id === 'SEC-CSP-WEAK');
      expect(weakCsp).toBeDefined();
      expect(weakCsp!.severity).toBe(AuditSeverity.MEDIUM);
      expect(weakCsp!.description).toContain('unsafe-inline');
    });

    it('should detect unsafe-eval in CSP', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': "script-src 'unsafe-eval'" },
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const weakCsp = issues.find((i) => i.id === 'SEC-CSP-WEAK');
      expect(weakCsp).toBeDefined();
      expect(weakCsp!.description).toContain('unsafe-eval');
    });

    it('should detect wildcard in CSP', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': 'default-src *' },
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const weakCsp = issues.find((i) => i.id === 'SEC-CSP-WEAK');
      expect(weakCsp).toBeDefined();
    });

    it('should not flag a strong CSP and should emit both CSP passes', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': "default-src 'self'; script-src 'self'" },
        })
      );

      const { issues, passes } = await scanner.scan('https://example.com');
      expect(issues.find((i) => i.id === 'SEC-CSP-WEAK')).toBeUndefined();
      expect(passes.find((p) => p.id === 'SEC-CSP-WEAK')).toBeDefined();
      // SEC-HEADERS-CSP pass is only emitted when CSP quality check passes
      expect(passes.find((p) => p.id === 'SEC-HEADERS-CSP')).toBeDefined();
    });
  });

  describe('Cookie Security', () => {
    it('should detect cookie missing Secure flag on HTTPS', async () => {
      const resp = mockResponse({
        headers: { 'content-security-policy': "default-src 'self'" },
      });
      // Mock getSetCookie to return a cookie without Secure
      resp.headers.getSetCookie = () => ['session=abc123; Path=/; HttpOnly; SameSite=Lax'];

      globalThis.fetch = vi.fn().mockResolvedValue(resp);

      const { issues } = await scanner.scan('https://example.com');
      const secureCookie = issues.find((i) => i.id === 'SEC-COOKIES-SECURE');
      expect(secureCookie).toBeDefined();
      expect(secureCookie!.severity).toBe(AuditSeverity.MEDIUM);
    });

    it('should detect cookie missing HttpOnly flag', async () => {
      const resp = mockResponse({
        headers: { 'content-security-policy': "default-src 'self'" },
      });
      resp.headers.getSetCookie = () => ['session=abc123; Path=/; Secure; SameSite=Lax'];

      globalThis.fetch = vi.fn().mockResolvedValue(resp);

      const { issues } = await scanner.scan('https://example.com');
      const httpOnly = issues.find((i) => i.id === 'SEC-COOKIES-HTTPONLY');
      expect(httpOnly).toBeDefined();
      expect(httpOnly!.severity).toBe(AuditSeverity.MEDIUM);
    });

    it('should detect cookie missing SameSite attribute', async () => {
      const resp = mockResponse({
        headers: { 'content-security-policy': "default-src 'self'" },
      });
      resp.headers.getSetCookie = () => ['session=abc123; Path=/; Secure; HttpOnly'];

      globalThis.fetch = vi.fn().mockResolvedValue(resp);

      const { issues } = await scanner.scan('https://example.com');
      const sameSite = issues.find((i) => i.id === 'SEC-COOKIES-SAMESITE');
      expect(sameSite).toBeDefined();
      expect(sameSite!.severity).toBe(AuditSeverity.LOW);
    });

    it('should pass when cookies have all security attributes', async () => {
      const resp = mockResponse({
        headers: { 'content-security-policy': "default-src 'self'" },
      });
      resp.headers.getSetCookie = () => ['session=abc123; Path=/; Secure; HttpOnly; SameSite=Lax'];

      globalThis.fetch = vi.fn().mockResolvedValue(resp);

      const { issues, passes } = await scanner.scan('https://example.com');
      expect(issues.find((i) => i.id === 'SEC-COOKIES-SECURE')).toBeUndefined();
      expect(issues.find((i) => i.id === 'SEC-COOKIES-HTTPONLY')).toBeUndefined();
      expect(issues.find((i) => i.id === 'SEC-COOKIES-SAMESITE')).toBeUndefined();
      expect(passes.find((p) => p.id === 'SEC-COOKIES-SECURE')).toBeDefined();
      expect(passes.find((p) => p.id === 'SEC-COOKIES-HTTPONLY')).toBeDefined();
      expect(passes.find((p) => p.id === 'SEC-COOKIES-SAMESITE')).toBeDefined();
    });
  });

  describe('HTML Body Checks', () => {
    it('should detect missing SRI on external scripts', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': "default-src 'self'" },
          body: '<html><head><script src="https://cdn.example.org/lib.js"></script></head></html>',
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const sri = issues.find((i) => i.id === 'SEC-RESOURCES-SRI');
      expect(sri).toBeDefined();
      expect(sri!.severity).toBe(AuditSeverity.MEDIUM);
    });

    it('should not flag scripts with integrity attribute', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': "default-src 'self'" },
          body: '<html><head><script src="https://cdn.example.org/lib.js" integrity="sha384-abc123" crossorigin="anonymous"></script></head></html>',
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const sri = issues.find((i) => i.id === 'SEC-RESOURCES-SRI');
      expect(sri).toBeUndefined();
    });

    it('should not flag same-domain scripts for SRI', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': "default-src 'self'" },
          body: '<html><head><script src="/js/app.js"></script></head></html>',
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const sri = issues.find((i) => i.id === 'SEC-RESOURCES-SRI');
      expect(sri).toBeUndefined();
    });

    it('should detect cross-domain JavaScript inclusion', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': "default-src 'self'" },
          body: '<html><head><script src="https://evil.com/track.js"></script></head></html>',
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const xd = issues.find((i) => i.id === 'SEC-RESOURCES-XDOMAIN');
      expect(xd).toBeDefined();
      expect(xd!.severity).toBe(AuditSeverity.LOW);
    });

    it('should detect vulnerable jQuery version', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': "default-src 'self'" },
          body: '<html><head><script src="https://code.jquery.com/jquery-2.2.4.min.js"></script></head></html>',
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const vuln = issues.find((i) => i.id === 'SEC-RESOURCES-VULNLIB');
      expect(vuln).toBeDefined();
      expect(vuln!.severity).toBe(AuditSeverity.MEDIUM);
      expect(vuln!.title).toContain('jQuery');
      expect(vuln!.title).toContain('2.2.4');
    });

    it('should not flag current jQuery version', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': "default-src 'self'" },
          body: '<html><head><script src="https://code.jquery.com/jquery-3.7.1.min.js" integrity="sha256-abc"></script></head></html>',
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const vuln = issues.find((i) => i.id === 'SEC-RESOURCES-VULNLIB');
      expect(vuln).toBeUndefined();
    });

    it('should detect missing SRI on external stylesheets', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': "default-src 'self'" },
          body: '<html><head><link rel="stylesheet" href="https://cdn.example.org/style.css"></head></html>',
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const sri = issues.find((i) => i.id === 'SEC-RESOURCES-SRI');
      expect(sri).toBeDefined();
    });
  });

  describe('Timestamp Disclosure', () => {
    it('should detect Unix timestamps in response body', async () => {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': "default-src 'self'" },
          body: `<html><body>Last updated: ${timestamp}</body></html>`,
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const ts = issues.find((i) => i.id === 'SEC-INFO-TIMESTAMP');
      expect(ts).toBeDefined();
      expect(ts!.severity).toBe(AuditSeverity.INFO);
    });

    it('should not flag non-timestamp 10-digit numbers', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: { 'content-security-policy': "default-src 'self'" },
          body: '<html><body>Phone: 0912345678</body></html>',
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      const ts = issues.find((i) => i.id === 'SEC-INFO-TIMESTAMP');
      // 0912345678 doesn't match our regex (must start with 1)
      expect(ts).toBeUndefined();
    });
  });

  describe('Full Scan', () => {
    it('should return zero issues for a well-secured site', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: {
            'strict-transport-security': 'max-age=31536000; includeSubDomains',
            'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
            'x-content-type-options': 'nosniff',
            'x-frame-options': 'DENY',
            'permissions-policy': 'camera=(), microphone=()',
            'referrer-policy': 'strict-origin-when-cross-origin',
            'cross-origin-opener-policy': 'same-origin',
            'cross-origin-embedder-policy': 'require-corp',
            'cross-origin-resource-policy': 'same-origin',
          },
          body: '<html><head></head><body>Secure site</body></html>',
        })
      );

      const { issues, passes } = await scanner.scan('https://example.com');
      expect(issues).toHaveLength(0);
      expect(passes.length).toBeGreaterThan(0);
    });

    it('should find multiple issues on an insecure site', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: {},
          body: `<html><head>
          <script src="https://cdn.example.org/jquery-1.12.4.js"></script>
          <link rel="stylesheet" href="https://cdn.example.org/bootstrap.css">
        </head><body></body></html>`,
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      // Should find many issues: HSTS, CSP, XFO, XCTO, PP, RP, COOP, COEP, CORP,
      // SRI, cross-domain scripts, vulnerable jQuery
      expect(issues.length).toBeGreaterThanOrEqual(6);

      // All issues should have SECURITY category
      issues.forEach((issue) => {
        expect(issue.category).toBe(AuditCategory.SECURITY);
      });
    });

    it('should populate passes for each passing check', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: {
            'strict-transport-security': 'max-age=31536000',
            'content-security-policy': "default-src 'self'",
            'x-content-type-options': 'nosniff',
          },
          body: '<html><head></head><body></body></html>',
        })
      );

      const { passes } = await scanner.scan('https://example.com');
      // Should have passes for HSTS, CSP, XCTO, and CSP quality
      expect(passes.find((p) => p.id === 'SEC-HEADERS-HSTS')).toBeDefined();
      expect(passes.find((p) => p.id === 'SEC-HEADERS-CSP')).toBeDefined();
      expect(passes.find((p) => p.id === 'SEC-HEADERS-XCTO')).toBeDefined();
      expect(passes.find((p) => p.id === 'SEC-CSP-WEAK')).toBeDefined();

      // All passes should have SECURITY category and a source
      passes.forEach((pass) => {
        expect(pass.category).toBe(AuditCategory.SECURITY);
        expect(pass.source).toBeTruthy();
      });
    });

    it('should handle fetch errors gracefully', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(scanner.scan('https://unreachable.com')).rejects.toThrow('Network error');
    });
  });

  describe('skipSsrfCheck option', () => {
    it('should not call revalidateIp when skipSsrfCheck is true', async () => {
      const skipScanner = new SecurityScanner({ skipSsrfCheck: true });
      vi.mocked(revalidateIp).mockClear();

      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: {
            'strict-transport-security': 'max-age=31536000; includeSubDomains',
            'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
            'x-content-type-options': 'nosniff',
            'x-frame-options': 'DENY',
            'permissions-policy': 'camera=(), microphone=()',
            'referrer-policy': 'strict-origin-when-cross-origin',
            'cross-origin-opener-policy': 'same-origin',
            'cross-origin-embedder-policy': 'require-corp',
            'cross-origin-resource-policy': 'same-origin',
          },
          body: '<html><head></head><body>Secure site</body></html>',
        })
      );

      const { issues } = await skipScanner.scan('https://example.com');
      expect(revalidateIp).not.toHaveBeenCalled();
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(issues).toHaveLength(0);
    });
  });

  describe('SSRF Revalidation', () => {
    it('should throw when revalidateIp blocks the request', async () => {
      vi.mocked(revalidateIp).mockResolvedValueOnce(
        'URL resolves to a private IP address (127.0.0.1). Scanning internal infrastructure is not allowed.'
      );
      globalThis.fetch = vi.fn();

      await expect(scanner.scan('https://evil-rebind.com')).rejects.toThrow(
        'Scan blocked: target resolves to a private/internal IP address'
      );
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('should proceed with scan when revalidateIp returns null', async () => {
      vi.mocked(revalidateIp).mockResolvedValueOnce(null);
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse({
          headers: {
            'strict-transport-security': 'max-age=31536000; includeSubDomains',
            'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
            'x-content-type-options': 'nosniff',
            'x-frame-options': 'DENY',
            'permissions-policy': 'camera=(), microphone=()',
            'referrer-policy': 'strict-origin-when-cross-origin',
            'cross-origin-opener-policy': 'same-origin',
            'cross-origin-embedder-policy': 'require-corp',
            'cross-origin-resource-policy': 'same-origin',
          },
          body: '<html><head></head><body>Secure site</body></html>',
        })
      );

      const { issues } = await scanner.scan('https://example.com');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(issues).toHaveLength(0);
    });
  });
});
