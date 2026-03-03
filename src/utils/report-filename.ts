/**
 * Report filename utilities.
 * Generates consistent filenames like: report-example-com-20260301-153045
 */

/**
 * Sanitize a URL's hostname for use in a filename.
 * e.g. "https://www.example.com/page" → "www-example-com"
 */
export function sanitizeDomainForFilename(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname
      .replace(/\./g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toLowerCase()
      .slice(0, 50);
  } catch {
    return 'unknown';
  }
}

/**
 * Format a Date as YYYYMMDD-HHmmss for use in filenames.
 * e.g. 2026-03-01 15:30:45 → "20260301-153045"
 */
export function formatTimestampForFilename(date: Date = new Date()): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${mo}${d}-${h}${mi}${s}`;
}

/**
 * Generate a report base filename (without extension).
 * e.g. "report-example-com-20260301-153045"
 */
export function generateReportFilename(url: string, date: Date = new Date()): string {
  const domain = sanitizeDomainForFilename(url);
  const timestamp = formatTimestampForFilename(date);
  return `report-${domain}-${timestamp}`;
}
