/**
 * Tests for Chrome/Chromium detection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';

// Mock modules before importing the module under test
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logDebug: vi.fn(),
}));

// Import after mocking
import {
  checkChromeInstalled,
  getChromeInstallInstructions,
} from '../../src/modules/performance/chrome-detector.js';

describe('Chrome Detector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkChromeInstalled', () => {
    it('should detect Chrome when found at standard path (macOS)', async () => {
      // Mock platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      });

      vi.mocked(execSync).mockReturnValue('Google Chrome 120.0.6099.109\n');

      const result = await checkChromeInstalled();

      expect(result.installed).toBe(true);
      expect(result.path).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
      expect(result.version).toBe('120.0.6099.109');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return not installed when Chrome is not found', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await checkChromeInstalled();

      expect(result.installed).toBe(false);
      expect(result.error).toContain('Chrome/Chromium not found');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should try which command on Linux', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      vi.mocked(execSync).mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('which')) {
          return '/usr/bin/google-chrome\n';
        }
        if (typeof cmd === 'string' && cmd.includes('--version')) {
          return 'Google Chrome 120.0.6099.109\n';
        }
        return '';
      });

      const result = await checkChromeInstalled();

      expect(result.installed).toBe(true);
      expect(result.path).toBe('/usr/bin/google-chrome');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should handle version detection failure gracefully', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      vi.mocked(fs.existsSync).mockImplementation((path) => {
        return path === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      });

      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = await checkChromeInstalled();

      expect(result.installed).toBe(true);
      expect(result.path).toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
      expect(result.version).toBeUndefined();

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('getChromeInstallInstructions', () => {
    it('should return macOS instructions on darwin', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const instructions = getChromeInstallInstructions();
      expect(instructions).toContain('brew');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return Windows instructions on win32', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const instructions = getChromeInstallInstructions();
      expect(instructions).toContain('google.com/chrome');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return Linux instructions on linux', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const instructions = getChromeInstallInstructions();
      expect(instructions).toContain('apt');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });
});
