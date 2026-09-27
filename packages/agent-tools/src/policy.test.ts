import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PUBLIC_TOOL_NAMES } from '@rotaris/contracts';
import { canonicalizeHost, classify, compileHostPattern, isLocal, matchHostPattern } from './egress.js';
import {
  argumentSummary, buildPolicy, canonicalArgument, effectiveMode, evaluate, type EvaluationEnv, NETWORK_COMMAND_PATTERNS, permissionRequest, PolicyContext,
  requestSummary, resolvedPathSet, selectRequestedMode, UNRESTRICTED_POLICY, validatePolicy,
} from './policy.js';
import {
  COORDINATOR_REMOVES, DECLARATIONS, expandDeclared, grantsOn, narrow, NETWORK_CLASS, READ_ONLY_CLASS, removeUnmet, resolveToolSet, validateDeclared, withholdsOn,
} from './registry.js';
import { decompose, escalationMatcherFires, patternMatcherFires, pipeToShellMatcherFires, tokenizePattern, tokensMatch } from './scanner.js';
import { realPathOf } from './tools/fence.js';

const ROOT = 'D:/ws';
/** A stand-in for an MCP edit tool such as the code-intelligence server's, whose own name is written only in its manifest (REQ-MCP-116). */
const MCP_EDIT_TOOL = 'mcp_edit_in_file';
const env: EvaluationEnv = { attended: true, workspaceRoot: ROOT, resolvePath: (p) => (p.startsWith('D:/') ? p : `${ROOT}/${p}`), publicTool: () => true };

describe('registry (ADR-0016, REQ-TOOLS-001/004/005/006/007)', () => {
  it('declares every public name exactly once and the classes stay consistent with the declaration', () => {
    expect(Object.keys(DECLARATIONS).sort()).toEqual([...PUBLIC_TOOL_NAMES].sort());
    for (const n of READ_ONLY_CLASS) {
      expect(DECLARATIONS[n].writesWorkspaceFiles, n).toBe(false);
      expect(DECLARATIONS[n].runsCommands, n).toBe(false);
    }
    for (const n of PUBLIC_TOOL_NAMES) if (DECLARATIONS[n].writesWorkspaceFiles || DECLARATIONS[n].runsCommands) expect(READ_ONLY_CLASS.has(n), n).toBe(false);
    for (const n of NETWORK_CLASS) expect(READ_ONLY_CLASS.has(n)).toBe(true);
    expect(DECLARATIONS.git_commit).toEqual({ readsWorkspaceFiles: true, writesWorkspaceFiles: true, runsCommands: false });
  });

  it('the accessor is direction-aware: an unknown name grants nothing and withholds everything', () => {
    expect(grantsOn('terminal', 'runsCommands')).toBe(true);
    expect(grantsOn('haet', 'writesWorkspaceFiles')).toBe(true);
    expect(grantsOn('mcp__server__thing', 'readsWorkspaceFiles')).toBe(false);
    expect(withholdsOn('mcp__server__thing', 'readsWorkspaceFiles')).toBe(true);
    expect(withholdsOn('grep', 'writesWorkspaceFiles')).toBe(false);
  });

  it('REQ-TOOLS-006: four stages, each a subset, in order; coordinator_only removes exactly the five', () => {
    const declared = [...PUBLIC_TOOL_NAMES];
    const r = narrow(declared, { coordinatorOnly: true }, true);
    expect(r.removals.map((x) => x.tool).sort()).toEqual([...COORDINATOR_REMOVES].sort());
    expect(r.tools).toContain('delegate');
    expect(r.tools).toContain('grep');
    const ro = narrow(declared, { readOnly: true }, true);
    expect(new Set(ro.tools)).toEqual(new Set(READ_ONLY_CLASS));
    const allow = narrow(['read_file', 'terminal'], { runAllowList: ['read_file', 'todo'] }, true);
    expect(allow.tools).toEqual(['read_file']);
    expect(allow.ignoredAllowListNames).toEqual(['todo']);
    // the allow-list binds the orchestrator alone
    expect(narrow(['read_file', 'terminal'], { runAllowList: ['read_file'] }, false).tools).toEqual(['read_file', 'terminal']);
    // a later stage never restores
    const chained = narrow(['terminal', 'grep'], { runAllowList: ['grep'], toolRestrictions: { terminal: true } }, true);
    expect(chained.tools).toEqual(['grep']);
    expect(chained.removals).toEqual([{ tool: 'terminal', control: 'run_allow_list' }]);
  });

  it('REQ-TOOLS-005 / REQ-TOOLS-004: delegate surfaces three; unmet prerequisites remove with stable codes', () => {
    expect(expandDeclared(['delegate'])).toEqual(['delegate', 'background_output', 'wait_for_tasks']);
    const r = removeUnmet(['delegate', 'ask_questions', 'artifact_write', 'terminal', 'grep', 'fetch'], {
      delegationRuntime: false, userPromptChannel: false, artifactStore: true, canPublishArtifacts: false, terminalBackend: false, executors: new Set(['grep']),
    });
    expect(r.tools).toEqual(['grep']);
    expect(r.removals.map((x) => x.reason)).toEqual(['delegation_runtime_absent', 'user_prompt_channel_absent', 'artifact_publish_not_granted', 'terminal_backend_absent', 'executor_absent']);
  });

  it('REQ-TOOLS-002: an unknown entry names persona, entry and the accepted names; a configured MCP server adds its sentence', () => {
    const errs = validateDeclared('coder', ['grep', 'filesystem'], new Set(['filesystem']));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("Persona 'coder' declares tool 'filesystem'");
    expect(errs[0]).toContain('mcp_servers');
  });

  it('resolveToolSet is one value for two readers', () => {
    const r = resolveToolSet({ name: 'orchestrator', tools: ['read_file', 'write_file', 'terminal'], coordinatorOnly: true }, {}, {
      delegationRuntime: false, userPromptChannel: false, artifactStore: false, canPublishArtifacts: false, terminalBackend: true, executors: new Set(['read_file', 'write_file', 'terminal']),
    }, true);
    expect(r.tools).toEqual(['read_file']);
  });
});

