import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { commandPatternMatches, segmentCommandLine, tokenizeHookPattern } from './command-pattern.js';
import { parseConfig, triOf } from './document.js';
import { hookDisplayName, mergeHooks, readHooksSection, type HooksLayer } from './hooks-section.js';
import { loadHooksConfig } from './loader.js';

function section(text: string, scope: 'global' | 'workspace' = 'workspace') {
  const p = parseConfig(text);
  if (!p.ok) throw new Error(p.error.reason);
  return readHooksSection(p.value, scope);
}

describe('the document tree (ADR-0036 alternative B)', () => {
  it('distinguishes absent, null and value; core schema keeps on/off as strings and folds only literal booleans', () => {
    const p = parseConfig('a:\nb: on\nc: true\n');
    expect(p.ok && p.value.root !== null).toBe(true);
    if (!p.ok || !p.value.root) return;
    expect(triOf(p.value.root, 'a').kind).toBe('null');
    expect(triOf(p.value.root, 'zzz').kind).toBe('absent');
    expect(triOf(p.value.root, 'b').kind).toBe('value');
    expect(p.value.doc.get('b')).toBe('on');
    expect(p.value.doc.get('c')).toBe(true);
  });
  it('a YAML error is a parse failure; an unknown tag is not', () => {
    expect(parseConfig('a: [1\n').ok).toBe(false);
    expect(parseConfig('a: !custom x\n').ok).toBe(true);
    expect(parseConfig('a: 1\na: 2\n').ok).toBe(false);
  });
});

describe('REQ-HOOKS-025 command patterns', () => {
  it('REQ-HOOKS-026: `git push *` matches both; `git push*` matches only the bare form', () => {
    expect(commandPatternMatches('git push *', 'git push')).toBe(true);
    expect(commandPatternMatches('git push *', 'git push --force')).toBe(true);
    expect(commandPatternMatches('git push*', 'git push')).toBe(true);
    expect(commandPatternMatches('git push*', 'git push --force')).toBe(false);
  });
  it('positional, never a substring search; segments at the six separators; quotes group and are removed; backslash literal', () => {
    expect(commandPatternMatches('git push *', 'echo git push')).toBe(false);
    expect(commandPatternMatches('rm -rf /', 'git status && rm -rf /')).toBe(true);
    expect(commandPatternMatches('rm *', 'a; b | rm x')).toBe(true);
    expect(tokenizeHookPattern('copy C:\\repo\\a C:\\repo\\b')).toEqual(['copy', 'C:\\repo\\a', 'C:\\repo\\b']);
    expect(tokenizeHookPattern(`echo "a b" 'c d'`)).toEqual(['echo', 'a b', 'c d']);
    expect(tokenizeHookPattern('echo "unterminated')).toBeNull();
    expect(commandPatternMatches('git push -?', 'git push -?')).toBe(true);
    expect(commandPatternMatches('git push -?', 'git push -x')).toBe(false);
    expect(segmentCommandLine('a "b && c" && d')).toEqual(['a "b && c" ', ' d']);
  });
  it('REQ-HOOKS-028: total — an untokenizable candidate or pattern is no match, never a throw', () => {
    expect(commandPatternMatches('git *', 'git "x')).toBe(false);
    expect(commandPatternMatches('"x', 'git status')).toBe(false);
    for (let i = 0; i < 300; i += 1) {
      const junk = Array.from({ length: (i * 7) % 40 }, (_, k) => String.fromCharCode(32 + ((i * 31 + k * 17) % 95))).join('');
      expect(typeof commandPatternMatches(junk, junk)).toBe('boolean');
      expect(Array.isArray(segmentCommandLine(junk))).toBe(true);
    }
  });
});

