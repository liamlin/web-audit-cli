/**
 * Unit tests for sitemap validator.
 */

import { describe, it, expect } from 'vitest';
import { validateSitemapContent } from '../../src/modules/seo/sitemap-validator.js';

describe('Sitemap Validator', () => {
  describe('validateSitemapContent', () => {
    describe('Valid sitemaps', () => {
      it('should validate a minimal valid sitemap', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
  </url>
</urlset>`;

        const result = validateSitemapContent(xml);
        expect(result.found).toBe(true);
        expect(result.valid).toBe(true);
        expect(result.urlCount).toBe(1);
        expect(result.validationErrors).toBeUndefined();
      });

      it('should validate a sitemap with all optional fields', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/page1</loc>
    <lastmod>2024-01-15</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://example.com/page2</loc>
    <lastmod>2024-01-14T10:30:00+00:00</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>`;

        const result = validateSitemapContent(xml);
        expect(result.found).toBe(true);
        expect(result.valid).toBe(true);
        expect(result.urlCount).toBe(2);
      });

      it('should validate all changefreq values', () => {
        const changefreqs = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
        for (const freq of changefreqs) {
          const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <changefreq>${freq}</changefreq>
  </url>
</urlset>`;

          const result = validateSitemapContent(xml);
          expect(result.valid).toBe(true);
        }
      });

      it('should validate boundary priority values', () => {
        const priorities = ['0.0', '0.5', '1.0'];
        for (const priority of priorities) {
          const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <priority>${priority}</priority>
  </url>
</urlset>`;

          const result = validateSitemapContent(xml);
          expect(result.valid).toBe(true);
        }
      });
    });

    describe('Invalid sitemaps', () => {
      it('should reject invalid XML', () => {
        // fast-xml-parser throws on unclosed attributes
        const xml = '<urlset attr="unclosed>';
        const result = validateSitemapContent(xml);
        expect(result.found).toBe(true);
        expect(result.valid).toBe(false);
        expect(result.validationErrors).toBeDefined();
        expect(result.validationErrors![0]).toContain('Invalid XML');
      });

      it('should reject missing root element', () => {
        const xml = `<?xml version="1.0"?>
<wrongroot>
  <item>test</item>
</wrongroot>`;

        const result = validateSitemapContent(xml);
        expect(result.valid).toBe(false);
        expect(result.validationErrors![0]).toContain('Missing root element');
      });

      it('should reject sitemap with no URLs', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;

        const result = validateSitemapContent(xml);
        expect(result.valid).toBe(false);
        expect(result.validationErrors![0]).toContain('no URL entries');
      });

      it('should reject URL entry without loc', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <lastmod>2024-01-15</lastmod>
  </url>
</urlset>`;

        const result = validateSitemapContent(xml);
        expect(result.valid).toBe(false);
        expect(result.validationErrors![0]).toContain('Missing required <loc>');
      });

      it('should reject invalid URL in loc', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>not-a-valid-url</loc>
  </url>
</urlset>`;

        const result = validateSitemapContent(xml);
        expect(result.valid).toBe(false);
        expect(result.validationErrors![0]).toContain('Invalid URL');
      });

      it('should reject invalid date format in lastmod', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>January 15, 2024</lastmod>
  </url>
</urlset>`;

        const result = validateSitemapContent(xml);
        expect(result.valid).toBe(false);
        expect(result.validationErrors![0]).toContain('Invalid date format');
      });

      it('should reject invalid changefreq', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <changefreq>occasionally</changefreq>
  </url>
</urlset>`;

        const result = validateSitemapContent(xml);
        expect(result.valid).toBe(false);
        expect(result.validationErrors![0]).toContain('Invalid <changefreq>');
      });

      it('should reject priority out of range', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <priority>1.5</priority>
  </url>
</urlset>`;

        const result = validateSitemapContent(xml);
        expect(result.valid).toBe(false);
        expect(result.validationErrors![0]).toContain('Invalid <priority>');
      });

      it('should reject negative priority', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <priority>-0.5</priority>
  </url>
</urlset>`;

        const result = validateSitemapContent(xml);
        expect(result.valid).toBe(false);
        expect(result.validationErrors![0]).toContain('Invalid <priority>');
      });
    });

    describe('Sitemap index', () => {
      it('should validate a valid sitemap index', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap1.xml</loc>
    <lastmod>2024-01-15</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://example.com/sitemap2.xml</loc>
  </sitemap>
</sitemapindex>`;

        const result = validateSitemapContent(xml);
        expect(result.found).toBe(true);
        expect(result.valid).toBe(true);
        expect(result.isSitemapIndex).toBe(true);
        expect(result.urlCount).toBe(2);
      });

      it('should reject sitemap index without entries', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</sitemapindex>`;

        const result = validateSitemapContent(xml);
        expect(result.valid).toBe(false);
        expect(result.isSitemapIndex).toBe(true);
        expect(result.validationErrors![0]).toContain('no sitemap entries');
      });

      it('should reject sitemap index entry without loc', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <lastmod>2024-01-15</lastmod>
  </sitemap>
</sitemapindex>`;

        const result = validateSitemapContent(xml);
        expect(result.valid).toBe(false);
        expect(result.validationErrors![0]).toContain('Missing required <loc>');
      });
    });

    describe('W3C datetime formats', () => {
      it('should accept YYYY format', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2024</lastmod>
  </url>
</urlset>`;

        const result = validateSitemapContent(xml);
        expect(result.valid).toBe(true);
      });

      it('should accept YYYY-MM format', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2024-01</lastmod>
  </url>
</urlset>`;

        const result = validateSitemapContent(xml);
        expect(result.valid).toBe(true);
      });

      it('should accept YYYY-MM-DD format', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2024-01-15</lastmod>
  </url>
</urlset>`;

        const result = validateSitemapContent(xml);
        expect(result.valid).toBe(true);
      });

      it('should accept full ISO 8601 format with timezone', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2024-01-15T10:30:00+08:00</lastmod>
  </url>
</urlset>`;

        const result = validateSitemapContent(xml);
        expect(result.valid).toBe(true);
      });

      it('should accept full ISO 8601 format with Z timezone', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2024-01-15T10:30:00Z</lastmod>
  </url>
</urlset>`;

        const result = validateSitemapContent(xml);
        expect(result.valid).toBe(true);
      });
    });
  });
});