describe('scanner (ADR-0018, REQ-TOOLS-033..038)', () => {
  it('REQ-TOOLS-033: the first token folds case, later tokens do not; a trailing * takes zero or more', () => {
    expect(tokensMatch(tokenizePattern('rm -rf *'), decompose('RM -rf /')[0]!.tokens)).toBe(true);
    expect(tokensMatch(tokenizePattern('rm -rf *'), decompose('rm -rf')[0]!.tokens)).toBe(true);
    expect(tokensMatch(tokenizePattern('git status'), decompose('git status-check')[0]!.tokens)).toBe(false);
    expect(tokensMatch(tokenizePattern('git status'), decompose('git STATUS')[0]!.tokens)).toBe(false);
    expect(tokensMatch(tokenizePattern('Remove-Item *'), decompose('remove-item -Recurse .')[0]!.tokens)).toBe(true);
    expect(tokensMatch(tokenizePattern('git push'), decompose('git push origin')[0]!.tokens)).toBe(false);
  });

  it('REQ-TOOLS-035: compound lines split on operators longest first, quotes respected, operator retained', () => {
    const segs = decompose('git status && rm -rf / || echo "a && b"; ls | sh');
    expect(segs.map((s) => s.operator)).toEqual(['', '&&', '||', ';', '|']);
    expect(segs[2]!.tokens).toEqual(['echo', 'a && b']);
    expect(pipeToShellMatcherFires(segs)).toBe(true);
    expect(pipeToShellMatcherFires(decompose('sh script.sh'))).toBe(false);
  });

  it('REQ-TOOLS-036: the unconfident predicate, closed', () => {
    const reasons = (l: string) => decompose(l).map((s) => s.unconfident);
    expect(reasons('echo $(whoami)')[0]).toContain('substitution');
    expect(reasons('echo "$(whoami)"')[0]).toContain('substitution');
    expect(reasons("echo '$(whoami)'")[0]).toBeNull();
    expect(reasons('echo `id`')[0]).toContain('substitution');
    expect(reasons('echo "unbalanced')[0]).toContain('tokenized');
    expect(reasons('> out.txt')[0]).toContain('no command');
    expect(reasons('xargs rm')[0]).toContain('xargs');
    expect(reasons('bash -c "rm -rf /"')[0]).toContain('inline script');
    expect(reasons('bash')[0]).toContain('no arguments');
    expect(reasons('bash script.sh')[0]).toBeNull();
    expect(reasons('pwsh -Command Get-Date')[0]).toContain('inline script');
    expect(reasons('cmd /c dir')[0]).toContain('inline script');
    // redirection ends the matched stream
    expect(decompose('cat a > b c')[0]!.tokens).toEqual(['cat', 'a']);
    expect(decompose('cmd 2>&1 | grep x')[0]!.tokens).toEqual(['cmd']);
  });

  it('REQ-TOOLS-037: never raises and yields at least one segment, over random input', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
    const alphabet = ['a', ' ', '"', "'", '\\', '&', '|', ';', '$', '(', ')', '`', '>', '<', '\n', '2', '-', 'x'];
    for (let i = 0; i < 2000; i += 1) {
      const len = rnd() % 24;
      let s = '';
      for (let j = 0; j < len; j += 1) s += alphabet[rnd() % alphabet.length];
      const segs = decompose(s);
      expect(segs.length).toBeGreaterThanOrEqual(1);
      for (const seg of segs) if (seg.raw.trim() !== '' && seg.tokens.length === 0) expect(escalationMatcherFires([seg])).toBe(true);
    }
    expect(decompose('')).toHaveLength(1);
    expect(decompose('&&')).toHaveLength(1);
  });

  it('REQ-TOOLS-034: an empty or untokenizable pattern is a build-time error naming the pattern', () => {
    expect(() => tokenizePattern('')).toThrow("Command pattern '' is empty");
    expect(() => tokenizePattern('rm "x')).toThrow(/is not tokenisable/);
  });

  it('REQ-TOOLS-094: one matching segment settles the line; a bare curl matches; curling does not', () => {
    const compiled = NETWORK_COMMAND_PATTERNS.map(tokenizePattern);
    expect(patternMatcherFires(compiled, decompose('date && curl https://example.com'))).toBe(true);
    expect(patternMatcherFires(compiled, decompose('curl'))).toBe(true);
    expect(patternMatcherFires(compiled, decompose('npx'))).toBe(true);
    expect(patternMatcherFires(compiled, decompose('curling'))).toBe(false);
    for (const l of ['ls -la', 'git status', 'pytest -q', 'cat notes.txt', "python -c 'print(1)'"]) expect(patternMatcherFires(compiled, decompose(l)), l).toBe(false);
  });
});

