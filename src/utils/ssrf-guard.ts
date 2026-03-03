/**
 * SSRF (Server-Side Request Forgery) prevention utility.
 * Blocks requests to private/internal IP addresses to prevent
 * the web service from being used to scan internal infrastructure.
 */

import { lookup } from 'dns/promises';
import { isIP, isIPv4, isIPv6 } from 'net';

/** Delay helper for DNS rebinding mitigation. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize an IP address to a canonical form for consistent checking.
 *
 * Handles:
 * - IPv6 zone IDs (e.g., `fe80::1%eth0` -> `fe80::1`)
 * - IPv4-mapped IPv6 (e.g., `::ffff:127.0.0.1` -> extracts `127.0.0.1`)
 * - IPv4-compatible IPv6 (e.g., `::127.0.0.1` -> extracts `127.0.0.1`)
 * - Expanded IPv6 loopback (e.g., `0:0:0:0:0:0:0:1` -> `::1`)
 *
 * Returns `{ normalized: string; extractedIPv4: string | null }`.
 */
function normalizeIp(ip: string): { normalized: string; extractedIPv4: string | null } {
  // Strip IPv6 zone ID (e.g., %eth0, %25eth0)
  let cleaned = ip;
  const zoneIndex = cleaned.indexOf('%');
  if (zoneIndex !== -1) {
    cleaned = cleaned.slice(0, zoneIndex);
  }

  // Check for IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const mappedMatch = cleaned.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mappedMatch) {
    return { normalized: cleaned.toLowerCase(), extractedIPv4: mappedMatch[1]! };
  }

  // Check for IPv4-compatible IPv6 (::x.x.x.x)
  const compatMatch = cleaned.match(/^::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (compatMatch) {
    return { normalized: cleaned.toLowerCase(), extractedIPv4: compatMatch[1]! };
  }

  // Normalize expanded IPv6 to compact form
  // Parse full IPv6 address and compact it
  if (isIPv6(cleaned) || isIPv6(ip)) {
    const compacted = compactIPv6(cleaned);
    return { normalized: compacted, extractedIPv4: null };
  }

  return { normalized: cleaned, extractedIPv4: null };
}

/**
 * Compact an IPv6 address to its shortest representation.
 * e.g., `0:0:0:0:0:0:0:1` -> `::1`
 *       `0:0:0:0:0:0:0:0` -> `::`
 */
