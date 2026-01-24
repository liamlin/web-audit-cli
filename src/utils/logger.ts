/**
 * Unified logging utilities using ora and chalk.
 */

import ora, { type Ora } from 'ora';
import chalk from 'chalk';

let currentSpinner: Ora | null = null;
let verboseMode = false;

/**
 * Set verbose mode for logging.
 */
export function setVerbose(verbose: boolean): void {
  verboseMode = verbose;
}

/**
 * Get the current spinner instance or create a new one.
 * Internal helper - not exported.
 */
function getSpinner(): Ora {
  if (!currentSpinner) {
    currentSpinner = ora();
  }
  return currentSpinner;
}

/**
 * Start a new spinner with a message.
 */
export function startSpinner(message: string): Ora {
  const spinner = getSpinner();
  spinner.start(message);
  return spinner;
}

/**
 * Mark the current spinner as succeeded.
 */
export function succeedSpinner(message: string): void {
  const spinner = getSpinner();
  spinner.succeed(chalk.green(message));
}

/**
 * Mark the current spinner with a warning.
 */
export function warnSpinner(message: string): void {
  const spinner = getSpinner();
  spinner.warn(chalk.yellow(message));
}

/**
 * Mark the current spinner as failed.
 */
export function failSpinner(message: string): void {
  const spinner = getSpinner();
  spinner.fail(chalk.red(message));
}

/**
 * Stop the spinner without any status.
 */
export function stopSpinner(): void {
  const spinner = getSpinner();
  spinner.stop();
}

/**
 * Update the spinner text without changing its state.
 */
export function updateSpinner(message: string): void {
  const spinner = getSpinner();
  if (spinner.isSpinning) {
    spinner.text = message;
  }
}

/**
 * Log an info message (only in verbose mode).
 */
export function logInfo(message: string): void {
  if (verboseMode) {
    console.log(chalk.blue('ℹ'), message);
  }
}

/**
 * Log a debug message (only in verbose mode).
 */
export function logDebug(message: string): void {
  if (verboseMode) {
    console.log(chalk.gray('→'), chalk.gray(message));
  }
}

/**
 * Log an error message.
 */
export function logError(message: string): void {
  console.error(chalk.red('✖'), message);
}

/**
 * Log a warning message.
 */
export function logWarning(message: string): void {
  console.warn(chalk.yellow('⚠'), message);
}

/**
 * Log a success message.
 */
export function logSuccess(message: string): void {
  console.log(chalk.green('✔'), message);
}

/**
 * Log module status for parallel execution (avoids spinner conflicts).
 * Uses prefixed log messages instead of a shared spinner.
 */
export function logModuleStatus(
  moduleName: string,
  status: 'running' | 'success' | 'warning' | 'failed',
  message: string
): void {
  const prefix = chalk.gray(`[${moduleName}]`);

  switch (status) {
    case 'running':
      console.log(chalk.blue('○'), prefix, message);
      break;
    case 'success':
      console.log(chalk.green('✔'), prefix, chalk.green(message));
      break;
    case 'warning':
      console.log(chalk.yellow('⚠'), prefix, chalk.yellow(message));
      break;
    case 'failed':
      console.log(chalk.red('✖'), prefix, chalk.red(message));
      break;
  }
}
