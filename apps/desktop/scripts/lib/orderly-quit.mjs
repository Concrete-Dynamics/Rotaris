/**
 * A quit outside any window, as a proof sends one to a launch whose run holds a call in flight (PD-TOOLS-013 revision 2,
 * OQ-238): the application's own orderly quit, so the run is cut by its signal and comes to rest, and the process exits 0.
 *
 * On POSIX that is SIGTERM, which Electron answers with its quit. On Windows Node has no SIGTERM to deliver:
 * `process.kill(pid, 'SIGTERM')` is `TerminateProcess`, the process ends at once with exit 1 and no quit path runs, so
 * the cancellation the proof measures never happens. There the quit goes through the driver seam
 * (`apps/desktop/src/main/driver.ts`, present only when `ROTARIS_DRIVER` names an endpoint file at launch), whose `quit`
 * is `app.quit()` — the same quit, reached by the route Windows has. `mcp-proof`'s scenario 2c took this form first;
 * `fetch-proof`'s scenario 9 read Windows' SIGTERM as a failed quit until it did too
 * (`docs/archive/defects/fetch-proofs-cancelled-launch-reads-windows-sigterm-as-a-failed-quit.md`, AF-13 of plan hrda).
 */
import { connect } from './driver.mjs';

/**
 * How to quit one launch outside any window on `platform`.
 *
 * `env` is merged into the launch's environment (the driver's endpoint on Windows, nothing on POSIX); `send(child)` sends
 * the quit and resolves once it is sent; `failure()` is the reason it could not be sent, or null; `method` names it for
 * the proof's messages.
 * @param {{ platform?: NodeJS.Platform, endpoint: string, kill?: (pid: number, signal: NodeJS.Signals) => unknown, connectDriver?: (endpoint: string, options: { timeoutMs: number }) => Promise<{ quit(): Promise<unknown>, close(): void }>, timeoutMs?: number }} options
 */
export function orderlyQuit({ platform = process.platform, endpoint, kill = process.kill.bind(process), connectDriver = connect, timeoutMs = 5_000 }) {
  /** @type {string | null} */
  let error = null;
  if (platform === 'win32') {
    return {
      method: 'the driver orderly quit',
      env: { ROTARIS_DRIVER: endpoint },
      /** @param {{ pid?: number } | null} _child */
      send: async (_child) => {
        try {
          const driver = await connectDriver(endpoint, { timeoutMs });
          try { await driver.quit(); } finally { driver.close(); }
        } catch (cause) {
          error = cause instanceof Error ? cause.message : String(cause);
        }
      },
      failure: () => error,
    };
  }
  return {
    method: 'SIGTERM',
    env: {},
    /** @param {{ pid?: number } | null} child */
    send: async (child) => {
      try { if (child?.pid) kill(child.pid, 'SIGTERM'); } catch { /* already gone */ }
    },
    failure: () => error,
  };
}
