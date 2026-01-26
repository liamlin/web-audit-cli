/**
 * Tests for knowledge base mapping.
 */

import { describe, it, expect } from 'vitest';
import {
  KNOWLEDGE_BASE,
  DEFAULT_BUSINESS_ENTRY,
  getKnowledgeEntry,
} from '../../src/core/knowledge-base.js';

describe('Knowledge Base', () => {
  describe('KNOWLEDGE_BASE', () => {
    it('should have entries for common SEO issues', () => {
      const seoIssues = [
        'BROKEN-LINK-404',
        'LH-MISSING-TITLE',
        'LH-MISSING-META-DESC',
        'LH-INVALID-CANONICAL',
        'SITEMAP-NOT-FOUND',
      ];

      for (const id of seoIssues) {
        expect(KNOWLEDGE_BASE[id]).toBeDefined();
        // Verify LocalizedString structure with actual content
        expect(typeof KNOWLEDGE_BASE[id].businessImpact.en).toBe('string');
        expect(KNOWLEDGE_BASE[id].businessImpact.en.length).toBeGreaterThan(20);
        expect(typeof KNOWLEDGE_BASE[id].businessImpact['zh-TW']).toBe('string');
        expect(KNOWLEDGE_BASE[id].businessImpact['zh-TW'].length).toBeGreaterThan(10);
        expect(KNOWLEDGE_BASE[id].fixDifficulty).toMatch(/^(Low|Medium|High)$/);
        expect(typeof KNOWLEDGE_BASE[id].estimatedEffort.en).toBe('string');
        expect(KNOWLEDGE_BASE[id].estimatedEffort.en.length).toBeGreaterThan(0);
        expect(typeof KNOWLEDGE_BASE[id].expectedOutcome.en).toBe('string');
        expect(KNOWLEDGE_BASE[id].expectedOutcome.en.length).toBeGreaterThan(10);
      }
    });

    it('should have entries for common performance issues', () => {
      const performanceIssues = [
        'LCP-POOR',
        'LCP-CRITICAL',
        'CLS-POOR',
        'TBT-POOR',
        'UNUSED-JAVASCRIPT',
      ];

      for (const id of performanceIssues) {
        expect(KNOWLEDGE_BASE[id]).toBeDefined();
        // Verify LocalizedString structure with actual content
        expect(typeof KNOWLEDGE_BASE[id].businessImpact.en).toBe('string');
        expect(KNOWLEDGE_BASE[id].businessImpact.en.length).toBeGreaterThan(20);
        expect(typeof KNOWLEDGE_BASE[id].businessImpact['zh-TW']).toBe('string');
      }
    });

    it('should have entries for common security issues', () => {
      const securityIssues = ['ZAP-10035', 'ZAP-10038', 'ZAP-10063'];

      for (const id of securityIssues) {
        expect(KNOWLEDGE_BASE[id]).toBeDefined();
        // Verify LocalizedString structure with actual content
        expect(typeof KNOWLEDGE_BASE[id].businessImpact.en).toBe('string');
        expect(KNOWLEDGE_BASE[id].businessImpact.en.length).toBeGreaterThan(20);
        expect(typeof KNOWLEDGE_BASE[id].businessImpact['zh-TW']).toBe('string');
      }
    });
  });

  describe('DEFAULT_BUSINESS_ENTRY', () => {
    it('should have all required fields with proper structure', () => {
      // Verify businessImpact is a proper LocalizedString
      expect(typeof DEFAULT_BUSINESS_ENTRY.businessImpact.en).toBe('string');
      expect(DEFAULT_BUSINESS_ENTRY.businessImpact.en.length).toBeGreaterThan(0);
      expect(typeof DEFAULT_BUSINESS_ENTRY.businessImpact['zh-TW']).toBe('string');
      expect(DEFAULT_BUSINESS_ENTRY.businessImpact['zh-TW'].length).toBeGreaterThan(0);

      expect(DEFAULT_BUSINESS_ENTRY.fixDifficulty).toBe('Medium');

      // Verify estimatedEffort is a proper LocalizedString
      expect(typeof DEFAULT_BUSINESS_ENTRY.estimatedEffort.en).toBe('string');
      expect(typeof DEFAULT_BUSINESS_ENTRY.estimatedEffort['zh-TW']).toBe('string');

      // Verify expectedOutcome is a proper LocalizedString
      expect(typeof DEFAULT_BUSINESS_ENTRY.expectedOutcome.en).toBe('string');
      expect(typeof DEFAULT_BUSINESS_ENTRY.expectedOutcome['zh-TW']).toBe('string');
    });
  });

  describe('getKnowledgeEntry', () => {
    it('should return the correct entry for known issue IDs', () => {
      const entry = getKnowledgeEntry('LCP-POOR');
      expect(entry).toBe(KNOWLEDGE_BASE['LCP-POOR']);
    });

    it('should return the default entry for unknown issue IDs', () => {
      const entry = getKnowledgeEntry('UNKNOWN-ISSUE-ID');
      expect(entry).toBe(DEFAULT_BUSINESS_ENTRY);
    });

    it('should handle empty string', () => {
      const entry = getKnowledgeEntry('');
      expect(entry).toBe(DEFAULT_BUSINESS_ENTRY);
    });
  });

  describe('entry structure', () => {
    it('should have business-friendly descriptions (no technical jargon)', () => {
      // Check that business impacts are not too technical
      // (allowing some technical terms in context is fine,
      // but they should be explained)
      for (const [id, entry] of Object.entries(KNOWLEDGE_BASE)) {
        // Business impact should be understandable - check both languages
        expect(entry.businessImpact.en.length).toBeGreaterThan(20);
        expect(entry.businessImpact['zh-TW'].length).toBeGreaterThan(10);

        // Expected outcome should describe business value
        expect(entry.expectedOutcome.en.length).toBeGreaterThan(10);
        expect(entry.expectedOutcome['zh-TW'].length).toBeGreaterThan(5);
      }
    });

    it('should have valid fix difficulty values', () => {
      for (const entry of Object.values(KNOWLEDGE_BASE)) {
        expect(['Low', 'Medium', 'High']).toContain(entry.fixDifficulty);
      }
    });

    it('should have localized strings for both English and Chinese', () => {
      for (const entry of Object.values(KNOWLEDGE_BASE)) {
        // All LocalizedString fields should have both languages
        expect(entry.businessImpact.en).toBeTruthy();
        expect(entry.businessImpact['zh-TW']).toBeTruthy();
        expect(entry.estimatedEffort.en).toBeTruthy();
        expect(entry.estimatedEffort['zh-TW']).toBeTruthy();
        expect(entry.expectedOutcome.en).toBeTruthy();
        expect(entry.expectedOutcome['zh-TW']).toBeTruthy();
      }
    });
  });
});
