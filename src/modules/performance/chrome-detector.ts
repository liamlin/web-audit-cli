/**
 * Chrome/Chromium detection utilities.
 * Checks for Chrome availability before running Lighthouse.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import { logDebug } from '../../utils/logger.js';

/**
 * Result of Chrome detection.
 */
export interface ChromeDetectionResult {
  installed: boolean;
  path?: string;
  version?: string;
  error?: string;
}

/**
 * Find Chrome executable path across different platforms.
 */
function findChromePath(): string | undefined {
  const paths: string[] = [];

  if (process.platform === 'darwin') {
    // macOS paths
    paths.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    );
  } else if (process.platform === 'win32') {
    // Windows paths
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData =
      process.env['LOCALAPPDATA'] || `${process.env['USERPROFILE']}\\AppData\\Local`;

    paths.push(
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`
    );
  } else {
    // Linux - try 'which' command first
    try {
      const chromePath = execSync(
        'which google-chrome || which chromium-browser || which chromium 2>/dev/null',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      if (chromePath) {
        return chromePath;
      }
    } catch {
      // Ignore errors from 'which' command
    }

    // Fallback to common Linux paths
    paths.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium'
    );
  }

  // Check each path
  for (const chromePath of paths) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }

  return undefined;
}

/**
 * Get Chrome version from the executable.
 */
function getChromeVersion(chromePath: string): string | undefined {
  try {
    if (process.platform === 'win32') {
      const result = execSync(`"${chromePath}" --version`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      return result.replace('Google Chrome ', '').trim();
    } else {
      const result = execSync(`"${chromePath}" --version`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      // Output is like "Google Chrome 120.0.6099.109" or "Chromium 120.0.6099.109"
      const match = result.match(/[\d.]+/);
      return match ? match[0] : undefined;
    }
  } catch {
    return undefined;
  }
}

/**
 * Check if Chrome/Chromium is installed and available.
 * Returns detection result with path and version if found.
 */
export async function checkChromeInstalled(): Promise<ChromeDetectionResult> {
  logDebug('Checking for Chrome/Chromium installation...');

  const chromePath = findChromePath();

  if (!chromePath) {
    return {
      installed: false,
      error: 'Chrome/Chromium not found. Please install Google Chrome or Chromium.',
    };
  }

  logDebug(`Found Chrome at: ${chromePath}`);

  const version = getChromeVersion(chromePath);
  if (version) {
    logDebug(`Chrome version: ${version}`);
  }

  const result: ChromeDetectionResult = {
    installed: true,
    path: chromePath,
  };
  if (version) {
    result.version = version;
  }

  return result;
}

/**
 * Get a user-friendly installation instruction based on platform.
 */
export function getChromeInstallInstructions(): string {
  switch (process.platform) {
    case 'darwin':
      return 'Install Chrome: brew install --cask google-chrome';
    case 'win32':
      return 'Install Chrome: Download from https://www.google.com/chrome/';
    default:
      return 'Install Chrome: sudo apt install google-chrome-stable (Debian/Ubuntu) or sudo dnf install google-chrome-stable (Fedora)';
  }
}
