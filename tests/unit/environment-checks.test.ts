/**
 * Tests for environment checking utilities.
 * Tests the version comparison and Node.js version checking logic.
 */

import { describe, it, expect } from 'vitest';

// Re-implement the version comparison functions here for testing
// (In production, these would be exported from the main module)

function parseVersion(version: string): number[] {
  return version
    .replace(/^v/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

function compareVersions(a: string, b: string): number {
  const partsA = parseVersion(a);
  const partsB = parseVersion(b);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

describe('Environment Checks', () => {
  describe('parseVersion', () => {
    it('should parse simple version strings', () => {
      expect(parseVersion('18.16.0')).toEqual([18, 16, 0]);
    });

    it('should handle v prefix', () => {
      expect(parseVersion('v18.16.0')).toEqual([18, 16, 0]);
    });

    it('should handle two-part versions', () => {
      expect(parseVersion('18.16')).toEqual([18, 16]);
    });

    it('should handle single-part versions', () => {
      expect(parseVersion('18')).toEqual([18]);
    });
  });

  describe('compareVersions', () => {
    it('should return 0 for equal versions', () => {
      expect(compareVersions('18.16.0', '18.16.0')).toBe(0);
    });

    it('should return -1 when first version is lower', () => {
      expect(compareVersions('18.15.0', '18.16.0')).toBe(-1);
      expect(compareVersions('17.0.0', '18.0.0')).toBe(-1);
      expect(compareVersions('18.16.0', '18.16.1')).toBe(-1);
    });

    it('should return 1 when first version is higher', () => {
      expect(compareVersions('18.17.0', '18.16.0')).toBe(1);
      expect(compareVersions('19.0.0', '18.16.0')).toBe(1);
      expect(compareVersions('18.16.1', '18.16.0')).toBe(1);
    });

    it('should handle versions with different number of parts', () => {
      expect(compareVersions('18.16', '18.16.0')).toBe(0);
      expect(compareVersions('18.16.0', '18.16')).toBe(0);
      expect(compareVersions('18', '18.0.0')).toBe(0);
    });

    it('should handle v prefix', () => {
      expect(compareVersions('v18.16.0', '18.16.0')).toBe(0);
      expect(compareVersions('18.16.0', 'v18.16.0')).toBe(0);
    });

    it('should correctly compare Node.js 20.0.0 requirement', () => {
      const minVersion = '20.0.0';

      // Versions that should pass
      expect(compareVersions('20.0.0', minVersion)).toBeGreaterThanOrEqual(0);
      expect(compareVersions('20.10.0', minVersion)).toBeGreaterThanOrEqual(0);
      expect(compareVersions('22.0.0', minVersion)).toBeGreaterThanOrEqual(0);
      expect(compareVersions('22.12.0', minVersion)).toBeGreaterThanOrEqual(0);

      // Versions that should fail
      expect(compareVersions('18.16.0', minVersion)).toBeLessThan(0);
      expect(compareVersions('18.0.0', minVersion)).toBeLessThan(0);
      expect(compareVersions('16.20.0', minVersion)).toBeLessThan(0);
      expect(compareVersions('14.0.0', minVersion)).toBeLessThan(0);
    });
  });
});
