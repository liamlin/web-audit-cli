/**
 * Web-specific type definitions.
 */

import type { BusinessReport } from '../types/index.js';
import type { ProgressCallback } from '../core/orchestrator.js';

/**
 * Configuration for a web-initiated audit.
 */
export interface WebAuditConfig {
  url: string;
  modules: Array<'seo' | 'performance' | 'security'>;
  language: 'en' | 'zh-TW';
  performanceMode: 'desktop' | 'mobile-4g';
  crawlDepth: number;
  parallel: boolean;
}

/**
 * Progress event sent via SSE.
 */
export interface ProgressEvent {
  module: string;
  status: 'running' | 'complete' | 'partial' | 'skipped' | 'failed';
  message: string;
  timestamp: number;
}

/**
 * An in-flight or completed audit job.
 */
export interface AuditJob {
  id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  config: WebAuditConfig;
  createdAt: Date;
  progress: ProgressEvent[];
  result?: BusinessReport;
  htmlReport?: string;
  pdfPath?: string;
  error?: string;
}

// Re-export for convenience
export type { ProgressCallback };
