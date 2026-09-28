import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId } from '@rotaris/kernel';
import { SessionWriter, type HookPortContext } from '@rotaris/engine';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { createHookPort, HOOKS_LOAD_WARNING } from './hooks.js';

/**
 * `docs/defects/fixed/hook-faults-reach-only-the-session-log-at-a-level-it-drops.md`: the root passes `ctx.log` on as
 * the engine's `log` sink and writes its own account of an unresolvable set through it. Both are "the application log
 * only" (REQ-HOOKS-138, PD-MONITOR-002); the run host sends what `Sessions` hands it as a `log` event at `info`.
 */
describe('createHookPort — where its lines go (REQ-HOOKS-085/138, PD-MONITOR-002)', () => {
  let dir: string;
  let dal: StoreDal;
  const clocks = new FakeClock();
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-run-host-hooks-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
  });
  afterEach(() => { if (dal.db.open) dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  function context(workspaceRoot: string) {
    const log: string[] = [];
    const warn: string[] = [];
    const created = SessionWriter.create({ dal, sessionId: asSessionId('S1'), wall: clocks, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot, pid: 1, host: mintMachineId('0000000000000000000000000000000c'), task: 't' });
    if (!created.ok) throw new Error('create');
    const ctx: HookPortContext = { sessionId: 'S1', workspaceRoot, writer: created.value, warn: (m) => warn.push(m), log: (m) => log.push(m) };
    return { ctx, log, warn };
  }

  it('REQ-HOOKS-085: a set that cannot be resolved leaves the run with no hooks, the load warning in `trust()`, and its account on the application log — not on the warning channel', () => {
    const root = join(dir, 'ws');
    mkdirSync(join(root, '.rotaris'), { recursive: true });
    // REQ-HOOKS-012: a budget of zero is an invalid entry, so the load fails and names the path.
    writeFileSync(join(root, '.rotaris', 'agents.yaml'), 'hooks:\n  - event: pre_tool\n    command: ./check.sh\n    timeout_seconds: 0\n');
    const { ctx, log, warn } = context(root);
    const port = createHookPort(ctx, { clocks, globalDir: join(dir, 'global'), env: {} });
    expect(port.auditSnapshot()).toEqual([]);
    expect(port.trust().loadWarning).toBe(HOOKS_LOAD_WARNING);
    expect(log).toHaveLength(1);
    expect(log[0]).toContain(HOOKS_LOAD_WARNING);
    expect(log[0]).toContain('hooks.entries.0.timeout_seconds');
    expect(warn).toEqual([]);
  });

  it('REQ-HOOKS-128/138: the engine\'s `log` sink is the port\'s `log` — a stream that cannot be published to reduces to a line on the application log, and the hook still fires once', async () => {
    const root = join(dir, 'ws2');
    mkdirSync(join(root, '.rotaris'), { recursive: true });
    writeFileSync(join(root, '.rotaris', 'agents.yaml'), 'hooks:\n  - event: session_start\n    command: "node -e 0"\n');
    const { ctx, log, warn } = context(root);
    // a workspace-declared hook needs a trust decision to run; without one it is withheld, and its announcement is the engine's first publication
    const port = createHookPort(ctx, { clocks, globalDir: join(dir, 'global'), env: {} });
    expect(port.trust().withheld).toBe(1);
    // the store is closed underneath the writer, so `recordEvent` fails and the sink throws — REQ-HOOKS-128's path
    dal.db.close();
    port.announceWithheld();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatch(/^publishing the withheld announcement for hook workspace:0:session_start failed: /);
    // the id only, never the command (REQ-HOOKS-128)
    expect(log[0]).not.toContain('node -e');
    expect(warn).toEqual([]);
  });
});