describe('egress classifier (ADR-0023, REQ-TOOLS-084..087)', () => {
  it('OQ-36: canonical host normalization is idempotent for bare hosts and IPv6', () => {
    for (const [input, expected] of [
      ['example.com:8080', 'example.com'], ['::1', '::1'],
      ['0:0:0:0:0:0:0:1', '::1'], ['[::1]:9000', '::1'],
      ['http://[2001:db8::1]:9000/x', '2001:db8::1'],
    ]) {
      expect(canonicalizeHost(input!)).toBe(expected);
      expect(canonicalizeHost(canonicalizeHost(input!))).toBe(expected);
    }
    expect(matchHostPattern('http://[::1]:9000', canonicalizeHost('::1'))).toBe(true);
  });
  it('canonicalises per REQ-SANDBOX-006 (unbracketed IPv6), lower-case, no port, no userinfo, no root dot, IDNA', () => {
    expect(canonicalizeHost('http://[::1]:9000/')).toBe('::1');
    expect(canonicalizeHost('HTTPS://User:pw@Example.COM.:8443/x')).toBe('example.com');
    expect(canonicalizeHost('bücher.example')).toBe('xn--bcher-kva.example');
    expect(canonicalizeHost('')).toBe('');
    expect(canonicalizeHost('http://')).toBe('');
  });
  it('REQ-TOOLS-085: one leading *. over whole labels; any other * errors naming the pattern', () => {
    expect(matchHostPattern('*.example.com', 'api.example.com')).toBe(true);
    expect(matchHostPattern('*.example.com', 'a.b.example.com')).toBe(true);
    expect(matchHostPattern('*.example.com', 'example.com')).toBe(false);
    expect(matchHostPattern('*.example.com', 'notexample.com')).toBe(false);
    expect(() => compileHostPattern('api.*.com')).toThrow(/api\.\*\.com/);
    expect(() => compileHostPattern('*example.com')).toThrow();
  });
  it('REQ-TOOLS-087: loopback only; private and link-local are remote; unknown is remote and denied', () => {
    for (const h of ['localhost', '127.0.0.1', '127.9.9.9', '::1', 'ip6-localhost', '::ffff:127.0.0.1']) expect(isLocal(h), h).toBe(true);
    for (const h of ['169.254.169.254', '10.0.0.1', '0.0.0.0', '::', 'example.com', '']) expect(isLocal(h), h).toBe(false);
    expect(classify({ denied: ['*.evil.com'], allowed: ['*.com'], defaultDisposition: 'ask' }, 'a.evil.com')).toBe('deny');
    expect(classify({ denied: [], allowed: ['*.com'], defaultDisposition: 'deny' }, 'a.example.com')).toBe('allow');
    expect(classify({ denied: [], allowed: [], defaultDisposition: 'ask' }, '')).toBe('deny');
  });
});

