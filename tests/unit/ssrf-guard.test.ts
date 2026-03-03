/**
 * Tests for SSRF guard utility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateUrlNotInternal, isPrivateIp } from '../../src/utils/ssrf-guard.js';

// Mock dns lookup
vi.mock('dns/promises', () => ({
  lookup: vi.fn(),
}));

import { lookup } from 'dns/promises';
const mockLookup = vi.mocked(lookup);

describe('SSRF Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isPrivateIp — direct unit tests', () => {
    describe('IPv4 private ranges', () => {
      it('should detect 127.0.0.1 as private', () => {
        expect(isPrivateIp('127.0.0.1')).toBe(true);
      });

      it('should detect 10.x.x.x as private', () => {
        expect(isPrivateIp('10.0.0.1')).toBe(true);
        expect(isPrivateIp('10.255.255.255')).toBe(true);
      });

      it('should detect 172.16-31.x.x as private', () => {
        expect(isPrivateIp('172.16.0.1')).toBe(true);
        expect(isPrivateIp('172.31.255.255')).toBe(true);
        expect(isPrivateIp('172.15.0.1')).toBe(false);
        expect(isPrivateIp('172.32.0.1')).toBe(false);
      });

      it('should detect 192.168.x.x as private', () => {
        expect(isPrivateIp('192.168.1.1')).toBe(true);
      });

      it('should detect 169.254.x.x (link-local) as private', () => {
        expect(isPrivateIp('169.254.169.254')).toBe(true);
      });

      it('should detect 0.0.0.0 as private', () => {
        expect(isPrivateIp('0.0.0.0')).toBe(true);
      });

      it('should detect 0.0.0.0/8 range (0.x.x.x) as private', () => {
        expect(isPrivateIp('0.1.2.3')).toBe(true);
        expect(isPrivateIp('0.0.0.1')).toBe(true);
        expect(isPrivateIp('0.255.255.255')).toBe(true);
      });

      it('should detect 100.64.0.0/10 (CGNAT, RFC 6598) as private', () => {
        expect(isPrivateIp('100.64.0.0')).toBe(true);
        expect(isPrivateIp('100.64.0.1')).toBe(true);
        expect(isPrivateIp('100.100.100.100')).toBe(true);
        expect(isPrivateIp('100.127.255.255')).toBe(true);
        expect(isPrivateIp('100.63.255.255')).toBe(false);
        expect(isPrivateIp('100.128.0.0')).toBe(false);
      });

      it('should detect 192.0.0.0/24 (IETF protocol assignments) as private', () => {
        expect(isPrivateIp('192.0.0.0')).toBe(true);
        expect(isPrivateIp('192.0.0.1')).toBe(true);
        expect(isPrivateIp('192.0.0.255')).toBe(true);
        expect(isPrivateIp('192.0.1.0')).toBe(false);
      });

      it('should detect 198.18.0.0/15 (network benchmark tests) as private', () => {
        expect(isPrivateIp('198.18.0.0')).toBe(true);
        expect(isPrivateIp('198.18.0.1')).toBe(true);
        expect(isPrivateIp('198.19.255.255')).toBe(true);
        expect(isPrivateIp('198.17.255.255')).toBe(false);
        expect(isPrivateIp('198.20.0.0')).toBe(false);
      });

      it('should detect 240.0.0.0/4 (reserved, formerly Class E) as private', () => {
        expect(isPrivateIp('240.0.0.0')).toBe(true);
        expect(isPrivateIp('240.0.0.1')).toBe(true);
        expect(isPrivateIp('250.1.2.3')).toBe(true);
        expect(isPrivateIp('255.255.255.254')).toBe(true);
        expect(isPrivateIp('239.255.255.255')).toBe(false);
      });

      it('should detect 255.255.255.255 (broadcast) as private', () => {
        expect(isPrivateIp('255.255.255.255')).toBe(true);
      });

      it('should allow public IPv4 addresses', () => {
        expect(isPrivateIp('8.8.8.8')).toBe(false);
        expect(isPrivateIp('93.184.216.34')).toBe(false);
        expect(isPrivateIp('1.1.1.1')).toBe(false);
      });
    });

    describe('IPv6 private ranges', () => {
      it('should detect ::1 as private', () => {
        expect(isPrivateIp('::1')).toBe(true);
      });

      it('should detect :: as private', () => {
        expect(isPrivateIp('::')).toBe(true);
      });

      it('should detect fc/fd (unique local) as private', () => {
        expect(isPrivateIp('fc00::1')).toBe(true);
        expect(isPrivateIp('fd12:3456::1')).toBe(true);
      });

      it('should detect fe80 (link-local) as private', () => {
        expect(isPrivateIp('fe80::1')).toBe(true);
      });
    });

    describe('IPv4-mapped IPv6 bypass vectors', () => {
      it('should block ::ffff:127.0.0.1', () => {
        expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
      });

      it('should block ::ffff:10.0.0.1', () => {
        expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
      });

      it('should block ::ffff:169.254.169.254 (cloud metadata)', () => {
        expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true);
      });

      it('should block ::ffff:192.168.1.1', () => {
        expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true);
      });

      it('should block ::ffff:0.0.0.0', () => {
        expect(isPrivateIp('::ffff:0.0.0.0')).toBe(true);
      });

      it('should allow ::ffff: with public IPv4', () => {
        expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false);
      });
    });

    describe('IPv4-compatible IPv6 bypass vectors', () => {
      it('should block ::127.0.0.1', () => {
        expect(isPrivateIp('::127.0.0.1')).toBe(true);
      });

      it('should block ::10.0.0.1', () => {
        expect(isPrivateIp('::10.0.0.1')).toBe(true);
      });

      it('should allow :: with public IPv4', () => {
        expect(isPrivateIp('::8.8.8.8')).toBe(false);
      });
    });

    describe('Expanded IPv6 loopback', () => {
      it('should block 0:0:0:0:0:0:0:1 (expanded ::1)', () => {
        expect(isPrivateIp('0:0:0:0:0:0:0:1')).toBe(true);
      });

      it('should block 0000:0000:0000:0000:0000:0000:0000:0001', () => {
        expect(isPrivateIp('0000:0000:0000:0000:0000:0000:0000:0001')).toBe(true);
      });

      it('should block 0:0:0:0:0:0:0:0 (expanded ::)', () => {
        expect(isPrivateIp('0:0:0:0:0:0:0:0')).toBe(true);
      });
    });

    describe('IPv6 zone ID stripping', () => {
      it('should block fe80::1%eth0 (zone ID)', () => {
        expect(isPrivateIp('fe80::1%eth0')).toBe(true);
      });

      it('should block fe80::1%25eth0 (URL-encoded zone ID)', () => {
        expect(isPrivateIp('fe80::1%25eth0')).toBe(true);
      });

      it('should block ::1%lo0 (loopback with zone ID)', () => {
        expect(isPrivateIp('::1%lo0')).toBe(true);
      });
    });
  });

  describe('IP-based URLs', () => {
    it('should block localhost (127.0.0.1)', async () => {
      const result = await validateUrlNotInternal('http://127.0.0.1/test');
      expect(result).toContain('private');
    });

    it('should block 10.x.x.x range', async () => {
      const result = await validateUrlNotInternal('http://10.0.0.1');
      expect(result).toContain('private');
    });

    it('should block 172.16.x.x range', async () => {
      const result = await validateUrlNotInternal('http://172.16.0.1');
      expect(result).toContain('private');
    });

    it('should block 192.168.x.x range', async () => {
      const result = await validateUrlNotInternal('http://192.168.1.1');
      expect(result).toContain('private');
    });

    it('should block 169.254.x.x (link-local)', async () => {
      const result = await validateUrlNotInternal('http://169.254.169.254');
      expect(result).toContain('private');
    });

    it('should block 0.x.x.x range', async () => {
      const result = await validateUrlNotInternal('http://0.1.2.3');
      expect(result).toContain('private');
    });

    it('should allow public IPs', async () => {
      const result = await validateUrlNotInternal('http://8.8.8.8');
      expect(result).toBeNull();
    });
  });

  describe('Hostname-based URLs', () => {
    it('should block localhost hostname', async () => {
      const result = await validateUrlNotInternal('http://localhost');
      expect(result).toContain('internal');
    });

    it('should block .local hostnames', async () => {
      const result = await validateUrlNotInternal('http://myhost.local');
      expect(result).toContain('internal');
    });

    it('should block .internal hostnames', async () => {
      const result = await validateUrlNotInternal('http://service.internal');
      expect(result).toContain('internal');
    });

    it('should block hostnames that resolve to private IPs', async () => {
      mockLookup.mockResolvedValue({ address: '192.168.1.1', family: 4 });
      const result = await validateUrlNotInternal('http://example.com');
      expect(result).toContain('private IP');
    });

    it('should allow hostnames that resolve to public IPs', async () => {
      mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
      const result = await validateUrlNotInternal('http://example.com');
      expect(result).toBeNull();
    });

    it('should reject URLs that cannot be resolved', async () => {
      mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
      const result = await validateUrlNotInternal('http://nonexistent.example');
      expect(result).toContain('Could not resolve');
    });
  });

  describe('DNS rebinding detection', () => {
    it('should reject when DNS resolves to different IPs between lookups', async () => {
      mockLookup
        .mockResolvedValueOnce({ address: '93.184.216.34', family: 4 })
        .mockResolvedValueOnce({ address: '10.0.0.1', family: 4 });
      const result = await validateUrlNotInternal('http://example.com');
      expect(result).not.toBeNull();
      // Should either catch the private IP or detect the rebinding
      expect(result).toMatch(/private IP|rebinding/i);
    });

    it('should reject when second resolve returns private IP', async () => {
      mockLookup
        .mockResolvedValueOnce({ address: '93.184.216.34', family: 4 })
        .mockResolvedValueOnce({ address: '127.0.0.1', family: 4 });
      const result = await validateUrlNotInternal('http://evil.com');
      expect(result).not.toBeNull();
    });

    it('should allow when both resolves return the same public IP', async () => {
      mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
      const result = await validateUrlNotInternal('http://example.com');
      expect(result).toBeNull();
    });
  });

  describe('Alternative IP encodings (defense-in-depth)', () => {
    // The WHATWG URL parser (new URL()) normalizes hex/octal/decimal IP
    // representations to dotted-decimal before our guard sees them.
    // These tests document that behavior so a future refactor doesn't
    // silently break this defense layer.

    it('should block hex integer encoding (0x7f000001 → 127.0.0.1)', async () => {
      // new URL('http://0x7f000001').hostname === '127.0.0.1'
      mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
      const result = await validateUrlNotInternal('http://0x7f000001');
      expect(result).toContain('private');
    });

    it('should block decimal integer encoding (2130706433 → 127.0.0.1)', async () => {
      // new URL('http://2130706433').hostname === '127.0.0.1'
      mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
      const result = await validateUrlNotInternal('http://2130706433');
      expect(result).toContain('private');
    });

    it('should block octal first-octet encoding (0177.0.0.1 → 127.0.0.1)', async () => {
      // new URL('http://0177.0.0.1').hostname === '127.0.0.1'
      mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
      const result = await validateUrlNotInternal('http://0177.0.0.1');
      expect(result).toContain('private');
    });

    it('should block dotted hex encoding (0x7f.0x0.0x0.0x1 → 127.0.0.1)', async () => {
      // new URL('http://0x7f.0x0.0x0.0x1').hostname === '127.0.0.1'
      mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
      const result = await validateUrlNotInternal('http://0x7f.0x0.0x0.0x1');
      expect(result).toContain('private');
    });

    it('should block hex cloud metadata IP (0xA9FEA9FE → 169.254.169.254)', async () => {
      // new URL('http://0xA9FEA9FE').hostname === '169.254.169.254'
      mockLookup.mockResolvedValue({ address: '169.254.169.254', family: 4 });
      const result = await validateUrlNotInternal('http://0xA9FEA9FE');
      expect(result).toContain('private');
    });
  });

  describe('Invalid URLs', () => {
    it('should reject invalid URLs', async () => {
      const result = await validateUrlNotInternal('not-a-url');
      expect(result).toBe('Invalid URL');
    });
  });
});
