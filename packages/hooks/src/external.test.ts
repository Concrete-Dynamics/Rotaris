import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { claudeSettingsPath, discoverClaudeCodeHooks, externalIdentity, importedEntry, mapToolMatcher } from './external.js';
import { hookMatchesCall } from './matcher.js';

describe('REQ-HOOKS-110..114 the Claude Code import', () => {
  const dirs: string[] = [];
  const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'rotaris-cc-')); dirs.push(d); return d; };
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

  it('REQ-HOOKS-110: the three read problems, and the path override', () => {
    expect(claudeSettingsPath({})).toMatch(/[\\/]\.claude[\\/]settings\.json$/);
    expect(claudeSettingsPath({ ROTARIS_CLAUDE_SETTINGS_PATH: ' C:/x/s.json ' })).toMatch(/s\.json$/);
    const d = tmp();
    expect(discoverClaudeCodeHooks(join(d, 'nope.json')).message).toBe('Claude Code global settings were not found.');
    writeFileSync(join(d, 'bad.json'), '{');
    expect(discoverClaudeCodeHooks(join(d, 'bad.json')).message).toMatch(/^Claude Code hooks could not be read: /);
    writeFileSync(join(d, 'none.json'), '{"model":"x"}');
    expect(discoverClaudeCodeHooks(join(d, 'none.json')).message).toBe('Claude Code global settings contain no hook declarations.');
  });
  it('REQ-HOOKS-111/112/113/114: mapping, unusable records kept with their explanation, determined identities', () => {
    const d = tmp();
    const p = join(d, 'settings.json');
    writeFileSync(p, JSON.stringify({ hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'guard.sh', timeout: 5 }] },
        { matcher: 'Read|Edit, Write', hooks: [{ type: 'command', command: 'note.sh' }, { type: 'prompt', prompt: 'x' }] },
        { matcher: 'Bash.*', hooks: [{ type: 'command', command: 'rx.sh' }] },
        { matcher: 'Agent', hooks: [{ type: 'command', command: 'agent.sh' }] },
        { matcher: '*', hooks: [{ type: 'command', command: '' }, { type: 'command', command: 'x', if: 'tool == y' }, { type: 'command', command: 'x', timeout: 'soon' }, { type: 'command', command: 'x', timeout: 0 }, { type: 'command', command: 'tool.exe', args: ['hook-pre', 'a b'] }] },
      ],
      SessionStart: [{ hooks: [{ type: 'command', command: 'start.sh' }] }],
      SubagentStop: [{ hooks: [{ type: 'command', command: 'sub.sh' }] }],
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'ups.sh' }] }],
    } }));
    const r = discoverClaudeCodeHooks(p);
    expect(r.message).toBe('');
    const byCmd = Object.fromEntries(r.records.map((x) => [x.command, x]));
    expect(byCmd['guard.sh']).toMatchObject({ usable: true, event: 'pre_tool', toolNames: ['terminal'], timeoutSeconds: 5, name: 'Claude Code PreToolUse' });
    expect(byCmd['note.sh']).toMatchObject({ usable: true, toolNames: ['read_file', 'haet_read', 'haet_edit', 'write_file'] });
    expect(r.records.find((x) => x.reason === 'prompt handlers are unavailable in Rotaris.')).toBeDefined();
    expect(byCmd['rx.sh']).toMatchObject({ usable: false, reason: 'Regular-expression matchers are unavailable in Rotaris.' });
    expect(byCmd['agent.sh']).toMatchObject({ usable: false, reason: "Claude Code tool selector 'Agent' has no Rotaris equivalent." });
    expect(r.records.find((x) => x.reason === 'The command handler has no command.')).toBeDefined();
    expect(r.records.find((x) => x.reason.startsWith('Claude Code `if` predicates'))).toBeDefined();
    expect(r.records.find((x) => x.reason === 'The command handler timeout is invalid.')).toBeDefined();
    expect(r.records.find((x) => x.reason === 'The command handler timeout must be positive.')).toBeDefined();
    expect(byCmd['tool.exe hook-pre "a b"']).toMatchObject({ usable: true, toolNames: [] });
    expect(byCmd['start.sh']).toMatchObject({ usable: true, event: 'session_start' });
    expect(byCmd['sub.sh']).toMatchObject({ usable: true, event: 'child_completed' });
    expect(byCmd['ups.sh']).toMatchObject({ usable: false, reason: 'The Claude Code UserPromptSubmit lifecycle event has no Rotaris equivalent.' });
    // identities: stable across rediscovery, 20 hex, distinct per position
    const again = discoverClaudeCodeHooks(p);
    expect(again.records.map((x) => x.id)).toEqual(r.records.map((x) => x.id));
    for (const x of r.records) expect(x.id).toMatch(/^claude-code:[0-9a-f]{20}$/);
    expect(new Set(r.records.map((x) => x.id)).size).toBe(r.records.length);
    const a = externalIdentity({ agent: 'claude-code', event: 'PreToolUse', groupIndex: 0, handler: { command: 'x' }, handlerIndex: 0, matcher: '', source: 's' });
    expect(externalIdentity({ agent: 'claude-code', event: 'PreToolUse', groupIndex: 1, handler: { command: 'x' }, handlerIndex: 0, matcher: '', source: 's' })).not.toBe(a);
    expect(externalIdentity({ agent: 'claude-code', event: 'PreToolUse', groupIndex: 0, handler: { command: 'x' }, handlerIndex: 0, matcher: '', source: 's' })).toBe(a);
    // REQ-HOOKS-023: the imported entry's tool-name set decides; the string matcher plays no part
    const e = importedEntry(byCmd['guard.sh']!);
    expect(e).toMatchObject({ source: 'external:claude-code', matcher: '', required: false });
    expect(hookMatchesCall(e, { toolName: 'terminal', facetText: 'ls' })).toBe(true);
    expect(hookMatchesCall(e, { toolName: 'read_file', facetText: '' })).toBe(false);
    expect(mapToolMatcher(' Bash | PowerShell ,')).toEqual({ ok: true, toolNames: ['terminal'] });
  });
});