describe('policy (ADR-0017, REQ-TOOLS-011..029, 039..047)', () => {
  it('REQ-TOOLS-039/041/042/043/044: the rule ids per preset, in family order — a snapshot', () => {
    const ids = (p: string) => buildPolicy({ preset: p, workspaceRoot: ROOT }).rules.map((r) => r.id);
    expect(ids('restricted')).toEqual([
      'restricted:fetch-remote-host', 'restricted:fetch-local-host',
      'starter:deny-recursive-delete', 'starter:deny-privilege-escalation', 'starter:deny-force-push', 'starter:deny-package-publish', 'starter:deny-pipe-to-shell',
      'starter:ask-unreadable-command', 'starter:ask-history-rewrite', 'starter:ask-dependency-install', 'starter:ask-container-control',
      'restricted:network-command', 'restricted:read-outside-workspace', 'restricted:read-only-tool',
    ]);
    expect(ids('ask')).toEqual([
      'ask:fetch-remote-host', 'ask:fetch-local-host',
      'starter:deny-recursive-delete', 'starter:deny-privilege-escalation', 'starter:deny-force-push', 'starter:deny-package-publish', 'starter:deny-pipe-to-shell',
      'starter:ask-unreadable-command', 'starter:ask-history-rewrite', 'starter:ask-dependency-install', 'starter:ask-container-control',
      'ask:network-command', 'ask:read-only-tool',
    ]);
    expect(ids('autonomous')).toEqual(['starter:deny-recursive-delete', 'starter:deny-privilege-escalation', 'starter:deny-force-push', 'starter:deny-package-publish', 'starter:deny-pipe-to-shell']);
    expect(buildPolicy({ preset: 'autonomous', workspaceRoot: ROOT }).rules.every((r) => r.outcome === 'deny')).toBe(true);
    expect(buildPolicy({ preset: 'bogus', workspaceRoot: ROOT }).presetName).toBe('restricted');
    expect(buildPolicy({ preset: '', workspaceRoot: ROOT }).presetName).toBe('ask');
  });

  it('REQ-TOOLS-019: the four validity checks', () => {
    expect(() => validatePolicy({ presetName: '', defaultDecision: 'ask', rules: [] })).toThrow(/preset name is empty/);
    expect(() => validatePolicy({ presetName: 'x', defaultDecision: 'ask', rules: [{ id: '', description: '', outcome: 'ask' }] })).toThrow(/rule id is empty/);
    expect(() => validatePolicy({ presetName: 'x', defaultDecision: 'ask', rules: [{ id: 'a', description: '', outcome: 'ask' }, { id: 'a', description: '', outcome: 'deny' }] })).toThrow(/two rules/);
    expect(() => validatePolicy({ presetName: 'x', defaultDecision: 'ask', rules: [{ id: 'a', description: '', outcome: 'maybe' as never }] })).toThrow(/outcome/);
  });

  it('REQ-TOOLS-015/016/057: the facet by argument name; the two renderings never substitute', () => {
    const t = permissionRequest('terminal', 'orchestrator', { command: 'curl -H "Authorization: Bearer abc" x', timeout: 5 });
    expect(t.commandFacet).toBe('curl -H "Authorization: Bearer abc" x');
    expect(requestSummary(t)).toBe('terminal: curl -H "Authorization: Bearer ***" x');
    expect(argumentSummary(t)).toBe('');
    const w = permissionRequest('write_file', 'orchestrator', { operation: 'create', path: 'a.txt', api_key: 'zzz', content: 'x'.repeat(300) });
    expect(w.commandFacet).toBeNull();
    expect(requestSummary(w)).toBe('write_file(api_key, content, operation, path)');
    const lines = argumentSummary(w).split('\n');
    expect(lines[0]).toBe('api_key=***');
    expect(lines[1]).toHaveLength('content='.length + 241);
    expect(permissionRequest('fetch', 'p', { url: 'https://x' }).commandFacet).toBe('https://x');
    expect(permissionRequest('x', 'p', null).args).toEqual({});
  });

  it('REQ-TOOLS-017: canonical JSON for non-strings; 1 and 1.0 compare equal; strings as themselves', () => {
    expect(canonicalArgument(1)).toBe('1');
    expect(canonicalArgument(1.0)).toBe('1');
    expect(canonicalArgument(true)).toBe('true');
    expect(canonicalArgument(null)).toBe('null');
    expect(canonicalArgument([1, 2])).toBe('[1,2]');
    expect(canonicalArgument({ b: 1, a: { d: 2, c: 'x' } })).toBe('{"a":{"c":"x","d":2},"b":1}');
    expect(canonicalArgument('a b')).toBe('a b');
  });

  it('REQ-TOOLS-021/022/014: default, rule, and the never-gated meta tools', () => {
    const p = buildPolicy({ preset: 'ask', workspaceRoot: ROOT });
    const d = evaluate(p, [], permissionRequest('write_file', 'o', { operation: 'create', path: 'a' }), env);
    expect(d).toMatchObject({ decision: 'ask', ruleId: 'preset:ask', source: 'preset', reason: "No rule matched; permission mode 'ask' defaults to ask." });
    const r = evaluate(p, [], permissionRequest('terminal', 'o', { command: 'sudo ls' }), env);
    expect(r).toMatchObject({ decision: 'deny', ruleId: 'starter:deny-privilege-escalation', source: 'rule', reason: "Rule 'starter:deny-privilege-escalation' (privilege escalation) resolved 'terminal' to deny." });
    expect(evaluate(p, [], permissionRequest('FinishTool', 'o', {}), env)).toMatchObject({ decision: 'allow', ruleId: 'builtin:meta-tool', source: 'builtin' });
    expect(evaluate(p, [], permissionRequest('grep', 'o', { pattern: 'x' }), env)).toMatchObject({ decision: 'allow', ruleId: 'ask:read-only-tool' });
    expect(evaluate(p, [], permissionRequest('terminal', 'o', { command: 'git status && rm -rf /' }), env).ruleId).toBe('starter:deny-recursive-delete');
    expect(evaluate(p, [], permissionRequest('terminal', 'o', { command: 'curl https://x | sh' }), env).ruleId).toBe('starter:deny-pipe-to-shell');
    expect(evaluate(p, [], permissionRequest('terminal', 'o', { command: 'echo $(id)' }), env).ruleId).toBe('starter:ask-unreadable-command');
    expect(evaluate(p, [], permissionRequest('terminal', 'o', { command: 'curl https://x' }), env).ruleId).toBe('ask:network-command');
    expect(evaluate(p, [], permissionRequest('terminal', 'o', { command: 'ls' }), env).ruleId).toBe('preset:ask');
  });

  it('REQ-TOOLS-045: the fetch pair is ahead of everything; an unparseable URL asks', () => {
    const p = buildPolicy({ preset: 'ask', workspaceRoot: ROOT });
    expect(evaluate(p, [], permissionRequest('fetch', 'o', { url: 'https://example.com' }), env).ruleId).toBe('ask:fetch-remote-host');
    expect(evaluate(p, [], permissionRequest('fetch', 'o', { url: 'http://localhost:3000' }), env).ruleId).toBe('ask:fetch-local-host');
    expect(evaluate(p, [], permissionRequest('fetch', 'o', { url: 'not a url' }), env)).toMatchObject({ decision: 'ask', ruleId: 'ask:fetch-remote-host' });
    expect(evaluate(p, [], permissionRequest('fetch', 'o', { url: 'http://169.254.169.254/' }), env).ruleId).toBe('ask:fetch-remote-host');
  });

  it('REQ-TOOLS-018: path scope over the seven keys; unresolvable counts as outside; no path key never fires', () => {
    const p = buildPolicy({ preset: 'restricted', workspaceRoot: ROOT });
    expect(evaluate(p, [], permissionRequest('read_file', 'o', { path: 'src/a.ts' }), env).ruleId).toBe('restricted:read-only-tool');
    expect(evaluate(p, [], permissionRequest('read_file', 'o', { path: 'D:/elsewhere/a.ts' }), env).ruleId).toBe('restricted:read-outside-workspace');
    expect(evaluate(p, [], permissionRequest('grep', 'o', { paths: ['src', 'D:/elsewhere'] }), env).ruleId).toBe('restricted:read-outside-workspace');
    const unresolvable: EvaluationEnv = { ...env, resolvePath: (x) => (x === ROOT ? ROOT : null) };
    expect(evaluate(p, [], permissionRequest('read_file', 'o', { path: 'src/a.ts' }), unresolvable).ruleId).toBe('restricted:read-outside-workspace');
    expect(evaluate(p, [], permissionRequest('read_file', 'o', { offset: 1 }), env).ruleId).toBe('restricted:read-only-tool');
    // REQ-TOOLS-044: autonomous never carries a path-scoped ask
    expect(evaluate(buildPolicy({ preset: 'autonomous', workspaceRoot: ROOT }), [], permissionRequest('read_file', 'o', { path: 'D:/elsewhere' }), env).decision).toBe('allow');
  });

  it('REQ-TOOLS-023/024/025: session approvals first, most recent first, exact facet or exact args, surviving replacement', () => {
    const ctx = new PolicyContext(buildPolicy({ preset: 'ask', workspaceRoot: ROOT }));
    const push = permissionRequest('terminal', 'o', { command: 'git push origin main' });
    const before = ctx.evaluate(push, env);
    expect(before).toMatchObject({ decision: 'ask', ruleId: 'ask:network-command' });
    const a = ctx.grant(push, env);
    expect(a.id).toBe('session:allow:1');
    expect(a.description).toBe('Approved for this session: terminal: git push origin main');
    expect(ctx.evaluate(push, env)).toMatchObject({ decision: 'allow', ruleId: 'session:allow:1', source: 'session-rule' });
    expect(ctx.evaluate(permissionRequest('terminal', 'o', { command: 'git push origin release' }), env).decision).toBe('ask');
    expect(ctx.evaluate(permissionRequest('terminal', 'other', { command: 'git push origin main' }), env).decision).toBe('ask');
    expect(ctx.evaluate(permissionRequest('TERMINAL', 'o', { command: 'git push origin main' }), env).decision).toBe('allow');
    // The exact argument set, on a tool REQ-TOOLS-024 still governs alone (an MCP edit tool): until PD-TOOLS-004 this was `write_file`.
    const w = permissionRequest(MCP_EDIT_TOOL, 'o', { operation: 'create', path: 'a', n: 1 });
    ctx.grant(w, env);
    expect(ctx.evaluate(permissionRequest(MCP_EDIT_TOOL, 'o', { path: 'a', operation: 'create', n: 1.0 }), env).ruleId).toBe('session:allow:2');
    expect(ctx.evaluate(permissionRequest(MCP_EDIT_TOOL, 'o', { path: 'a', operation: 'create', n: 1, extra: true }), env).decision).toBe('ask');
    ctx.replace(buildPolicy({ preset: 'restricted', workspaceRoot: ROOT }));
    expect(ctx.evaluate(push, env).ruleId).toBe('session:allow:1');
    expect(ctx.evaluate(permissionRequest('terminal', 'o', { command: 'curl x' }), env)).toMatchObject({ decision: 'deny', ruleId: 'restricted:network-command' });
  });

  it('REQ-TOOLS-020: fail-closed on any exception — ask attended, deny unattended, never allow', () => {
    const broken = { presetName: 'ask', defaultDecision: 'ask' as const, rules: [{ id: 'x', description: 'boom', outcome: 'allow' as const, command: { kind: 'pattern' as const, compiled: (null as unknown as string[][]) } }] };
    const req = permissionRequest('terminal', 'o', { command: 'ls' });
    expect(evaluate(broken, [], req, env)).toMatchObject({ decision: 'ask', ruleId: 'failclosed:unresolvable-policy', source: 'fail-closed' });
    expect(evaluate(broken, [], req, { ...env, attended: false }).decision).toBe('deny');
    expect(evaluate(broken, [], req, env).reason).toMatch(/^The permission policy could not be resolved \(.*\); failing closed to ask\.$/);
    const invalid = { presetName: '', defaultDecision: 'allow' as const, rules: [] };
    expect(evaluate(invalid, [], req, env).decision).not.toBe('allow');
  });

  it('REQ-TOOLS-029: the unrestricted default allows with its own preset name', () => {
    expect(evaluate(UNRESTRICTED_POLICY, [], permissionRequest('terminal', 'o', { command: 'rm -rf /' }), env)).toMatchObject({ decision: 'allow', ruleId: 'preset:unrestricted' });
  });

  it('PD-TOOLS-002 (was REQ-TOOLS-048/067/068): mode selection; the requested mode always applies — no downgrade', () => {
    expect(selectRequestedMode({ pin: 'restricted', override: 'autonomous' })).toBe('restricted');
    expect(selectRequestedMode({ pin: 'autonomous', override: 'ask' })).toBe('ask');
    expect(selectRequestedMode({ runtime: '' })).toBe('ask');
    expect(effectiveMode({ requested: 'autonomous', attended: false, sandboxed: false, allowUnsandboxedAutonomous: false })).toMatchObject({ effective: 'autonomous', downgraded: false, reason: '' });
    expect(effectiveMode({ requested: 'autonomous', attended: true, sandboxed: false, allowUnsandboxedAutonomous: false }).downgraded).toBe(false);
    expect(effectiveMode({ requested: 'autonomous', attended: false, sandboxed: false, allowUnsandboxedAutonomous: true }).downgraded).toBe(false);
    expect(effectiveMode({ requested: 'ask', attended: false, sandboxed: false, allowUnsandboxedAutonomous: false }).downgraded).toBe(false);
  });
});

