/**
 * Audit Service - In-memory job store with queue management.
 * Manages audit lifecycle: queue -> run -> complete/fail.
 * Only one audit runs at a time (Lighthouse mutex).
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import fs from 'fs-extra';
import type { AuditJob, WebAuditConfig, ProgressEvent } from '../types.js';
import { Orchestrator, type ProgressCallback } from '../../core/orchestrator.js';
import { MatrixEngine } from '../../core/matrix-engine.js';
import { ReportGenerator } from '../../modules/reporter/index.js';
import { SeoAuditor } from '../../modules/seo/index.js';
import { PerformanceAuditor } from '../../modules/performance/index.js';
import { SecurityAuditor } from '../../modules/security/index.js';
import type { CliConfig } from '../../types/index.js';
import { logDebug, logError } from '../../utils/logger.js';
import { revalidateIp } from '../../utils/ssrf-guard.js';

const MAX_QUEUE_DEPTH = 5;
const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class AuditService {
  private jobs = new Map<string, AuditJob>();
  private queue: string[] = [];
  private running = false;
  readonly events = new EventEmitter();
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Enqueue a new audit job. Returns the job ID.
   * Throws if queue is full.
   */
  enqueue(config: WebAuditConfig): string {
    if (this.queue.length >= MAX_QUEUE_DEPTH) {
      throw new Error('Audit queue is full. Please try again later.');
    }

    const id = randomUUID();
    const job: AuditJob = {
      id,
      status: 'queued',
      config,
      createdAt: new Date(),
      progress: [],
    };

    this.jobs.set(id, job);
    this.queue.push(id);
    this.processQueue();
    return id;
  }

  getJob(id: string): AuditJob | undefined {
    return this.jobs.get(id);
  }

  /**
   * Process the next job in queue if nothing is running.
   */
  private processQueue(): void {
    if (this.running || this.queue.length === 0) {
      return;
    }

    const jobId = this.queue.shift();
    if (!jobId) {
      return;
    }

    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    this.running = true;
    job.status = 'running';
    this.emitProgress(job, {
      module: 'system',
      status: 'running',
      message: 'Audit started',
      timestamp: Date.now(),
    });

    this.runAudit(job).finally(() => {
      this.running = false;
      this.processQueue();
    });
  }

  private async runAudit(job: AuditJob): Promise<void> {
    try {
      const cliConfig = this.toCliConfig(job.config);

      const onProgress: ProgressCallback = (event) => {
        const progressEvent: ProgressEvent = {
          ...event,
          timestamp: Date.now(),
        };
        job.progress.push(progressEvent);
        this.emitProgress(job, progressEvent);
      };

      // Create orchestrator with progress callback
      const orchestrator = new Orchestrator(cliConfig, onProgress);

      // Register enabled modules
      if (cliConfig.modules.includes('seo')) {
        orchestrator.registerModule('SEO', 'seo', new SeoAuditor(cliConfig));
      }
      if (cliConfig.modules.includes('performance')) {
        orchestrator.registerModule(
          'Performance',
          'performance',
          new PerformanceAuditor(cliConfig)
        );
      }
      if (cliConfig.modules.includes('security')) {
        orchestrator.registerModule('Security', 'security', new SecurityAuditor(cliConfig));
      }

      // Re-validate DNS right before running the audit to close the TOCTOU gap
      // In Electron/desktop mode, skip SSRF revalidation — the user scans their own targets
      if (!process.env['ELECTRON_MODE']) {
        const jobUrl = new URL(job.config.url);
        const revalidation = await revalidateIp(jobUrl.hostname);
        if (revalidation) {
          job.status = 'failed';
          job.error = revalidation;
          this.emitProgress(job, {
            module: 'system',
            status: 'failed',
            message: `SSRF protection: ${revalidation}`,
            timestamp: Date.now(),
          });
          return;
        }
      }

      // Run audit with timeout (audit timeout + 60s buffer for cleanup).
      // Use AbortController so that when the timeout wins the race, the
      // orchestrator stops launching new modules (cooperative cancellation).
      const timeoutMs = (cliConfig.timeout + 60) * 1000;
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, timeoutMs);

      let orchResult: Awaited<ReturnType<typeof orchestrator.runAll>>;
      try {
        orchResult = await Promise.race([
          orchestrator.runAll(cliConfig.url, abortController.signal),
          new Promise<never>((_, reject) => {
            abortController.signal.addEventListener(
              'abort',
              () => {
                reject(new Error(`Audit timed out after ${cliConfig.timeout + 60}s`));
              },
              { once: true }
            );
          }),
        ]);
      } finally {
        clearTimeout(timeoutId);
      }

      // Generate business report
      const matrixEngine = new MatrixEngine(cliConfig.language as 'en' | 'zh-TW');
      const businessReport = matrixEngine.enhanceReport(orchResult.results, orchResult.totalTimeMs);

      job.result = businessReport;

      // Generate HTML report
      const reporter = new ReportGenerator(cliConfig.language as 'en' | 'zh-TW');
      const tmpDir = path.resolve(os.tmpdir(), 'web-audit', `web-${job.id}`);
      await fs.ensureDir(tmpDir);

      const htmlPath = path.join(tmpDir, 'report.html');
      await reporter.generateHtml(businessReport, htmlPath);
      job.htmlReport = await fs.readFile(htmlPath, 'utf-8');

      // Generate PDF
      try {
        const pdfPath = path.join(tmpDir, 'report.pdf');
        await reporter.generate(businessReport, pdfPath);
        job.pdfPath = pdfPath;
      } catch (pdfErr) {
        logDebug(
          `PDF generation failed (non-fatal): ${pdfErr instanceof Error ? pdfErr.message : 'unknown'}`
        );
      }

      job.status = 'complete';
      this.emitProgress(job, {
        module: 'system',
        status: 'complete',
        message: 'Audit complete',
        timestamp: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logError(`Audit ${job.id} failed: ${message}`);
      job.status = 'failed';
      job.error = message;
      this.emitProgress(job, {
        module: 'system',
        status: 'failed',
        message: `Audit failed: ${message}`,
        timestamp: Date.now(),
      });
    }
  }

  private emitProgress(job: AuditJob, event: ProgressEvent): void {
    this.events.emit(`progress:${job.id}`, event);
  }

  private toCliConfig(config: WebAuditConfig): CliConfig {
    return {
      url: config.url,
      output: path.resolve(process.cwd(), 'tmp'),
      modules: config.modules,
      format: ['html'],
      crawlDepth: config.crawlDepth,
      timeout: 300,
      performanceMode: config.performanceMode,
      language: config.language,
      verbose: false,
      parallel: config.parallel,
    };
  }

  /**
   * Remove completed/failed jobs older than JOB_TTL_MS.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (
        (job.status === 'complete' || job.status === 'failed') &&
        now - job.createdAt.getTime() > JOB_TTL_MS
      ) {
        // Clean up temp files (derive tmpDir from job ID so cleanup works even if PDF generation failed)
        const tmpDir = path.resolve(os.tmpdir(), 'web-audit', `web-${id}`);
        fs.remove(tmpDir).catch(() => {});
        this.jobs.delete(id);
      }
    }
  }
}
