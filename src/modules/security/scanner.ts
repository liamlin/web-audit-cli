/**
 * Security Scanner - Pure Node.js passive security checks.
 *
 * Checks HTTP security headers, cookie attributes, and HTML-level issues
 * against Mozilla Observatory and OWASP Secure Headers Project standards.
 *
 * Produces AuditIssue[] with SEC-* IDs that map to the knowledge base.
 */

import * as cheerio from 'cheerio';
import {
  AuditCategory,
  AuditSeverity,
  type AuditIssue,
  type AuditPass,
} from '../../types/index.js';
import { logDebug } from '../../utils/logger.js';
import { revalidateIp } from '../../utils/ssrf-guard.js';

/**
 * Known vulnerable JavaScript libraries and their version patterns.
 * Each entry maps a library name to a regex for extracting versions
 * from CDN URLs, plus a check function for vulnerability.
 */
interface VulnerableLib {
  /** Regex to match library URL and capture version */
  pattern: RegExp;
  /** Library display name */
  name: string;
  /** Returns true if the captured version is known-vulnerable */
  isVulnerable: (version: string) => boolean;
}

const VULNERABLE_LIBS: VulnerableLib[] = [
  {
    name: 'jQuery',
    pattern: /jquery[.-](\d+\.\d+\.\d+)/i,
    isVulnerable: (v) => {
      const [major, minor] = v.split('.').map(Number);
      // jQuery < 3.5.0 has known XSS vulnerabilities
      return (
        major !== undefined && minor !== undefined && (major < 3 || (major === 3 && minor < 5))
      );
    },
  },
  {
    name: 'Angular',
    pattern: /angular[.-](\d+\.\d+\.\d+)/i,
    isVulnerable: (v) => {
      const [major] = v.split('.').map(Number);
      // AngularJS 1.x is end-of-life
      return major !== undefined && major <= 1;
    },
  },
  {
    name: 'Bootstrap',
    pattern: /bootstrap[.-](\d+\.\d+\.\d+)/i,
    isVulnerable: (v) => {
      const [major, minor] = v.split('.').map(Number);
      // Bootstrap < 3.4.0 has XSS vulnerabilities
      return (
        major !== undefined && minor !== undefined && (major < 3 || (major === 3 && minor < 4))
      );
    },
  },
  {
    name: 'Lodash',
    pattern: /lodash[.-](\d+\.\d+\.\d+)/i,
    isVulnerable: (v) => {
      const [major, minor, patch] = v.split('.').map(Number);
      // Lodash < 4.17.21 has prototype pollution
      return (
        major !== undefined &&
        minor !== undefined &&
        patch !== undefined &&
        (major < 4 || (major === 4 && (minor < 17 || (minor === 17 && patch < 21))))
      );
    },
  },
];

/**
 * Unix timestamp regex: 10-digit numbers (seconds since epoch).
 * Matches timestamps from 2001 to 2033 range.
 */
const UNIX_TIMESTAMP_REGEX = /\b1[0-9]{9}\b/;

/**
 * CSP directives considered weak when they contain these values.
 */
const WEAK_CSP_VALUES = ["'unsafe-inline'", "'unsafe-eval'", '*'];

/**
 * Result from a security scan: issues found and checks that passed.
 */
export interface ScanResult {
  issues: AuditIssue[];
  passes: AuditPass[];
}

export class SecurityScanner {
  private skipSsrfCheck: boolean;

  constructor(options?: { skipSsrfCheck?: boolean }) {
    this.skipSsrfCheck = options?.skipSsrfCheck ?? false;
  }

