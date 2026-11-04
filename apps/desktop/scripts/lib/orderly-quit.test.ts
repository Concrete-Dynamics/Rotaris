/**
 * A proof's quit outside any window is the application's own on every platform (`orderly-quit.mjs`): SIGTERM on POSIX,
 * the driver's quit on Windows, where `process.kill(pid, 'SIGTERM')` is `TerminateProcess` and `fetch-proof`'s scenario 9
 * read the exit 1 as a failed quit (AF-13 of plan hrda, 2026-11-04,
 * `docs/archive/defects/fetch-proofs-cancelled-launch-reads-windows-sigterm-as-a-failed-quit.md`).
 */
import { describe, expect, it, vi } from 'vitest';
import { orderlyQuit } from './orderly-quit.mjs';

describe('a proof\'s orderly quit outside any window (PD-TOOLS-013, AF-13)', () => {
  it('on Windows it names the driver\'s endpoint at launch and quits through it, never by a signal', async () => {
    const kill = vi.fn();
    const driver = { quit: vi.fn(async () => undefined), close: vi.fn() };
    const connectDriver = vi.fn(async () => driver);
    const quit = orderlyQuit({ platform: 'win32', endpoint: 'C:/proof/cancelled.driver.json', kill, connectDriver });
    expect(quit.method).toBe('the driver orderly quit');
    expect(quit.env).toEqual({ ROTARIS_DRIVER: 'C:/proof/cancelled.driver.json' });
    await quit.send({ pid: 4242 });
    expect(connectDriver).toHaveBeenCalledWith('C:/proof/cancelled.driver.json', { timeoutMs: 5_000 });
    expect(driver.quit).toHaveBeenCalledOnce();
    expect(driver.close).toHaveBeenCalledOnce();
    expect(kill).not.toHaveBeenCalled();
    expect(quit.failure()).toBeNull();
  });

  it('on Windows a driver it cannot reach is the reason the quit was not sent, not a failed quit of the product', async () => {
    const kill = vi.fn();
    const connectDriver = vi.fn(async () => { throw new Error('no endpoint within 5000 ms'); });
    const quit = orderlyQuit({ platform: 'win32', endpoint: 'C:/proof/cancelled.driver.json', kill, connectDriver });
    await quit.send({ pid: 4242 });
    expect(quit.failure()).toBe('no endpoint within 5000 ms');
    expect(kill).not.toHaveBeenCalled();
  });

  it('on POSIX it sends SIGTERM, which Electron answers with its quit, and names no driver', async () => {
    for (const platform of ['linux', 'darwin'] as const) {
      const kill = vi.fn();
      const connectDriver = vi.fn();
      const quit = orderlyQuit({ platform, endpoint: '/proof/cancelled.driver.json', kill, connectDriver });
      expect(quit.method).toBe('SIGTERM');
      expect(quit.env).toEqual({});
      await quit.send({ pid: 4242 });
      expect(kill).toHaveBeenCalledWith(4242, 'SIGTERM');
      expect(connectDriver).not.toHaveBeenCalled();
      expect(quit.failure()).toBeNull();
    }
  });

  it('on POSIX a launch already gone is no failure', async () => {
    const kill = vi.fn(() => { throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' }); });
    const quit = orderlyQuit({ platform: 'linux', endpoint: '/proof/cancelled.driver.json', kill });
    await quit.send({ pid: 4242 });
    expect(quit.failure()).toBeNull();
    await quit.send(null);
    expect(kill).toHaveBeenCalledOnce();
  });
});
