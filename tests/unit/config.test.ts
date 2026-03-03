/**
 * Tests for CLI configuration validation.
 */

import { describe, it, expect } from 'vitest';
import { CliConfigSchema } from '../../src/types/config.js';

describe('CliConfigSchema', () => {
  describe('valid inputs', () => {
    it('should accept a valid URL with defaults', () => {
      const result = CliConfigSchema.safeParse({
        url: 'https://example.com',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.url).toBe('https://example.com');
        expect(result.data.output).toBe('./reports');
        expect(result.data.modules).toEqual(['seo', 'performance', 'security']);
        expect(result.data.format).toEqual(['pdf']);
        expect(result.data.crawlDepth).toBe(50);
        expect(result.data.timeout).toBe(300);
        expect(result.data.verbose).toBe(false);
        expect(result.data.parallel).toBe(false);
      }
    });

    it('should accept all custom options', () => {
      const result = CliConfigSchema.safeParse({
        url: 'https://example.com/test',
        output: './custom-reports',
        modules: ['seo', 'performance'],
        format: ['pdf', 'json'],
        crawlDepth: 100,
        timeout: 600,
        verbose: true,
        parallel: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.output).toBe('./custom-reports');
        expect(result.data.modules).toEqual(['seo', 'performance']);
        expect(result.data.format).toEqual(['pdf', 'json']);
        expect(result.data.crawlDepth).toBe(100);
        expect(result.data.timeout).toBe(600);
        expect(result.data.verbose).toBe(true);
        expect(result.data.parallel).toBe(true);
      }
    });
  });

  describe('invalid inputs', () => {
    it('should reject an invalid URL', () => {
      const result = CliConfigSchema.safeParse({
        url: 'not-a-url',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing URL', () => {
      const result = CliConfigSchema.safeParse({});

      expect(result.success).toBe(false);
    });

    it('should reject crawlDepth below minimum', () => {
      const result = CliConfigSchema.safeParse({
        url: 'https://example.com',
        crawlDepth: 0,
      });

      expect(result.success).toBe(false);
    });

    it('should reject crawlDepth above maximum', () => {
      const result = CliConfigSchema.safeParse({
        url: 'https://example.com',
        crawlDepth: 101,
      });

      expect(result.success).toBe(false);
    });

    it('should reject timeout below minimum', () => {
      const result = CliConfigSchema.safeParse({
        url: 'https://example.com',
        timeout: 30,
      });

      expect(result.success).toBe(false);
    });

    it('should reject timeout above maximum', () => {
      const result = CliConfigSchema.safeParse({
        url: 'https://example.com',
        timeout: 4000,
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid module names', () => {
      const result = CliConfigSchema.safeParse({
        url: 'https://example.com',
        modules: ['seo', 'invalid-module'],
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid format names', () => {
      const result = CliConfigSchema.safeParse({
        url: 'https://example.com',
        format: ['pdf', 'invalid-format'],
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid performance mode', () => {
      const result = CliConfigSchema.safeParse({
        url: 'https://example.com',
        performanceMode: 'turbo',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('security validations', () => {
    describe('URL protocol validation', () => {
      it('should accept http:// URLs', () => {
        const result = CliConfigSchema.safeParse({
          url: 'http://example.com',
        });
        expect(result.success).toBe(true);
      });

      it('should accept https:// URLs', () => {
        const result = CliConfigSchema.safeParse({
          url: 'https://example.com',
        });
        expect(result.success).toBe(true);
      });

      it('should reject file:// URLs', () => {
        const result = CliConfigSchema.safeParse({
          url: 'file:///etc/passwd',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.errors[0].message).toContain('http');
        }
      });

      it('should reject javascript: URLs', () => {
        const result = CliConfigSchema.safeParse({
          url: 'javascript:alert(1)',
        });
        expect(result.success).toBe(false);
      });

      it('should reject ftp:// URLs', () => {
        const result = CliConfigSchema.safeParse({
          url: 'ftp://example.com/file',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('output path validation', () => {
      it('should accept relative paths', () => {
        const result = CliConfigSchema.safeParse({
          url: 'https://example.com',
          output: './reports',
        });
        expect(result.success).toBe(true);
      });

      it('should accept absolute paths in home directory', () => {
        const result = CliConfigSchema.safeParse({
          url: 'https://example.com',
          output: '/home/user/reports',
        });
        expect(result.success).toBe(true);
      });

      it('should reject /etc directory', () => {
        const result = CliConfigSchema.safeParse({
          url: 'https://example.com',
          output: '/etc',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.errors[0].message).toContain('system directory');
        }
      });

      it('should reject /etc subdirectories', () => {
        const result = CliConfigSchema.safeParse({
          url: 'https://example.com',
          output: '/etc/nginx/conf.d',
        });
        expect(result.success).toBe(false);
      });

      it('should reject /var directory', () => {
        const result = CliConfigSchema.safeParse({
          url: 'https://example.com',
          output: '/var/log',
        });
        expect(result.success).toBe(false);
      });

      it('should reject /usr directory', () => {
        const result = CliConfigSchema.safeParse({
          url: 'https://example.com',
          output: '/usr/local/bin',
        });
        expect(result.success).toBe(false);
      });

      it('should reject /root directory', () => {
        const result = CliConfigSchema.safeParse({
          url: 'https://example.com',
          output: '/root',
        });
        expect(result.success).toBe(false);
      });
    });
  });
});
