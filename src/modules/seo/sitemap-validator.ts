/**
 * Sitemap Validator - Validates sitemap.xml against the sitemaps.org protocol.
 * Reference: https://www.sitemaps.org/protocol.html
 *
 * Validates:
 * - XML structure
 * - Required elements (urlset, url, loc)
 * - Valid date formats (W3C Datetime)
 * - Valid priority values (0.0-1.0)
 * - Valid changefreq values
 * - Sitemap index format
 */

import { XMLParser } from 'fast-xml-parser';
import { logDebug } from '../../utils/logger.js';

/**
 * Result of sitemap validation.
 */
export interface SitemapValidationResult {
  /** Whether the sitemap was found (HTTP 200) */
  found: boolean;
  /** Whether the sitemap is valid according to sitemaps.org protocol */
  valid: boolean;
  /** True if this is a sitemap index file */
  isSitemapIndex?: boolean;
  /** Number of URLs in the sitemap */
  urlCount?: number;
  /** Validation errors found */
  validationErrors?: string[];
  /** Fetch error if unable to retrieve */
  fetchError?: string;
}

/**
 * Valid changefreq values per sitemaps.org protocol.
 */
const VALID_CHANGEFREQ = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];

/**
 * W3C Datetime pattern (simplified for sitemap validation).
 * Matches: YYYY, YYYY-MM, YYYY-MM-DD, YYYY-MM-DDThh:mm:ss+hh:mm, etc.
 */
const W3C_DATETIME_PATTERN =
  /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(([+-]\d{2}:\d{2})|Z)?)?)?)?$/;

/**
 * Validate a sitemap URL.
 */
export async function validateSitemap(sitemapUrl: string): Promise<SitemapValidationResult> {
  let response: Response;

  try {
    response = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': 'web-audit-cli/1.0 (sitemap-validator)',
        Accept: 'application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown fetch error';
    logDebug(`Failed to fetch sitemap: ${message}`);
    return {
      found: false,
      valid: false,
      fetchError: message,
    };
  }

  if (response.status === 404) {
    return {
      found: false,
      valid: false,
    };
  }

  if (!response.ok) {
    return {
      found: true,
      valid: false,
      fetchError: `HTTP ${response.status} ${response.statusText}`,
    };
  }

  let xmlContent: string;
  try {
    xmlContent = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read response';
    return {
      found: true,
      valid: false,
      fetchError: message,
    };
  }

  return validateSitemapContent(xmlContent);
}

/**
 * Validate sitemap XML content.
 */
export function validateSitemapContent(xmlContent: string): SitemapValidationResult {
  const errors: string[] = [];

  // Parse XML
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['url', 'sitemap'].includes(name),
    parseTagValue: false, // Keep values as strings (avoid converting "2024" to number)
  });

  let parsed: unknown;
  try {
    parsed = parser.parse(xmlContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'XML parse error';
    return {
      found: true,
      valid: false,
      validationErrors: [`Invalid XML: ${message}`],
    };
  }

  const doc = parsed as Record<string, unknown>;

  // Check if it's a sitemap index
  if (doc.sitemapindex) {
    return validateSitemapIndex(doc.sitemapindex as Record<string, unknown>);
  }

  // Check for urlset (regular sitemap)
  if (!doc.urlset) {
    return {
      found: true,
      valid: false,
      validationErrors: [
        'Missing root element: Expected <urlset> (sitemap) or <sitemapindex> (sitemap index)',
      ],
    };
  }

  const urlset = doc.urlset as Record<string, unknown>;

  // Validate namespace (optional but recommended)
  const xmlns = urlset['@_xmlns'];
  if (xmlns && xmlns !== 'http://www.sitemaps.org/schemas/sitemap/0.9') {
    errors.push(
      `Invalid namespace: Expected "http://www.sitemaps.org/schemas/sitemap/0.9", got "${xmlns}"`
    );
  }

  // Validate URLs
  const urls = urlset.url as Array<Record<string, unknown>> | undefined;
  if (!urls || urls.length === 0) {
    errors.push('Sitemap contains no URL entries');
    return {
      found: true,
      valid: false,
      urlCount: 0,
      validationErrors: errors,
    };
  }

  // Validate each URL entry
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const urlErrors = validateUrlEntry(url, i + 1);
    errors.push(...urlErrors);
  }

  const result: SitemapValidationResult = {
    found: true,
    valid: errors.length === 0,
    urlCount: urls.length,
  };
  if (errors.length > 0) {
    result.validationErrors = errors;
  }
  return result;
}

