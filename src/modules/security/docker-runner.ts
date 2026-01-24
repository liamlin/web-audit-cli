/**
 * Docker runner for OWASP ZAP.
 * Handles Docker command execution and output parsing.
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as path from 'path';
import fs from 'fs-extra';
import { logDebug } from '../../utils/logger.js';

const execPromise = promisify(exec);

/**
 * Check if Docker is installed and available.
 */
export async function checkDockerInstalled(): Promise<boolean> {
  try {
    const { stdout } = await execPromise('docker --version');
    return stdout.includes('Docker version');
  } catch {
    return false;
  }
}

/**
 * Check if Docker daemon is running.
 */
export async function checkDockerRunning(): Promise<boolean> {
  try {
    await execPromise('docker info');
    return true;
  } catch {
    return false;
  }
}

/**
 * Run OWASP ZAP in Docker with the provided config.
 */
export async function runZapDocker(
  configPath: string,
  outputDir: string,
  timeoutMs: number = 10 * 60 * 1000 // 10 minutes default
): Promise<string> {
  // Get absolute paths (cross-platform compatible)
  const absoluteOutputDir = path.resolve(process.cwd(), outputDir);
  const configFileName = path.basename(configPath);

  // Ensure output directory exists
  await fs.ensureDir(absoluteOutputDir);

  logDebug(`ZAP output directory: ${absoluteOutputDir}`);
  logDebug(`ZAP config file: ${configFileName}`);

  return new Promise((resolve, reject) => {
    const docker = spawn('docker', [
      'run',
      '--rm', // Remove container after execution
      '-v',
      `${absoluteOutputDir}:/zap/wrk/:rw`, // Volume mount
      '-t',
      'ghcr.io/zaproxy/zaproxy:stable',
      'zap.sh',
      '-cmd',
      '-autorun',
      `/zap/wrk/${configFileName}`,
    ]);

    let stdout = '';
    let stderr = '';

    docker.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      logDebug(`ZAP: ${text.trim()}`);
    });

    docker.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    docker.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        // Build helpful error message with ZAP output
        const exitCodeInfo = getZapExitCodeInfo(code);
        const lastLines = getLastLines(stdout, 20);

        let errorMsg = `ZAP exited with code ${code}`;
        if (exitCodeInfo) {
          errorMsg += ` (${exitCodeInfo})`;
        }

        // Include stderr if present
        if (stderr.trim()) {
          errorMsg += `\n\nStderr:\n${stderr.trim()}`;
        }

        // Include last lines of stdout for context (ZAP outputs diagnostics here)
        if (lastLines) {
          errorMsg += `\n\nZAP output (last 20 lines):\n${lastLines}`;
        }

        reject(new Error(errorMsg));
      }
    });

    docker.on('error', (error) => {
      reject(new Error(`Failed to start Docker: ${error.message}`));
    });

    // Timeout handling
    const timeout = setTimeout(() => {
      docker.kill();
      reject(new Error('ZAP execution timeout'));
    }, timeoutMs);

    docker.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

/**
 * Get human-readable info for common ZAP exit codes.
 */
function getZapExitCodeInfo(code: number | null): string | null {
  if (code === null) {
    return null;
  }

  const exitCodes: Record<number, string> = {
    1: 'General error - check ZAP output for details',
    2: 'Configuration or target error - target may be unreachable or config invalid',
    3: 'IO error - file access or network issue',
  };

  return exitCodes[code] || null;
}

/**
 * Get the last N lines from a string.
 */
function getLastLines(text: string, n: number): string {
  if (!text.trim()) {
    return '';
  }

  const lines = text.trim().split('\n');
  const lastLines = lines.slice(-n);
  return lastLines.join('\n');
}
