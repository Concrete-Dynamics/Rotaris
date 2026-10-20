/**
 * The directory a driven launch runs in (`startApp`'s `cwd`). A launch with no workspace argument opens it
 * (REQ-SHELL-010 (c)), and until plan `loc1` every driven launch ran in `apps/desktop`, so `workspace-proof`'s `cold` and
 * `gone` launches and `updater-proof`'s first stage opened the checkout
 * (`docs/defects/fixed/workspace-proof-and-updater-proof-launches-with-no-workspace-argument-open-the-checkout.md`).
 *
 * Pinned against a REAL child process: `spawn` is wrapped so the launch starts Node in place of Electron, with the
 * options `startApp` chose, and that child writes the working directory it really started in beside the endpoint file
 * it was given. It writes no endpoint, so `startApp` gives up after its bound and ends it, as it ends a launch whose
 * driver never answers. No product code runs here.
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spawned = vi.hoisted(() => [] as { command: string; cwd: unknown }[]);
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  const record = `require('node:fs').writeFileSync(require('node:path').join(require('node:path').dirname(process.env.ROTARIS_DRIVER), 'cwd.txt'), process.cwd())`;
  return {
    ...original,
    spawn: (command: string, args: readonly string[], options: import('node:child_process').SpawnOptions) => {
      spawned.push({ command, cwd: options.cwd });
      return original.spawn(process.execPath, ['-e', record], options);
    },
  };
});

// @ts-expect-error — the modules are plain ESM beside the scripts that run them.
const { startApp } = await import('./driver.mjs');
// @ts-expect-error — as above.
const { app } = await import('./harness.mjs');

const cleanups: (() => void)[] = [];
afterEach(() => { while (cleanups.length > 0) cleanups.pop()!(); spawned.splice(0); });
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'driver-start-test-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
/** One directory, however each side spells it: the long, real name, and on Windows any letter case. */
const same = (path: string): string => {
  const real = realpathSync.native(path);
  return process.platform === 'win32' ? real.toLowerCase() : real;
};

/** Launch, let the driver's bound pass (the child writes no endpoint), and read where the child ran. */
async function launchedIn(options: Record<string, unknown>): Promise<string> {
  const root = join(scratch(), 'profile');
  await expect(startApp({ root, timeoutMs: 1_500, ...options })).rejects.toThrow();
  expect(spawned).toHaveLength(1);
  return readFileSync(join(root, 'cwd.txt'), 'utf8');
}

describe('startApp — the directory a driven launch runs in', () => {
  it('runs in the directory its caller names, which a launch with no workspace argument then opens', async () => {
    const own = join(scratch(), 'working-directory');
    mkdirSync(own);
    const ran = await launchedIn({ cwd: own });
    expect(same(ran)).toBe(same(own));
    expect(same(ran)).not.toBe(same(app));
  }, 20_000);

  it('runs in `apps/desktop` when its caller names none, as every launch that carries a workspace did and does', async () => {
    expect(same(await launchedIn({ workspace: join(scratch(), 'project') }))).toBe(same(app));
  }, 20_000);
});