/**
 * Validate a sitemap index.
 */
function validateSitemapIndex(sitemapindex: Record<string, unknown>): SitemapValidationResult {
  const errors: string[] = [];

  // Validate namespace (optional but recommended)
  const xmlns = sitemapindex['@_xmlns'];
  if (xmlns && xmlns !== 'http://www.sitemaps.org/schemas/sitemap/0.9') {
    errors.push(
      `Invalid namespace: Expected "http://www.sitemaps.org/schemas/sitemap/0.9", got "${xmlns}"`
    );
  }

  const sitemaps = sitemapindex.sitemap as Array<Record<string, unknown>> | undefined;
  if (!sitemaps || sitemaps.length === 0) {
    errors.push('Sitemap index contains no sitemap entries');
    return {
      found: true,
      valid: false,
      isSitemapIndex: true,
      urlCount: 0,
      validationErrors: errors,
    };
  }

  // Validate each sitemap entry
  for (let i = 0; i < sitemaps.length; i++) {
    const sitemap = sitemaps[i];

    // loc is required
    if (!sitemap.loc || typeof sitemap.loc !== 'string' || sitemap.loc.trim() === '') {
      errors.push(`Sitemap entry ${i + 1}: Missing required <loc> element`);
    } else if (!isValidUrl(sitemap.loc as string)) {
      errors.push(`Sitemap entry ${i + 1}: Invalid URL in <loc>: "${sitemap.loc}"`);
    }

    // lastmod is optional but must be valid if present
    if (sitemap.lastmod !== undefined) {
      if (typeof sitemap.lastmod !== 'string' || !isValidW3CDatetime(sitemap.lastmod)) {
        errors.push(
          `Sitemap entry ${i + 1}: Invalid date format in <lastmod>: "${sitemap.lastmod}". Must be W3C Datetime format.`
        );
      }
    }
  }

  const result: SitemapValidationResult = {
    found: true,
    valid: errors.length === 0,
    isSitemapIndex: true,
    urlCount: sitemaps.length,
  };
  if (errors.length > 0) {
    result.validationErrors = errors;
  }
  return result;
}

/**
 * Validate a single URL entry in the sitemap.
 */
function validateUrlEntry(url: Record<string, unknown>, index: number): string[] {
  const errors: string[] = [];

  // loc is required
  if (!url.loc || typeof url.loc !== 'string' || url.loc.trim() === '') {
    errors.push(`URL entry ${index}: Missing required <loc> element`);
  } else if (!isValidUrl(url.loc as string)) {
    errors.push(`URL entry ${index}: Invalid URL in <loc>: "${url.loc}"`);
  }

  // lastmod is optional but must be valid if present
  if (url.lastmod !== undefined) {
    if (typeof url.lastmod !== 'string' || !isValidW3CDatetime(url.lastmod)) {
      errors.push(
        `URL entry ${index}: Invalid date format in <lastmod>: "${url.lastmod}". Must be W3C Datetime format.`
      );
    }
  }

  // changefreq is optional but must be valid if present
  if (url.changefreq !== undefined) {
    if (typeof url.changefreq !== 'string' || !VALID_CHANGEFREQ.includes(url.changefreq)) {
      errors.push(
        `URL entry ${index}: Invalid <changefreq>: "${url.changefreq}". Must be one of: ${VALID_CHANGEFREQ.join(', ')}`
      );
    }
  }

  // priority is optional but must be valid if present
  if (url.priority !== undefined) {
    const priority = parseFloat(String(url.priority));
    if (isNaN(priority) || priority < 0 || priority > 1) {
      errors.push(
        `URL entry ${index}: Invalid <priority>: "${url.priority}". Must be a decimal between 0.0 and 1.0`
      );
    }
  }

  return errors;
}

/**
 * Validate a URL format.
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate W3C Datetime format.
 * Accepts: YYYY, YYYY-MM, YYYY-MM-DD, YYYY-MM-DDThh:mm:ss+hh:mm, etc.
 */
function isValidW3CDatetime(dateString: string): boolean {
  if (!W3C_DATETIME_PATTERN.test(dateString)) {
    return false;
  }

  // Additional validation: parse the date to ensure it's valid
  try {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}
