/**
 * Tests for ZAP configuration generation security.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { generateZapConfig } from '../../src/modules/security/zap-config-gen.js';

describe('ZAP Config Generator Security', () => {
  const testOutputDir = path.resolve(process.cwd(), 'test-zap-output');

  beforeEach(async () => {
    await fs.ensureDir(testOutputDir);
  });

  afterEach(async () => {
    await fs.remove(testOutputDir).catch(() => {});
  });

  describe('YAML injection prevention', () => {
    it('should escape double quotes in URL', async () => {
      const maliciousUrl = 'https://example.com/path"with"quotes';

      const configPath = await generateZapConfig({
        targetUrl: maliciousUrl,
        outputDir: testOutputDir,
        scanMode: 'passive',
      });

      const content = await fs.readFile(configPath, 'utf-8');

      // The quotes should be escaped
      expect(content).toContain('\\"');
      expect(content).not.toContain('path"with"quotes');
    });

    it('should escape newlines in URL', async () => {
      const maliciousUrl = 'https://example.com/path\ninjected: value';

      const configPath = await generateZapConfig({
        targetUrl: maliciousUrl,
        outputDir: testOutputDir,
        scanMode: 'passive',
      });

      const content = await fs.readFile(configPath, 'utf-8');

      // Newlines should be escaped as \n, preventing YAML injection
      expect(content).toContain('\\n');

      // The text 'injected: value' is in the output but as part of an escaped string
      // Verify that it's not interpreted as a YAML key by checking the structure
      // If injection worked, we'd see 'injected:' at the start of a line
      const lines = content.split('\n');
      const injectionLine = lines.find((line) => line.trim().startsWith('injected:'));
      expect(injectionLine).toBeUndefined();
    });

    it('should escape backslashes in URL', async () => {
      const maliciousUrl = 'https://example.com/path\\with\\backslashes';

      const configPath = await generateZapConfig({
        targetUrl: maliciousUrl,
        outputDir: testOutputDir,
        scanMode: 'passive',
      });

      const content = await fs.readFile(configPath, 'utf-8');

      // Backslashes should be escaped
      expect(content).toContain('\\\\');
    });

    it('should prevent YAML injection attempts', async () => {
      // Attempt to inject additional YAML content via newlines
      const maliciousUrl = 'https://example.com"\n    - "http://attacker.com';

      const configPath = await generateZapConfig({
        targetUrl: maliciousUrl,
        outputDir: testOutputDir,
        scanMode: 'passive',
      });

      const content = await fs.readFile(configPath, 'utf-8');

      // The injection attempt should be escaped - newlines become literal \n
      // The attacker URL is present but as part of an escaped string, not as a separate YAML entry
      expect(content).toContain('\\n');
      expect(content).toContain('\\"');

      // Count the number of URL entries in contexts - should only be 1
      const urlMatches = content.match(/^\s+- "/gm);
      // Should have exactly 2 entries: one for urls and one for includePaths
      expect(urlMatches?.length).toBe(2);
    });
  });

  describe('valid URL handling', () => {
    it('should handle normal URLs correctly', async () => {
      const normalUrl = 'https://example.com/path/to/page?query=value';

      const configPath = await generateZapConfig({
        targetUrl: normalUrl,
        outputDir: testOutputDir,
        scanMode: 'passive',
      });

      const content = await fs.readFile(configPath, 'utf-8');

      // Normal URL should appear as-is (no escaping needed)
      expect(content).toContain(normalUrl);
    });

    it('should generate valid YAML structure', async () => {
      const configPath = await generateZapConfig({
        targetUrl: 'https://example.com',
        outputDir: testOutputDir,
        scanMode: 'passive',
      });

      const content = await fs.readFile(configPath, 'utf-8');

      // Check YAML structure
      expect(content).toContain('env:');
      expect(content).toContain('contexts:');
      expect(content).toContain('jobs:');
      expect(content).toContain('spider');
      expect(content).toContain('passiveScan-wait');
    });

    it('should use correct activeScan parameter name for active mode', async () => {
      const configPath = await generateZapConfig({
        targetUrl: 'https://example.com',
        outputDir: testOutputDir,
        scanMode: 'active',
        activeScanDuration: 10,
      });

      const content = await fs.readFile(configPath, 'utf-8');

      // Active scan should use maxScanDurationInMins (not maxDuration)
      expect(content).toContain('activeScan');
      expect(content).toContain('maxScanDurationInMins: 10');
      expect(content).not.toMatch(/activeScan[\s\S]*?maxDuration:/);
    });
  });
});
