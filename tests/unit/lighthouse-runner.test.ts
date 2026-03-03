/**
 * Unit tests for the shared Lighthouse runner with mutex serialization.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { performance } from 'node:perf_hooks';

// Mock chrome-launcher
vi.mock('chrome-launcher', () => ({
  launch: vi.fn().mockResolvedValue({
    port: 9222,
    kill: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock lighthouse
vi.mock('lighthouse', () => ({
  default: vi.fn(),
}));

// Mock logger to suppress output
vi.mock('../../src/utils/logger.js', () => ({
  logDebug: vi.fn(),
}));

describe('runLighthouse', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should return result.lhr when Lighthouse succeeds', async () => {
    const mockLhr = { categories: { performance: { score: 0.9 } } };

    const lighthouse = await import('lighthouse');
    vi.mocked(lighthouse.default).mockResolvedValue({ lhr: mockLhr } as never);

    const chromeLauncher = await import('chrome-launcher');
    vi.mocked(chromeLauncher.launch).mockResolvedValue({
      port: 9222,
      kill: vi.fn().mockResolvedValue(undefined),
    } as never);

    const { runLighthouse } = await import('../../src/utils/lighthouse-runner.js');

    const result = await runLighthouse('https://example.com', {}, {});

    expect(result).toEqual(mockLhr);
  });

  it('should return null when Lighthouse returns null result', async () => {
    const lighthouse = await import('lighthouse');
    vi.mocked(lighthouse.default).mockResolvedValue(null as never);

    const chromeLauncher = await import('chrome-launcher');
    vi.mocked(chromeLauncher.launch).mockResolvedValue({
      port: 9222,
      kill: vi.fn().mockResolvedValue(undefined),
    } as never);

    const { runLighthouse } = await import('../../src/utils/lighthouse-runner.js');

    const result = await runLighthouse('https://example.com', {}, {});

    expect(result).toBeNull();
  });

  it('should always call chrome.kill() even when Lighthouse throws', async () => {
    const mockKill = vi.fn().mockResolvedValue(undefined);

    const lighthouse = await import('lighthouse');
    vi.mocked(lighthouse.default).mockRejectedValue(new Error('Lighthouse crashed'));

    const chromeLauncher = await import('chrome-launcher');
    vi.mocked(chromeLauncher.launch).mockResolvedValue({
      port: 9222,
      kill: mockKill,
    } as never);

    const { runLighthouse } = await import('../../src/utils/lighthouse-runner.js');

    await expect(runLighthouse('https://example.com', {}, {})).rejects.toThrow(
      'Lighthouse crashed'
    );

    expect(mockKill).toHaveBeenCalled();
  });

  it('should call performance.clearMarks() before each run', async () => {
    const clearMarksSpy = vi.spyOn(performance, 'clearMarks');
    const clearMeasuresSpy = vi.spyOn(performance, 'clearMeasures');

    const mockLhr = { categories: {} };

    const lighthouse = await import('lighthouse');
    vi.mocked(lighthouse.default).mockResolvedValue({ lhr: mockLhr } as never);

    const chromeLauncher = await import('chrome-launcher');
    vi.mocked(chromeLauncher.launch).mockResolvedValue({
      port: 9222,
      kill: vi.fn().mockResolvedValue(undefined),
    } as never);

    const { runLighthouse } = await import('../../src/utils/lighthouse-runner.js');

    await runLighthouse('https://example.com', {}, {});

    expect(clearMarksSpy).toHaveBeenCalled();
    expect(clearMeasuresSpy).toHaveBeenCalled();

    clearMarksSpy.mockRestore();
    clearMeasuresSpy.mockRestore();
  });

  it('should serialize concurrent calls via mutex', async () => {
    const executionOrder: string[] = [];

    const lighthouse = await import('lighthouse');
    vi.mocked(lighthouse.default).mockImplementation(async () => {
      executionOrder.push('start');
      await new Promise((r) => setTimeout(r, 50));
      executionOrder.push('end');
      return { lhr: { categories: {} } } as never;
    });

    const chromeLauncher = await import('chrome-launcher');
    vi.mocked(chromeLauncher.launch).mockResolvedValue({
      port: 9222,
      kill: vi.fn().mockResolvedValue(undefined),
    } as never);

    const { runLighthouse } = await import('../../src/utils/lighthouse-runner.js');

    // Launch two concurrent calls
    await Promise.all([
      runLighthouse('https://example.com/1', {}, {}),
      runLighthouse('https://example.com/2', {}, {}),
    ]);

    // If serialized: start, end, start, end (not start, start, end, end)
    expect(executionOrder).toEqual(['start', 'end', 'start', 'end']);
  });
});