describe('REQ-HOOKS-008..018 the hooks section', () => {
  it('defaults, trimming, ids counted with disabled entries present, source overwritten', () => {
    const r = section(`hooks:\n  entries:\n    - event: "  pre_tool "\n      command: "  ./check.sh  "\n      source: hand-written\n    - event: session_end\n      command: notify\n      enabled: false\n      name: "  "\n      matcher: " git push * "\n      timeout_seconds: 2.5\n      required: true\n    - event: post_tool\n      command: x\n`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.entries.kind).toBe('value');
    if (r.value.entries.kind !== 'value') return;
    const [a, b, c] = r.value.entries.value;
    expect(a).toMatchObject({ id: 'workspace:0:pre_tool', event: 'pre_tool', command: '  ./check.sh  ', name: '', matcher: '', timeoutSeconds: 60, required: false, enabled: true, source: 'workspace', index: 0 });
    expect(b).toMatchObject({ id: 'workspace:1:session_end', enabled: false, matcher: 'git push *', timeoutSeconds: 2.5, required: true });
    expect(hookDisplayName(b!)).toBe('workspace:1:session_end');
    expect(c!.id).toBe('workspace:2:post_tool');
  });
  it('REQ-HOOKS-010: the list shorthand is the same layer', () => {
    const r = section(`hooks:\n  - event: session_end\n    command: notify-send done\n`);
    expect(r.ok && r.value.entries.kind === 'value' && r.value.entries.value[0]!.id).toBe('workspace:0:session_end');
  });
  it('REQ-HOOKS-011: bare hooks/entries are unset; a wrong type fails with the exact message', () => {
    const bare = section('hooks:\n');
    expect(bare.ok && bare.value.entries.kind).toBe('absent');
    const bareEntries = section('hooks:\n  enabled: false\n  entries:\n');
    expect(bareEntries.ok && bareEntries.value.entries.kind).toBe('null');
    expect(bareEntries.ok && bareEntries.value.enabled).toEqual({ kind: 'value', value: false });
    const wrong = section('hooks: 3\n');
    expect(!wrong.ok && wrong.error[0]).toEqual({ path: 'hooks', message: "Invalid 'hooks' section: expected a mapping or a list of hook entries, got number" });
  });
  it('REQ-HOOKS-012: every invalid entry reported at once, in ascending index, with the exact YAML paths', () => {
    const r = section(`hooks:\n  entries:\n    - event: bogus\n      command: x\n    - event: pre_tool\n      command: "   "\n    - event: pre_tool\n      command: x\n      matcher: 'git "x'\n    - event: pre_tool\n      command: x\n      timeout_seconds: 0\n    - event: true\n      command: x\n`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.map((e) => e.path)).toEqual(['hooks.entries.0.event', 'hooks.entries.1.command', 'hooks.entries.2.matcher', 'hooks.entries.3.timeout_seconds', 'hooks.entries.4.event']);
    expect(r.error[0]!.message).toContain("'bogus'");
    expect(r.error[0]!.message).toContain('pre_tool, post_tool, session_start, session_end, iteration_end, child_completed, verifier_finished');
    expect(r.error[1]!.message).toBe("hook 'command' must not be blank");
    expect(r.error[3]!.message).toContain("'0'");
    expect(r.error[3]!.message).toContain('greater than zero');
    // REQ-CONFIG-020: the folded boolean is rejected as an unrecognised member naming the list, never as a type error.
    expect(r.error[4]!.message).toContain("'true'");
  });
  it('REQ-HOOKS-013/015/017: full-list substitution, enabled-only layers inherit, superseded kept, enabled=false empties both', () => {
    const g = section('hooks:\n  - event: session_end\n    command: g0\n  - event: pre_tool\n    command: g1\n', 'global');
    const w = section('hooks:\n  entries:\n    - event: post_tool\n      command: w0\n');
    const wEnabledOnly = section('hooks:\n  enabled: true\n');
    const off = section('hooks:\n  enabled: false\n');
    if (!g.ok || !w.ok || !wEnabledOnly.ok || !off.ok) throw new Error('setup');
    const d: HooksLayer = { scope: 'default', enabled: { kind: 'absent' }, entries: { kind: 'absent' } };
    const m1 = mergeHooks([d, g.value, w.value]);
    expect(m1.entries.map((e) => e.id)).toEqual(['workspace:0:post_tool']);
    expect(m1.superseded.map((e) => e.id)).toEqual(['global:0:session_end', 'global:1:pre_tool']);
    const m2 = mergeHooks([d, g.value, wEnabledOnly.value]);
    expect(m2.entries.map((e) => e.id)).toEqual(['global:0:session_end', 'global:1:pre_tool']);
    const m3 = mergeHooks([d, g.value, off.value]);
    expect(m3).toEqual({ enabled: false, entries: [], superseded: [] });
  });
});

describe('the loader', () => {
  const dirs: string[] = [];
  const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'rotaris-config-')); dirs.push(d); return d; };
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

  it('reads both scopes, absent files are empty layers, an unknown top-level key is carried and ignored', () => {
    const globalDir = tmp();
    const ws = tmp();
    writeFileSync(join(globalDir, 'agents.yaml'), '# my config\nsomething_new: 1\nhooks:\n  - event: session_end\n    command: notify\n');
    mkdirSync(join(ws, '.rotaris'));
    writeFileSync(join(ws, '.rotaris', 'agents.yaml'), 'hooks:\n  enabled: true\n');
    const r = loadHooksConfig({ globalDir, workspaceRoot: ws });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.entries.map((e) => e.id)).toEqual(['global:0:session_end']);
    expect(r.value.files.map((f) => f.state)).toEqual(['read', 'read']);
    const none = loadHooksConfig({ globalDir: join(globalDir, 'nope'), workspaceRoot: join(ws, 'nope') });
    expect(none.ok && none.value.entries).toEqual([]);
    expect(none.ok && none.value.files.map((f) => f.state)).toEqual(['absent', 'absent']);
  });
  it('an unparsable or invalid scope fails the load as a whole with every error named by scope and file', () => {
    const globalDir = tmp();
    const ws = tmp();
    writeFileSync(join(globalDir, 'agents.yaml'), 'hooks: [\n');
    mkdirSync(join(ws, '.rotaris'));
    writeFileSync(join(ws, '.rotaris', 'agents.yaml'), 'hooks:\n  - event: nope\n    command: x\n');
    const r = loadHooksConfig({ globalDir, workspaceRoot: ws });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.errors.map((e) => e.scope)).toEqual(['global', 'workspace']);
    expect(r.error.errors[1]!.path).toBe('hooks.entries.0.event');
  });
});