function compactIPv6(ip: string): string {
  // Split into groups, expand any existing :: first
  let groups: string[];

  if (ip.includes('::')) {
    const [left, right] = ip.split('::');
    const leftGroups = left ? left.split(':') : [];
    const rightGroups = right ? right.split(':') : [];
    const missing = 8 - leftGroups.length - rightGroups.length;
    groups = [...leftGroups, ...Array(missing).fill('0'), ...rightGroups];
  } else {
    groups = ip.split(':');
  }

  if (groups.length !== 8) {
    // Not a standard IPv6 address, return as-is lowercase
    return ip.toLowerCase();
  }

  // Normalize each group (remove leading zeros)
  groups = groups.map((g) => (parseInt(g, 16) || 0).toString(16));

  // Find the longest run of consecutive '0' groups for :: compression
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < 8; i++) {
    if (groups[i] === '0') {
      if (curStart === -1) {
        curStart = i;
      }
      curLen++;
      if (curLen > bestLen) {
        bestStart = curStart;
        bestLen = curLen;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }

  if (bestLen >= 2) {
    const before = groups.slice(0, bestStart);
    const after = groups.slice(bestStart + bestLen);
    if (before.length === 0 && after.length === 0) {
      return '::';
    }
    if (before.length === 0) {
      return '::' + after.join(':');
    }
    if (after.length === 0) {
      return before.join(':') + '::';
    }
    return before.join(':') + '::' + after.join(':');
  }

  return groups.join(':');
}

/**
 * Check if an IPv4 address (dotted-decimal string) is private/internal.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  // 0.0.0.0/8 — "This host on this network" (entire block)
  if (parts[0] === 0) {
    return true;
  }
  // 127.0.0.0/8 (loopback)
  if (parts[0] === 127) {
    return true;
  }
  // 10.0.0.0/8
  if (parts[0] === 10) {
    return true;
  }
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) {
    return true;
  }
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) {
    return true;
  }
  // 169.254.0.0/16 (link-local / cloud metadata)
  if (parts[0] === 169 && parts[1] === 254) {
    return true;
  }
  // 100.64.0.0/10 (Carrier-Grade NAT / CGNAT, RFC 6598)
  if (parts[0] === 100 && parts[1]! >= 64 && parts[1]! <= 127) {
    return true;
  }
  // 192.0.0.0/24 (IETF protocol assignments)
  if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) {
    return true;
  }
  // 198.18.0.0/15 (Network benchmark tests)
  if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) {
    return true;
  }
  // 240.0.0.0/4 (Reserved, formerly Class E) — also covers 255.255.255.255 broadcast
  if (parts[0]! >= 240) {
    return true;
  }

  return false;
}

/**
 * Check if an IP address is private/internal.
 *
 * Handles IPv4, IPv6, IPv4-mapped/compatible IPv6, expanded IPv6,
 * and IPv6 zone IDs.
 */
function isPrivateIp(ip: string): boolean {
  const { normalized, extractedIPv4 } = normalizeIp(ip);

  // If an IPv4 address was embedded in IPv6, check it
  if (extractedIPv4) {
    return isPrivateIPv4(extractedIPv4);
  }

  // Plain IPv4 check
  if (isIPv4(ip) || isIPv4(normalized)) {
    return isPrivateIPv4(normalized);
  }

  // IPv6 checks (use normalized/compacted form)
  const ipv6 = normalized.toLowerCase();

  // Loopback ::1
  if (ipv6 === '::1') {
    return true;
  }
  // Unspecified ::
  if (ipv6 === '::') {
    return true;
  }
  // Unique local addresses fc00::/7 (fc and fd prefixes)
  if (ipv6.startsWith('fc') || ipv6.startsWith('fd')) {
    return true;
  }
  // Link-local fe80::/10
  if (ipv6.startsWith('fe80')) {
    return true;
  }

  return false;
}

/**
 * Validate that a URL does not resolve to a private/internal IP.
 * Returns an error message string if the URL is blocked, null if safe.
 *
 * ## DNS rebinding / TOCTOU caveat
 *
 * This function resolves DNS at validation time, but the actual HTTP
 * request may happen later when the DNS record could have changed
 * (DNS rebinding attack). To mitigate this we perform a double-resolve
 * with a short delay: if the IP changes between the two lookups, we
 * reject the request. This is not bulletproof (an attacker with precise
 * TTL control could still bypass it) but significantly raises the bar.
 *
 * For full protection, callers should also pin the resolved IP when
 * making the actual HTTP request. Use `revalidateIp()` to re-check
 * at request time.
 */
export async function validateUrlNotInternal(url: string): Promise<string | null> {
  let hostname: string;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    // URL class wraps IPv6 in brackets — strip them
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      hostname = hostname.slice(1, -1);
    }
  } catch {
    return 'Invalid URL';
  }

  // Check if hostname is already an IP address
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return `Scanning private/internal IP addresses is not allowed: ${hostname}`;
    }
    return null;
  }

  // Block common internal hostnames
  const lowerHost = hostname.toLowerCase();
  if (
    lowerHost === 'localhost' ||
    lowerHost.endsWith('.local') ||
    lowerHost.endsWith('.internal')
  ) {
    return `Scanning internal hostnames is not allowed: ${hostname}`;
  }

  // Resolve hostname and check resulting IP — double-resolve to mitigate DNS rebinding
  try {
    const firstResult = await lookup(hostname);
    if (isPrivateIp(firstResult.address)) {
      return `URL resolves to a private IP address (${firstResult.address}). Scanning internal infrastructure is not allowed.`;
    }

    // Second resolve after a short delay to catch DNS rebinding
    await delay(100);
    const secondResult = await lookup(hostname);
    if (isPrivateIp(secondResult.address)) {
      return `URL resolves to a private IP address (${secondResult.address}). Scanning internal infrastructure is not allowed.`;
    }

    // If the IP changed between lookups, it might be a rebinding attack
    if (firstResult.address !== secondResult.address) {
      return `DNS rebinding detected: hostname resolved to different IPs (${firstResult.address} then ${secondResult.address}). Request rejected for safety.`;
    }
  } catch {
    return `Could not resolve hostname: ${hostname}`;
  }

  return null;
}

/**
 * Re-validate an IP address at request time.
 * Use this in downstream code right before making the actual HTTP request
 * to catch DNS rebinding that may have occurred after initial validation.
 *
 * @param hostname - The hostname to re-resolve
 * @returns null if safe, or an error message string if blocked
 */
export async function revalidateIp(hostname: string): Promise<string | null> {
  // If it's already an IP, just check directly
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return `Scanning private/internal IP addresses is not allowed: ${hostname}`;
    }
    return null;
  }

  try {
    const result = await lookup(hostname);
    if (isPrivateIp(result.address)) {
      return `URL resolves to a private IP address (${result.address}). Scanning internal infrastructure is not allowed.`;
    }
  } catch {
    return `Could not resolve hostname: ${hostname}`;
  }

  return null;
}

// Export isPrivateIp for direct use in tests and other modules
export { isPrivateIp };
