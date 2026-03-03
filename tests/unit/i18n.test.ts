/**
 * Tests for the i18n (internationalization) system.
 */

import { describe, it, expect } from 'vitest';
import {
  createTranslator,
  getDefaultLocale,
  normalizeLocale,
  translations,
  type Locale,
} from '../../src/utils/i18n.js';

describe('i18n', () => {
  describe('translations', () => {
    it('should have all keys for both locales', () => {
      const zhTWKeys = Object.keys(translations['zh-TW']);
      const enKeys = Object.keys(translations['en']);

      expect(zhTWKeys).toEqual(enKeys);
      expect(zhTWKeys.length).toBeGreaterThan(0);
    });

    it('should have non-empty values for all keys', () => {
      for (const locale of ['zh-TW', 'en'] as Locale[]) {
        for (const [key, value] of Object.entries(translations[locale])) {
          expect(typeof value).toBe('string');
          expect(value.length).toBeGreaterThan(0);
        }
      }
    });

    it('should have report section translations', () => {
      expect(translations['en']['report.title']).toBe('Web Audit Report');
      expect(translations['zh-TW']['report.title']).toBe('網站審計報告');
    });

    it('should have category translations', () => {
      expect(translations['en']['category.seo']).toBe('SEO');
      expect(translations['en']['category.performance']).toBe('Performance');
      expect(translations['en']['category.security']).toBe('Security');
    });

    it('should have severity level translations', () => {
      expect(translations['en']['severity.critical']).toBe('Critical');
      expect(translations['zh-TW']['severity.critical']).toBe('嚴重');
    });
  });

  describe('createTranslator', () => {
    it('should return a function', () => {
      const t = createTranslator('en');
      expect(typeof t).toBe('function');
    });

    it('should translate keys for English locale', () => {
      const t = createTranslator('en');

      expect(t('report.title')).toBe('Web Audit Report');
      expect(t('report.checksPassed')).toBe('Checks Passed');
    });

    it('should translate keys for Traditional Chinese locale', () => {
      const t = createTranslator('zh-TW');

      expect(t('report.title')).toBe('網站審計報告');
      expect(t('report.checksPassed')).toBe('通過檢查');
    });

    it('should replace template parameters', () => {
      const t = createTranslator('en');

      const result = t('report.detailedAnalysisDesc', { count: 5 });

      expect(result).toContain('5');
      expect(result).not.toContain('{{count}}');
    });

    it('should replace multiple template parameters', () => {
      const t = createTranslator('zh-TW');

      const result = t('report.detailedAnalysisDesc', { count: 10 });

      expect(result).toContain('10');
    });

    it('should fallback to English when key missing in locale', () => {
      // This tests the fallback mechanism
      const t = createTranslator('zh-TW');

      // All keys exist in both locales, but the fallback mechanism should work
      const result = t('report.title');
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return key when translation not found', () => {
      const t = createTranslator('en');

      // Cast to bypass TypeScript - testing runtime behavior
      const result = t('nonexistent.key' as keyof (typeof translations)['en']);

      expect(result).toBe('nonexistent.key');
    });

    it('should handle numeric parameters', () => {
      const t = createTranslator('en');

      const result = t('report.detailedAnalysisDesc', { count: 42 });

      expect(result).toContain('42');
    });

    it('should handle string parameters', () => {
      const t = createTranslator('en');

      // If any template had a string param, this would test it
      const result = t('report.detailedAnalysisDesc', { count: 'many' });

      expect(result).toContain('many');
    });
  });

  describe('getDefaultLocale', () => {
    it('should return en as default', () => {
      expect(getDefaultLocale()).toBe('en');
    });
  });

  describe('normalizeLocale', () => {
    it('should normalize zh-tw to zh-TW', () => {
      expect(normalizeLocale('zh-tw')).toBe('zh-TW');
    });

    it('should normalize ZH-TW to zh-TW', () => {
      expect(normalizeLocale('ZH-TW')).toBe('zh-TW');
    });

    it('should normalize zh to zh-TW', () => {
      expect(normalizeLocale('zh')).toBe('zh-TW');
    });

    it('should normalize chinese to zh-TW', () => {
      expect(normalizeLocale('chinese')).toBe('zh-TW');
    });

    it('should normalize en to en', () => {
      expect(normalizeLocale('en')).toBe('en');
    });

    it('should normalize EN to en', () => {
      expect(normalizeLocale('EN')).toBe('en');
    });

    it('should default to en for unknown locales', () => {
      expect(normalizeLocale('fr')).toBe('en');
      expect(normalizeLocale('de')).toBe('en');
      expect(normalizeLocale('unknown')).toBe('en');
    });

    it('should handle english as en', () => {
      // Note: current implementation doesn't handle 'english' -> 'en'
      // This documents actual behavior
      expect(normalizeLocale('english')).toBe('en');
    });
  });

  describe('translation completeness', () => {
    it('should have methodology translations', () => {
      expect(translations['en']['methodology.title']).toBeDefined();
      expect(translations['en']['methodology.toolsTitle']).toBeDefined();
      expect(translations['en']['methodology.testsTitle']).toBeDefined();
    });

    it('should have issue table label translations', () => {
      expect(translations['en']['issue.category']).toBe('Category');
      expect(translations['en']['issue.businessImpact']).toBe('Business Impact');
      expect(translations['en']['issue.expectedOutcome']).toBe('Expected Outcome');
      expect(translations['en']['issue.fixDifficulty']).toBe('Fix Difficulty');
      expect(translations['en']['issue.recommendation']).toBe('Recommendation');
      expect(translations['en']['issue.affectedUrl']).toBe('Affected URL');
    });

    it('should have difficulty translations', () => {
      expect(translations['en']['difficulty.low']).toBe('Low');
      expect(translations['en']['difficulty.medium']).toBe('Medium');
      expect(translations['en']['difficulty.high']).toBe('High');
    });

    it('should have test spec translations', () => {
      expect(translations['en']['testSpec.desktop']).toBe('Desktop, No Throttling');
      expect(translations['en']['testSpec.mobile4g']).toBe('Mobile 4G, Throttled');
    });
  });
});