  /**
   * Perform passive security scan on the given URL.
   * Makes a single HTTP request and analyzes headers, cookies, and HTML body.
   */
  async scan(url: string): Promise<ScanResult> {
    logDebug(`Security scanner: scanning ${url}`);
    const issues: AuditIssue[] = [];
    const passes: AuditPass[] = [];

    // Re-validate DNS right before the request to close the TOCTOU gap
    // Skipped in desktop/Electron mode where the user scans their own targets
    if (!this.skipSsrfCheck) {
      const parsedUrlForCheck = new URL(url);
      const revalidation = await revalidateIp(parsedUrlForCheck.hostname);
      if (revalidation) {
        throw new Error(
          `Scan blocked: target resolves to a private/internal IP address (${revalidation})`
        );
      }
    }

    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'User-Agent': 'WebAuditCLI/1.0 (Security Scanner)',
      },
    });

    // Validate final URL after redirects to prevent SSRF via open redirects
    const finalUrl = response.url;
    if (finalUrl !== url && !this.skipSsrfCheck) {
      const finalHostname = new URL(finalUrl).hostname;
      const redirectCheck = await revalidateIp(finalHostname);
      if (redirectCheck) {
        throw new Error(
          `Scan blocked: redirect target resolves to a private/internal IP address (${url} → ${finalUrl})`
        );
      }
    }

    const headers = response.headers;
    const body = await response.text();
    const parsedUrl = new URL(finalUrl);

    // 1. HTTP Security Header checks
    const headerResults = this.checkSecurityHeaders(headers, finalUrl);
    issues.push(...headerResults.issues);
    passes.push(...headerResults.passes);

    // 2. CSP quality check (only if CSP header exists)
    const cspValue = headers.get('content-security-policy');
    if (cspValue) {
      const cspResults = this.checkCspQuality(cspValue, finalUrl);
      issues.push(...cspResults.issues);
      passes.push(...cspResults.passes);
    }

    // 3. Cookie checks
    const cookieResults = this.checkCookies(headers, parsedUrl, finalUrl);
    issues.push(...cookieResults.issues);
    passes.push(...cookieResults.passes);

    // 4. HTML body checks
    issues.push(...this.checkHtmlBody(body, parsedUrl, finalUrl));

    // 5. Timestamp disclosure (headers + body)
    issues.push(...this.checkTimestampDisclosure(headers, body, finalUrl));

    logDebug(`Security scanner: found ${issues.length} issues, ${passes.length} passes`);
    return { issues, passes };
  }

  /**
   * Check for missing HTTP security headers.
   */
  private checkSecurityHeaders(
    headers: Headers,
    url: string
  ): { issues: AuditIssue[]; passes: AuditPass[] } {
    const issues: AuditIssue[] = [];
    const passes: AuditPass[] = [];

    // SEC-HEADERS-HSTS: Strict-Transport-Security
    // Mozilla Observatory requires max-age >= 15552000 (180 days)
    const hstsValue = headers.get('strict-transport-security');
    if (!hstsValue) {
      issues.push(
        this.createIssue({
          id: 'SEC-HEADERS-HSTS',
          title: 'Strict-Transport-Security Header Not Set',
          description:
            'The HTTP Strict-Transport-Security (HSTS) header is not set. This allows SSL stripping attacks where an attacker downgrades HTTPS to HTTP.',
          severity: AuditSeverity.MEDIUM,
          suggestion:
            'Add the Strict-Transport-Security header with a long max-age: Strict-Transport-Security: max-age=31536000; includeSubDomains',
          url,
        })
      );
    } else {
      const maxAgeMatch = hstsValue.match(/max-age\s*=\s*(\d+)/i);
      const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1]!, 10) : 0;
      if (maxAge >= 15_552_000) {
        passes.push(this.createPass('SEC-HEADERS-HSTS', 'HSTS header correctly configured'));
      } else {
        issues.push(
          this.createIssue({
            id: 'SEC-HEADERS-HSTS',
            title: 'Strict-Transport-Security max-age Too Low',
            description: `The HSTS max-age is ${maxAge} seconds, which is below the recommended minimum of 15552000 (180 days). A short max-age provides insufficient protection against SSL stripping attacks.`,
            severity: AuditSeverity.MEDIUM,
            suggestion:
              'Increase the HSTS max-age to at least 15552000 (180 days): Strict-Transport-Security: max-age=31536000; includeSubDomains',
            url,
          })
        );
      }
    }

    // SEC-HEADERS-CSP: Content-Security-Policy
    // Pass is deferred to the CSP quality check — only recorded when CSP has no weak directives.
    if (!headers.get('content-security-policy')) {
      issues.push(
        this.createIssue({
          id: 'SEC-HEADERS-CSP',
          title: 'Content Security Policy (CSP) Header Not Set',
          description:
            'The Content-Security-Policy header is missing. CSP helps prevent XSS, clickjacking, and other code injection attacks.',
          severity: AuditSeverity.MEDIUM,
          suggestion:
            "Set a Content-Security-Policy header. Start with a report-only policy: Content-Security-Policy-Report-Only: default-src 'self'",
          url,
        })
      );
    }

    // SEC-HEADERS-XFO: X-Frame-Options
    if (!headers.get('x-frame-options') && !this.cspHasFrameAncestors(headers)) {
      issues.push(
        this.createIssue({
          id: 'SEC-HEADERS-XFO',
          title: 'Missing Anti-clickjacking Header',
          description:
            'Neither X-Frame-Options nor CSP frame-ancestors is set. The site may be vulnerable to clickjacking attacks.',
          severity: AuditSeverity.MEDIUM,
          suggestion: 'Add X-Frame-Options: DENY or use CSP frame-ancestors directive',
          url,
        })
      );
    } else {
      passes.push(this.createPass('SEC-HEADERS-XFO', 'Anti-clickjacking protection configured'));
    }

    // SEC-HEADERS-XCTO: X-Content-Type-Options
    if (headers.get('x-content-type-options')?.toLowerCase() !== 'nosniff') {
      issues.push(
        this.createIssue({
          id: 'SEC-HEADERS-XCTO',
          title: 'X-Content-Type-Options Header Missing',
          description:
            'The X-Content-Type-Options header is not set to nosniff. Browsers may MIME-sniff responses, enabling XSS via uploaded files.',
          severity: AuditSeverity.LOW,
          suggestion: 'Add the header: X-Content-Type-Options: nosniff',
          url,
        })
      );
    } else {
      passes.push(
        this.createPass('SEC-HEADERS-XCTO', 'X-Content-Type-Options correctly set to nosniff')
      );
    }

    // SEC-HEADERS-PP: Permissions-Policy
    if (!headers.get('permissions-policy') && !headers.get('feature-policy')) {
      issues.push(
        this.createIssue({
          id: 'SEC-HEADERS-PP',
          title: 'Permissions Policy Header Not Set',
          description:
            'The Permissions-Policy header is not set. Third-party scripts could access sensitive APIs like camera, microphone, and geolocation.',
          severity: AuditSeverity.LOW,
          suggestion:
            'Add a Permissions-Policy header restricting access to sensitive browser features: Permissions-Policy: camera=(), microphone=(), geolocation=()',
          url,
        })
      );
    } else {
      passes.push(this.createPass('SEC-HEADERS-PP', 'Permissions Policy header set'));
    }

    // SEC-HEADERS-RP: Referrer-Policy
    if (!headers.get('referrer-policy')) {
      issues.push(
        this.createIssue({
          id: 'SEC-HEADERS-RP',
          title: 'Referrer-Policy Header Not Set',
          description:
            'The Referrer-Policy header is not set. The browser may send the full URL (including query parameters) as a referrer to third-party sites, potentially leaking sensitive data.',
          severity: AuditSeverity.LOW,
          suggestion:
            'Add a Referrer-Policy header: Referrer-Policy: strict-origin-when-cross-origin',
          url,
        })
      );
    } else {
      passes.push(this.createPass('SEC-HEADERS-RP', 'Referrer-Policy header set'));
    }

    // SEC-HEADERS-CORS: Overly permissive CORS
    const acao = headers.get('access-control-allow-origin');
    if (acao === '*') {
      issues.push(
        this.createIssue({
          id: 'SEC-HEADERS-CORS',
          title: 'Overly Permissive CORS Policy',
          description:
            'Access-Control-Allow-Origin is set to wildcard (*). Any website can make cross-origin requests to this site, which may expose sensitive data or enable CSRF-like attacks.',
          severity: AuditSeverity.MEDIUM,
          suggestion:
            'Restrict Access-Control-Allow-Origin to specific trusted origins instead of using a wildcard.',
          url,
        })
      );
    } else if (acao) {
      passes.push(this.createPass('SEC-HEADERS-CORS', 'CORS policy correctly restricted'));
    }

    // SEC-INFO-SERVER: Server header version disclosure
    const serverHeader = headers.get('server');
    if (serverHeader && /\/[\d.]+/.test(serverHeader)) {
      issues.push(
        this.createIssue({
          id: 'SEC-INFO-SERVER',
          title: 'Server Header Discloses Version Information',
          description: `The Server header reveals version information: "${serverHeader}". This helps attackers identify known vulnerabilities for the specific server version.`,
          severity: AuditSeverity.LOW,
          suggestion:
            'Configure the server to suppress version information from the Server header, or remove the header entirely.',
          url,
        })
      );
    } else if (serverHeader === null || !/\/[\d.]+/.test(serverHeader ?? '')) {
      passes.push(this.createPass('SEC-INFO-SERVER', 'Server header does not disclose version'));
    }

    // SEC-HEADERS-COOP: Cross-Origin-Opener-Policy
    if (!headers.get('cross-origin-opener-policy')) {
      issues.push(
        this.createIssue({
          id: 'SEC-HEADERS-COOP',
          title: 'Cross-Origin-Opener-Policy Not Set',
          description:
            'The Cross-Origin-Opener-Policy header is not set. Without COOP, the page may be vulnerable to cross-origin attacks via window references (e.g., Spectre-like side-channel attacks).',
          severity: AuditSeverity.INFO,
          suggestion:
            'Add Cross-Origin-Opener-Policy: same-origin to isolate the browsing context from cross-origin documents.',
          url,
        })
      );
    } else {
      passes.push(this.createPass('SEC-HEADERS-COOP', 'Cross-Origin-Opener-Policy set'));
    }

    // SEC-HEADERS-COEP: Cross-Origin-Embedder-Policy
    if (!headers.get('cross-origin-embedder-policy')) {
      issues.push(
        this.createIssue({
          id: 'SEC-HEADERS-COEP',
          title: 'Cross-Origin-Embedder-Policy Not Set',
          description:
            'The Cross-Origin-Embedder-Policy header is not set. Without COEP, the page cannot use SharedArrayBuffer and other cross-origin isolation features securely.',
          severity: AuditSeverity.INFO,
          suggestion:
            'Add Cross-Origin-Embedder-Policy: require-corp to enable cross-origin isolation.',
          url,
        })
      );
    } else {
      passes.push(this.createPass('SEC-HEADERS-COEP', 'Cross-Origin-Embedder-Policy set'));
    }

    // SEC-HEADERS-CORP: Cross-Origin-Resource-Policy
    if (!headers.get('cross-origin-resource-policy')) {
      issues.push(
        this.createIssue({
          id: 'SEC-HEADERS-CORP',
          title: 'Cross-Origin-Resource-Policy Not Set',
          description:
            "The Cross-Origin-Resource-Policy header is not set. Without CORP, the site's resources may be loaded by any cross-origin document, potentially enabling data leaks via side-channel attacks.",
          severity: AuditSeverity.INFO,
          suggestion:
            'Add Cross-Origin-Resource-Policy: same-origin (or same-site/cross-origin depending on needs) to control resource sharing.',
          url,
        })
      );
    } else {
      passes.push(this.createPass('SEC-HEADERS-CORP', 'Cross-Origin-Resource-Policy set'));
    }

    return { issues, passes };
  }

  /**
   * Check if CSP header includes frame-ancestors directive (replaces X-Frame-Options).
   */
  private cspHasFrameAncestors(headers: Headers): boolean {
    const csp = headers.get('content-security-policy');
    return csp ? csp.toLowerCase().includes('frame-ancestors') : false;
  }

  /**
   * Check CSP header quality — look for unsafe directives.
   */
  private checkCspQuality(csp: string, url: string): { issues: AuditIssue[]; passes: AuditPass[] } {
    const issues: AuditIssue[] = [];
    const passes: AuditPass[] = [];
    const weakDirectives: string[] = [];

    const directives = csp.split(';').map((d) => d.trim());
    for (const directive of directives) {
      for (const weakValue of WEAK_CSP_VALUES) {
        if (directive.includes(weakValue)) {
          weakDirectives.push(`${directive.split(/\s/)[0]} contains ${weakValue}`);
        }
      }
    }

    if (weakDirectives.length > 0) {
      issues.push(
        this.createIssue({
          id: 'SEC-CSP-WEAK',
          title: 'CSP: Wildcard Directive or Unsafe Policy',
          description: `Content Security Policy contains weak directives: ${weakDirectives.join('; ')}`,
          severity: AuditSeverity.MEDIUM,
          suggestion:
            "Remove 'unsafe-inline', 'unsafe-eval', and wildcard (*) from CSP directives. Use nonces or hashes for inline scripts.",
          url,
        })
      );
    } else {
      passes.push(this.createPass('SEC-CSP-WEAK', 'CSP has no unsafe directives'));
      // CSP header present AND strong — record the header-level pass here
      passes.push(this.createPass('SEC-HEADERS-CSP', 'Content Security Policy header set'));
    }

    return { issues, passes };
  }

  /**
   * Check Set-Cookie headers for security attributes.
   */
  private checkCookies(
    headers: Headers,
    parsedUrl: URL,
    url: string
  ): { issues: AuditIssue[]; passes: AuditPass[] } {
    const issues: AuditIssue[] = [];
    const passes: AuditPass[] = [];
    // getSetCookie() returns all Set-Cookie headers
    const cookies = headers.getSetCookie?.() ?? [];

    if (cookies.length === 0) {
      return { issues, passes };
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const looseCookies: string[] = [];
    const missingSecure: string[] = [];
    const missingHttpOnly: string[] = [];
    const missingSameSite: string[] = [];

    for (const cookie of cookies) {
      const parts = cookie.toLowerCase();
      const cookieName = cookie.split('=')[0]?.trim() ?? 'unknown';

      // Check domain scoping — cookie set for a parent domain
      const domainMatch = parts.match(/;\s*domain\s*=\s*\.?([^;]+)/);
      if (domainMatch) {
        const cookieDomain = domainMatch[1]?.trim() ?? '';
        if (parsedUrl.hostname !== cookieDomain && parsedUrl.hostname.endsWith(cookieDomain)) {
          looseCookies.push(`${cookieName} (domain: .${cookieDomain})`);
        }
      }

      // SEC-COOKIES-SECURE: Missing Secure flag on HTTPS
      if (isHttps && !parts.includes('; secure') && !parts.includes(';secure')) {
        missingSecure.push(cookieName);
      }

      // SEC-COOKIES-HTTPONLY: Missing HttpOnly flag
      if (!parts.includes('httponly')) {
        missingHttpOnly.push(cookieName);
      }

      // SEC-COOKIES-SAMESITE: Missing SameSite attribute
      if (!parts.includes('samesite')) {
        missingSameSite.push(cookieName);
      }
    }

    if (looseCookies.length > 0) {
      issues.push(
        this.createIssue({
          id: 'SEC-COOKIES-SCOPE',
          title: 'Loosely Scoped Cookie',
          description: `Cookies with overly broad domain scope detected: ${looseCookies.join(', ')}. This could allow sibling subdomains to access session data.`,
          severity: AuditSeverity.LOW,
          suggestion:
            'Set cookie Domain attribute to the most specific domain possible. Avoid setting cookies for parent domains unless necessary.',
          url,
        })
      );
    }

    if (missingSecure.length > 0) {
      issues.push(
        this.createIssue({
          id: 'SEC-COOKIES-SECURE',
          title: 'Cookie Missing Secure Flag',
          description: `${missingSecure.length} cookie(s) on HTTPS site missing the Secure flag: ${missingSecure.slice(0, 5).join(', ')}. These cookies may be transmitted over unencrypted HTTP connections.`,
          severity: AuditSeverity.MEDIUM,
          suggestion:
            'Add the Secure flag to all cookies on HTTPS sites to prevent transmission over insecure connections.',
          url,
        })
      );
    } else if (isHttps && cookies.length > 0) {
      passes.push(this.createPass('SEC-COOKIES-SECURE', 'All cookies have Secure flag'));
    }

    if (missingHttpOnly.length > 0) {
      issues.push(
        this.createIssue({
          id: 'SEC-COOKIES-HTTPONLY',
          title: 'Cookie Missing HttpOnly Flag',
          description: `${missingHttpOnly.length} cookie(s) missing the HttpOnly flag: ${missingHttpOnly.slice(0, 5).join(', ')}. These cookies are accessible to JavaScript, increasing XSS impact.`,
          severity: AuditSeverity.MEDIUM,
          suggestion:
            'Add the HttpOnly flag to cookies that do not need JavaScript access, especially session cookies.',
          url,
        })
      );
    } else if (cookies.length > 0) {
      passes.push(this.createPass('SEC-COOKIES-HTTPONLY', 'All cookies have HttpOnly flag'));
    }

    if (missingSameSite.length > 0) {
      issues.push(
        this.createIssue({
          id: 'SEC-COOKIES-SAMESITE',
          title: 'Cookie Missing SameSite Attribute',
          description: `${missingSameSite.length} cookie(s) missing the SameSite attribute: ${missingSameSite.slice(0, 5).join(', ')}. Without SameSite, cookies are sent with cross-site requests, enabling CSRF.`,
          severity: AuditSeverity.LOW,
          suggestion:
            'Add SameSite=Lax (or SameSite=Strict for sensitive cookies) to prevent cross-site request forgery.',
          url,
        })
      );
    } else if (cookies.length > 0) {
      passes.push(this.createPass('SEC-COOKIES-SAMESITE', 'All cookies have SameSite attribute'));
    }

    return { issues, passes };
  }

  /**
   * Check HTML body for security issues: SRI, cross-domain scripts, vulnerable libraries.
   */
  private checkHtmlBody(body: string, parsedUrl: URL, url: string): AuditIssue[] {
    const issues: AuditIssue[] = [];
    const $ = cheerio.load(body);

    // Collect external scripts and stylesheets
    const externalScripts: string[] = [];
    const missingSri: string[] = [];
    const crossDomainScripts: string[] = [];

    $('script[src]').each((_i, el) => {
      const src = $(el).attr('src');
      if (!src) {
        return;
      }

      const hasIntegrity = $(el).attr('integrity');
      let srcUrl: URL;

      try {
        srcUrl = new URL(src, url);
      } catch {
        return; // Invalid URL, skip
      }

      // Is this an external (cross-domain) script?
      const isExternal = srcUrl.hostname !== parsedUrl.hostname;

      if (isExternal) {
        externalScripts.push(src);
        crossDomainScripts.push(src);
        if (!hasIntegrity) {
          missingSri.push(src);
        }
      }
    });

    // Also check <link rel="stylesheet"> for SRI
    $('link[rel="stylesheet"][href]').each((_i, el) => {
      const href = $(el).attr('href');
      if (!href) {
        return;
      }

      try {
        const hrefUrl = new URL(href, url);
        if (hrefUrl.hostname !== parsedUrl.hostname && !$(el).attr('integrity')) {
          missingSri.push(href);
        }
      } catch {
        // Invalid URL, skip
      }
    });

    // SEC-RESOURCES-SRI: Missing Sub-Resource Integrity
    if (missingSri.length > 0) {
      issues.push(
        this.createIssue({
          id: 'SEC-RESOURCES-SRI',
          title: 'Sub Resource Integrity Attribute Missing',
          description: `${missingSri.length} external resource(s) loaded without integrity verification: ${missingSri.slice(0, 3).join(', ')}${missingSri.length > 3 ? ` and ${missingSri.length - 3} more` : ''}`,
          severity: AuditSeverity.MEDIUM,
          suggestion:
            'Add integrity and crossorigin attributes to external <script> and <link> tags. Use tools like srihash.org to generate hashes.',
          url,
        })
      );
    }

    // SEC-RESOURCES-XDOMAIN: Cross-Domain JavaScript Source File Inclusion
    if (crossDomainScripts.length > 0) {
      issues.push(
        this.createIssue({
          id: 'SEC-RESOURCES-XDOMAIN',
          title: 'Cross-Domain JavaScript Source File Inclusion',
          description: `${crossDomainScripts.length} JavaScript file(s) loaded from external domains: ${crossDomainScripts.slice(0, 3).join(', ')}${crossDomainScripts.length > 3 ? ` and ${crossDomainScripts.length - 3} more` : ''}`,
          severity: AuditSeverity.LOW,
          suggestion:
            'Review external JavaScript sources. Host critical scripts locally where possible, and always use SRI for external scripts.',
          url,
        })
      );
    }

    // SEC-RESOURCES-VULNLIB: Vulnerable JavaScript Library
    for (const src of externalScripts) {
      for (const lib of VULNERABLE_LIBS) {
        const match = src.match(lib.pattern);
        if (match?.[1] && lib.isVulnerable(match[1])) {
          issues.push(
            this.createIssue({
              id: 'SEC-RESOURCES-VULNLIB',
              title: `Vulnerable JS Library: ${lib.name} ${match[1]}`,
              description: `A known vulnerable version of ${lib.name} (${match[1]}) was detected. Older versions of this library have known security vulnerabilities.`,
              severity: AuditSeverity.MEDIUM,
              suggestion: `Update ${lib.name} to the latest stable version.`,
              url,
            })
          );
          break; // One issue per script src
        }
      }
    }

    return issues;
  }

  /**
   * Check for timestamp disclosure in headers and body.
   */
  private checkTimestampDisclosure(headers: Headers, body: string, url: string): AuditIssue[] {
    const issues: AuditIssue[] = [];
    const disclosures: string[] = [];

    // Check select response headers that commonly leak timestamps
    const headerNames = ['x-powered-by', 'server', 'x-aspnet-version'];
    for (const name of headerNames) {
      const value = headers.get(name);
      if (value && UNIX_TIMESTAMP_REGEX.test(value)) {
        disclosures.push(`Header: ${name}`);
      }
    }

    // Check body — but only first 50KB to avoid performance issues
    const bodySlice = body.slice(0, 50_000);
    const bodyMatches = bodySlice.match(UNIX_TIMESTAMP_REGEX);
    if (bodyMatches && bodyMatches.length > 0) {
      // Filter to plausible timestamps (2010-2035 range)
      const now = Math.floor(Date.now() / 1000);
      const plausible = bodyMatches.filter((ts) => {
        const n = parseInt(ts, 10);
        return n > 1_262_304_000 && n < now + 300_000_000; // 2010 to ~2035
      });
      if (plausible.length > 0) {
        disclosures.push(`Body: ${plausible.length} timestamp(s)`);
      }
    }

    if (disclosures.length > 0) {
      issues.push(
        this.createIssue({
          id: 'SEC-INFO-TIMESTAMP',
          title: 'Timestamp Disclosure',
          description: `Unix timestamps detected in response: ${disclosures.join(', ')}. These may reveal server information useful for targeted attacks.`,
          severity: AuditSeverity.INFO,
          suggestion:
            'Review and remove unnecessary timestamp exposures. Use relative dates or formatted strings instead of Unix timestamps in responses.',
          url,
        })
      );
    }

    return issues;
  }

  /**
   * Create an AuditIssue with the SECURITY category.
   */
  private createIssue(params: {
    id: string;
    title: string;
    description: string;
    severity: AuditSeverity;
    suggestion: string;
    url: string;
  }): AuditIssue {
    return {
      id: params.id,
      title: params.title,
      description: params.description,
      severity: params.severity,
      category: AuditCategory.SECURITY,
      suggestion: params.suggestion,
      affectedUrl: params.url,
    };
  }

  /**
   * Create an AuditPass for a security check that passed.
   */
  private createPass(id: string, title: string): AuditPass {
    return {
      id,
      title,
      category: AuditCategory.SECURITY,
      source: 'OWASP Secure Headers',
    };
  }
}