describe('PD-TOOLS-004: a session approval of a file write covers that path (narrows REQ-TOOLS-024)', () => {
  let ws: string;
  let fsEnv: EvaluationEnv;
  const HASH_1 = '1'.repeat(64);
  const HASH_2 = '2'.repeat(64);
  beforeEach(() => {
    ws = realPathOf(mkdtempSync(join(tmpdir(), 'pd-tools-004-')));
    mkdirSync(join(ws, 'specs'));
    writeFileSync(join(ws, 'specs', 'index.md'), 'x\n');
    writeFileSync(join(ws, 'specs', 'other.md'), 'y\n');
    // The production resolver (run-host/tools.ts): the real path, a throw read as unresolvable.
    fsEnv = { attended: true, workspaceRoot: ws, resolvePath: (p) => { try { return realPathOf(p); } catch { return null; } }, publicTool: () => true };
  });
  afterEach(() => rmSync(ws, { recursive: true, force: true }));
  const ctxOf = () => new PolicyContext(buildPolicy({ preset: 'ask', workspaceRoot: ws }));
  const edit = (tool: string, persona: string, args: Record<string, unknown>) => permissionRequest(tool, persona, args);

  it('the retry loop of the defect: one approval covers a retry with a different old_string and hash', () => {
    const ctx = ctxOf();
    const first = edit('haet_edit', 'o', { path: 'specs/index.md', content_hash: HASH_1, old_string: 'a (b', new_string: 'c' });
    expect(ctx.evaluate(first, fsEnv).decision).toBe('ask');
    const a = ctx.grant(first, fsEnv);
    expect(a.paths).toEqual([join(ws, 'specs', 'index.md')]);
    expect(a.description).toBe('Approved for this session: haet_edit(content_hash, new_string, old_string, path)');
    const retry = edit('haet_edit', 'o', { path: 'specs/index.md', content_hash: HASH_2, old_string: 'a', new_string: 'c', replace_all: true });
    expect(ctx.evaluate(retry, fsEnv)).toMatchObject({ decision: 'allow', ruleId: 'session:allow:1', source: 'session-rule' });
    expect(ctx.evaluate(retry, fsEnv).reason).toBe(`Rule 'session:allow:1' (Approved for this session: haet_edit(content_hash, new_string, old_string, path)) resolved 'haet_edit' to allow.`);
  });

  it('the write_file operation is not part of the match: an edit approval covers overwrite, insert and undo of the same path', () => {
    const ctx = ctxOf();
    ctx.grant(edit('write_file', 'o', { operation: 'edit', path: 'specs/index.md', old_string: 'x', new_string: 'z' }), fsEnv);
    for (const later of [
      { operation: 'overwrite', path: 'specs/index.md', content: 'whole file' },
      { operation: 'insert', path: 'specs/index.md', insert_line: 0, new_string: 'top' },
      { operation: 'undo', path: 'specs/index.md' },
      // the same set of paths, spelled another way
      { operation: 'undo', path: './specs/../specs/index.md' },
      { operation: 'undo', path: join(ws, 'specs', 'index.md') },
      { operation: 'undo', file_path: 'specs/index.md' },
      { operation: 'undo', path: 'specs/index.md', file_path: 'specs/index.md' },
    ]) expect(ctx.evaluate(edit('write_file', 'o', later), fsEnv).ruleId, JSON.stringify(later)).toBe('session:allow:1');
  });

  it('a different path, persona or tool is not covered', () => {
    const ctx = ctxOf();
    ctx.grant(edit('write_file', 'o', { operation: 'edit', path: 'specs/index.md', old_string: 'x', new_string: 'z' }), fsEnv);
    expect(ctx.evaluate(edit('write_file', 'o', { operation: 'edit', path: 'specs/other.md', old_string: 'x', new_string: 'z' }), fsEnv).decision).toBe('ask');
    expect(ctx.evaluate(edit('write_file', 'o', { operation: 'create', path: 'specs/new.md', content: 'n' }), fsEnv).decision).toBe('ask');
    expect(ctx.evaluate(edit('write_file', 'other', { operation: 'edit', path: 'specs/index.md', old_string: 'x', new_string: 'z' }), fsEnv).decision).toBe('ask');
    expect(ctx.evaluate(edit('haet_edit', 'o', { path: 'specs/index.md', content_hash: HASH_1, old_string: 'x', new_string: 'z' }), fsEnv).decision).toBe('ask');
    // REQ-TOOLS-024's case-insensitive tool name still holds
    expect(ctx.evaluate(edit('WRITE_FILE', 'o', { operation: 'undo', path: 'specs/index.md' }), fsEnv).ruleId).toBe('session:allow:1');
  });

  it('exactly the same set: a superset or a subset of the approved paths is not covered', () => {
    const ctx = ctxOf();
    ctx.grant(edit('write_file', 'o', { operation: 'edit', path: 'specs/index.md', file_path: 'specs/other.md' }), fsEnv);
    expect(ctx.evaluate(edit('write_file', 'o', { operation: 'undo', path: 'specs/other.md', file_path: 'specs/index.md' }), fsEnv).ruleId).toBe('session:allow:1');
    expect(ctx.evaluate(edit('write_file', 'o', { operation: 'undo', path: 'specs/index.md' }), fsEnv).decision).toBe('ask');
    expect(ctx.evaluate(edit('write_file', 'o', { operation: 'undo', path: 'specs/index.md', paths: ['specs/other.md', 'specs/new.md'] }), fsEnv).decision).toBe('ask');
    const one = ctxOf();
    one.grant(edit('write_file', 'o', { operation: 'edit', path: 'specs/index.md' }), fsEnv);
    expect(one.evaluate(edit('write_file', 'o', { operation: 'edit', path: 'specs/index.md', paths: ['specs/other.md'] }), fsEnv).decision).toBe('ask');
    expect(one.evaluate(edit('write_file', 'o', { operation: 'edit', path: 'specs/index.md', paths: ['specs/index.md'] }), fsEnv).ruleId).toBe('session:allow:1');
  });

  it('an unresolvable path never matches, on either side of the grant', () => {
    const ctx = ctxOf();
    const blind: EvaluationEnv = { ...fsEnv, resolvePath: (p) => (p.endsWith('lost.md') ? null : fsEnv.resolvePath(p)) };
    ctx.grant(edit('write_file', 'o', { operation: 'edit', path: 'specs/index.md' }), blind);
    expect(ctx.evaluate(edit('write_file', 'o', { operation: 'edit', path: 'specs/index.md', file_path: 'specs/lost.md' }), blind).decision).toBe('ask');
    expect(ctx.evaluate(edit('write_file', 'o', { operation: 'edit', path: 42 }), blind).decision).toBe('ask');
    expect(ctx.evaluate(edit('write_file', 'o', { operation: 'edit', path: 'specs/index.md', paths: ['specs/index.md', 7] }), blind).decision).toBe('ask');
    const throwing: EvaluationEnv = { ...fsEnv, resolvePath: () => { throw new Error('EACCES'); } };
    expect(ctx.evaluate(edit('write_file', 'o', { operation: 'edit', path: 'specs/index.md' }), throwing).decision).toBe('ask');
    // an approval whose own path did not resolve covers nothing — not even the identical call
    const lost = ctxOf();
    const lostCall = edit('write_file', 'o', { operation: 'edit', path: 'specs/lost.md' });
    expect(lost.grant(lostCall, blind).paths).toBe('unresolvable');
    expect(lost.evaluate(lostCall, blind).decision).toBe('ask');
    expect(resolvedPathSet({ path: null }, fsEnv)).toBe('unresolvable');
  });

  it('a call carrying no path key falls back to the exact argument set of REQ-TOOLS-024', () => {
    const ctx = ctxOf();
    const bare = edit('write_file', 'o', { operation: 'undo', content: 'c' });
    expect(ctx.grant(bare, fsEnv).paths).toBeNull();
    expect(ctx.evaluate(edit('write_file', 'o', { content: 'c', operation: 'undo' }), fsEnv).ruleId).toBe('session:allow:1');
    expect(ctx.evaluate(edit('write_file', 'o', { operation: 'undo', content: 'd' }), fsEnv).decision).toBe('ask');
    expect(ctx.evaluate(edit('write_file', 'o', { operation: 'undo', content: 'c', path: 'specs/index.md' }), fsEnv).decision).toBe('ask');
    const pathed = ctxOf();
    pathed.grant(edit('write_file', 'o', { operation: 'edit', path: 'specs/index.md' }), fsEnv);
    expect(pathed.evaluate(edit('write_file', 'o', { operation: 'undo' }), fsEnv).decision).toBe('ask');
  });

  it('the alias haet counts as haet_edit, in either direction and in any case', () => {
    const ctx = ctxOf();
    ctx.grant(edit('haet', 'o', { path: 'specs/index.md', content_hash: HASH_1, old_string: 'a', new_string: 'b' }), fsEnv);
    for (const tool of ['haet', 'haet_edit', 'HAET_EDIT', 'Haet']) {
      expect(ctx.evaluate(edit(tool, 'o', { path: 'specs/index.md', content_hash: HASH_2, old_string: 'q', new_string: 'r' }), fsEnv).ruleId, tool).toBe('session:allow:1');
    }
    const other = ctxOf();
    other.grant(edit('haet_edit', 'o', { file_path: 'specs/index.md', content_hash: HASH_1, old_string: 'a', new_string: 'b' }), fsEnv);
    expect(other.evaluate(edit('haet', 'o', { path: 'specs/index.md', content_hash: HASH_2, old_string: 'q', new_string: 'r' }), fsEnv).ruleId).toBe('session:allow:1');
    expect(other.evaluate(edit('write_file', 'o', { operation: 'edit', path: 'specs/index.md' }), fsEnv).decision).toBe('ask');
  });

  it('the paths are resolved when the grant is made: a link to the file matches, a link retargeted later does not', () => {
    let linked = true;
    try { symlinkSync(join(ws, 'specs', 'index.md'), join(ws, 'link.md')); } catch { linked = false; }
    if (!linked) return; // a host that may not create links has nothing to show here
    const ctx = ctxOf();
    ctx.grant(edit('write_file', 'o', { operation: 'edit', path: 'link.md' }), fsEnv);
    expect(ctx.evaluate(edit('write_file', 'o', { operation: 'edit', path: 'specs/index.md' }), fsEnv).ruleId).toBe('session:allow:1');
    unlinkSync(join(ws, 'link.md'));
    symlinkSync(join(ws, 'specs', 'other.md'), join(ws, 'link.md'));
    expect(ctx.evaluate(edit('write_file', 'o', { operation: 'edit', path: 'link.md' }), fsEnv).decision).toBe('ask');
  });

  it('every other tool keeps REQ-TOOLS-024: an MCP edit tool, git_commit and terminal are matched exactly, and grants outlive replacement', () => {
    const ctx = ctxOf();
    ctx.grant(edit(MCP_EDIT_TOOL, 'o', { relative_path: 'specs/index.md', needle: 'a (b', repl: 'c', mode: 'literal' }), fsEnv);
    expect(ctx.evaluate(edit(MCP_EDIT_TOOL, 'o', { relative_path: 'specs/index.md', needle: 'a', repl: 'c', mode: 'literal' }), fsEnv).decision).toBe('ask');
    ctx.grant(edit('git_commit', 'o', { message: 'one', paths: ['specs/index.md'] }), fsEnv);
    expect(ctx.evaluate(edit('git_commit', 'o', { message: 'two', paths: ['specs/index.md'] }), fsEnv).decision).toBe('ask');
    expect(ctx.evaluate(edit('git_commit', 'o', { message: 'one', paths: ['specs/index.md'] }), fsEnv).ruleId).toBe('session:allow:2');
    ctx.grant(edit('terminal', 'o', { command: 'cat specs/index.md', path: 'specs/index.md' }), fsEnv);
    expect(ctx.evaluate(edit('terminal', 'o', { command: 'rm specs/index.md', path: 'specs/index.md' }), fsEnv).decision).toBe('ask');
    ctx.grant(edit('write_file', 'o', { operation: 'edit', path: 'specs/index.md' }), fsEnv);
    ctx.replace(buildPolicy({ preset: 'restricted', workspaceRoot: ws }));
    expect(ctx.evaluate(edit('write_file', 'o', { operation: 'overwrite', path: 'specs/index.md', content: 'n' }), fsEnv).ruleId).toBe('session:allow:4');
    expect(ctx.evaluate(edit('write_file', 'o', { operation: 'overwrite', path: 'specs/other.md', content: 'n' }), fsEnv).ruleId).toBe('preset:restricted');
  });

  it('an MCP tool offered under a public name keeps REQ-TOOLS-024: only the public write_file and haet_edit are scoped by path', () => {
    // A filesystem-style server's own `write_file`, offered as plain `write_file` to a persona whose public set lacks one.
    const mcpWrite: EvaluationEnv = { ...fsEnv, publicTool: (name) => name.toLowerCase() !== 'write_file' };
    const ctx = ctxOf();
    const first = edit('write_file', 'o', { path: 'specs/index.md', content: 'one' });
    expect(ctx.grant(first, mcpWrite).paths).toBeNull();
    expect(ctx.evaluate(edit('write_file', 'o', { path: 'specs/index.md', content: 'two' }), mcpWrite).decision).toBe('ask');
    expect(ctx.evaluate(edit('write_file', 'o', { content: 'one', path: 'specs/index.md' }), mcpWrite).ruleId).toBe('session:allow:1');
    // A public haet_edit grant does not reach a server's `haet` through the alias, and the server's `haet` grant is exact.
    const mcpHaet: EvaluationEnv = { ...fsEnv, publicTool: (name) => name.toLowerCase() !== 'haet' };
    const alias = ctxOf();
    expect(alias.grant(edit('haet_edit', 'o', { path: 'specs/index.md', content_hash: HASH_1, old_string: 'a', new_string: 'b' }), mcpHaet).paths).toEqual([join(ws, 'specs', 'index.md')]);
    expect(alias.evaluate(edit('haet', 'o', { path: 'specs/index.md', content_hash: HASH_2, old_string: 'q', new_string: 'r' }), mcpHaet).decision).toBe('ask');
    expect(alias.evaluate(edit('haet_edit', 'o', { path: 'specs/index.md', content_hash: HASH_2, old_string: 'q', new_string: 'r' }), mcpHaet).ruleId).toBe('session:allow:1');
    expect(alias.grant(edit('haet', 'o', { path: 'specs/index.md', content_hash: HASH_1, old_string: 'a', new_string: 'b' }), mcpHaet).paths).toBeNull();
    expect(alias.evaluate(edit('haet', 'o', { path: 'specs/index.md', content_hash: HASH_2, old_string: 'a', new_string: 'b' }), mcpHaet).decision).toBe('ask');
  });
});
