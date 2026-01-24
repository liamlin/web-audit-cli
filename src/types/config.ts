/**
 * CLI configuration schema using Zod for runtime validation.
 */

import { z } from 'zod';
import * as path from 'path';

/**
 * Dangerous system directories that should never be used for output.
 */
const FORBIDDEN_OUTPUT_PATHS = [
  '/etc',
  '/var',
  '/usr',
  '/bin',
  '/sbin',
  '/boot',
  '/root',
  '/sys',
  '/proc',
  '/dev',
];

/**
 * Validate that a URL uses only http or https protocol.
 * Prevents file://, javascript:, and other dangerous protocols.
 */
function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Validate that an output path is not a system directory.
 * Prevents writing reports to sensitive locations.
 */
function isSafeOutputPath(outputPath: string): boolean {
  const resolved = path.resolve(outputPath);
  return !FORBIDDEN_OUTPUT_PATHS.some(
    (forbidden) => resolved === forbidden || resolved.startsWith(forbidden + '/')
  );
}

/**
 * Schema for CLI configuration options.
 * All user inputs are validated against this schema.
 */
export const CliConfigSchema = z.object({
  /** Target URL to audit (required) - must be http or https */
  url: z.string().url('Please provide a valid URL').refine(isHttpUrl, {
    message: 'URL must use http:// or https:// protocol',
  }),

  /** Output directory for reports - cannot be a system directory */
  output: z.string().default('./reports').refine(isSafeOutputPath, {
    message: 'Output directory cannot be a system directory (e.g., /etc, /var, /usr)',
  }),

  /** Which audit modules to run */
  modules: z
    .array(z.enum(['seo', 'performance', 'security']))
    .default(['seo', 'performance', 'security']),

  /** Output format(s) for the report */
  format: z.array(z.enum(['pdf', 'json', 'html'])).default(['pdf']),

  /** Maximum number of pages to crawl for SEO (1-100) */
  crawlDepth: z.number().min(1).max(100).default(50),

  /** Total timeout in seconds (60-3600) */
  timeout: z.number().min(60).max(3600).default(300),

  /** Security scan mode: passive (faster) or active (more thorough) */
  securityScanMode: z.enum(['passive', 'active']).default('passive'),

  /** Performance test mode: desktop (no throttling) or mobile-4g (throttled) */
  performanceMode: z.enum(['desktop', 'mobile-4g']).default('desktop'),

  /** Report language: zh-TW (Traditional Chinese) or en (English) */
  language: z.enum(['zh-TW', 'en']).default('en'),

  /** Enable verbose logging */
  verbose: z.boolean().default(false),

  /** Run audit modules in parallel (default: false, opt-in) */
  parallel: z.boolean().default(false),
});

/**
 * Inferred TypeScript type from the Zod schema.
 */
export type CliConfig = z.infer<typeof CliConfigSchema>;

/**
 * Partial config for input before defaults are applied.
 */
export type CliConfigInput = z.input<typeof CliConfigSchema>;
