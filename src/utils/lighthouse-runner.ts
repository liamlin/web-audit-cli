/**
 * Shared Lighthouse runner with mutex to prevent concurrent execution.
 *
 * Lighthouse uses Node.js's global performance marks internally, which causes
 * conflicts when multiple Lighthouse instances run concurrently in the same process.
 * This utility serializes Lighthouse calls to avoid the "performance mark has not been set" error.
 */

import { performance } from 'node:perf_hooks';
import lighthouse, { type Result as LighthouseResult, type Flags, type Config } from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { logDebug } from './logger.js';

/**
 * Simple mutex implementation for serializing async operations.
 */
class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

// Global mutex for Lighthouse execution
const lighthouseMutex = new Mutex();

/**
 * Run Lighthouse with automatic Chrome management and mutex protection.
 * Ensures only one Lighthouse instance runs at a time to avoid performance mark conflicts.
 */
export async function runLighthouse(
  url: string,
  flags: Flags,
  config: Config
): Promise<LighthouseResult | null> {
  await lighthouseMutex.acquire();

  let chrome: chromeLauncher.LaunchedChrome | null = null;

  try {
    logDebug('Lighthouse mutex acquired, launching Chrome...');

    chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless=new', '--disable-gpu', '--no-sandbox'],
    });

    logDebug(`Chrome launched on port ${chrome.port}`);

    // Clear any existing performance marks to ensure clean state
    performance.clearMarks();
    performance.clearMeasures();

    // Run Lighthouse
    const result = await lighthouse(
      url,
      {
        ...flags,
        port: chrome.port,
      },
      config
    );

    return result?.lhr ?? null;
  } finally {
    // CRITICAL: Always kill Chrome to prevent zombie processes
    if (chrome) {
      try {
        logDebug('Killing Chrome...');
        await chrome.kill();
      } catch (killError) {
        // Log but don't throw - we still need to release the mutex
        logDebug(`Warning: Failed to kill Chrome: ${killError}`);
      }
    }

    lighthouseMutex.release();
    logDebug('Lighthouse mutex released');
  }
}
