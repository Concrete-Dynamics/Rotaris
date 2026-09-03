import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { guardedRead } from '@rotaris/platform';
import { EXTERNAL_CLAUDE_CODE_SCOPE } from '@rotaris/contracts';
import type { HookEntry } from '@rotaris/config';
import { canonicalJson } from './trust.js';
import type { ImportedRecord } from './summary.js';

/**
 * REQ-HOOKS-110..114: discovery of the external agent's user-level hooks — read only, never written.
 * Every record stays visible with its explanation when it cannot run (REQ-HOOKS-113); a usable one
 * becomes an effective hook with scope `external:claude-code`, an empty matcher, a tool-name set and a
 * fully determined identity. These records lie outside the trust gate (REQ-HOOKS-117) and are governed
 * by the toggles of the policy file.
 */
export const CLAUDE_AGENT_ID = 'claude-code' as const;

export const EVENT_MAP: Readonly<Record<string, HookEntry['event']>> = {
  PreToolUse: 'pre_tool', PostToolUse: 'post_tool', SessionStart: 'session_start', SessionEnd: 'session_end', SubagentStop: 'child_completed',
};
export const TOOL_SELECTOR_MAP: Readonly<Record<string, readonly string[]>> = {
  Bash: ['terminal'], PowerShell: ['terminal'], Read: ['read_file', 'haet_read'], Edit: ['haet_edit'], Write: ['write_file'],
};
const REGEX_META = /[\^$.*+?[\]()\\{}]/;

export interface Discovery {
  readonly records: readonly ImportedRecord[];
  /** REQ-HOOKS-110: one of the three messages when nothing could be read; '' otherwise. */
  readonly message: string;
  readonly source: string;
}

export function claudeSettingsPath(env: Readonly<Record<string, string | undefined>>, home = homedir()): string {
  const raw = (env['ROTARIS_CLAUDE_SETTINGS_PATH'] ?? '').trim();
  return raw === '' ? join(home, '.claude', 'settings.json') : resolve(raw);
}

/** REQ-HOOKS-112: `*` or empty selects all; else `|` and `,` split selectors mapped to tool names; a regex metacharacter is unusable. */
export function mapToolMatcher(matcher: string): { readonly ok: true; readonly toolNames: readonly string[] } | { readonly ok: false; readonly reason: string } {
  const m = matcher.trim();
  if (m === '' || m === '*') return { ok: true, toolNames: [] };
  if (REGEX_META.test(m)) return { ok: false, reason: 'Regular-expression matchers are unavailable in Rotaris.' };
  const names = new Set<string>();
  for (const sel of m.split(/[|,]/)) {
    const s = sel.trim();
    if (s === '') continue;
    const mapped = TOOL_SELECTOR_MAP[s];
    if (mapped === undefined) return { ok: false, reason: `Claude Code tool selector '${s}' has no Rotaris equivalent.` };
    for (const n of mapped) names.add(n);
  }
  return { ok: true, toolNames: [...names] };
}

/** REQ-HOOKS-114: `claude-code:` + 20 hex of SHA-256 over the canonical identity document. */
export function externalIdentity(facets: { agent: string; event: string; groupIndex: number; handler: unknown; handlerIndex: number; matcher: string; source: string }): string {
  const doc = { agent: facets.agent, event: facets.event, group_index: facets.groupIndex, handler: facets.handler, handler_index: facets.handlerIndex, matcher: facets.matcher, source: facets.source };
  return `${CLAUDE_AGENT_ID}:${createHash('sha256').update(canonicalJson(doc), 'utf8').digest('hex').slice(0, 20)}`;
}

/** The command line as declared; an `args` list the external format allows is appended, each argument quoted when it carries whitespace. */
function commandOf(handler: Record<string, unknown>): string {
  const cmd = typeof handler['command'] === 'string' ? handler['command'] : '';
  const args = Array.isArray(handler['args']) ? handler['args'].filter((a): a is string => typeof a === 'string') : [];
  return [cmd, ...args.map((a) => (/\s/.test(a) ? `"${a}"` : a))].join(' ').trim();
}

export function discoverClaudeCodeHooks(path: string): Discovery {
  const outcome = guardedRead(path, (raw) => JSON.parse(raw) as unknown);
  if (outcome.state === 'absent') return { records: [], message: 'Claude Code global settings were not found.', source: path };
  if (outcome.state === 'unreadable') return { records: [], message: `Claude Code hooks could not be read: ${outcome.reason}`, source: path };
  const v = outcome.value;
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return { records: [], message: 'Claude Code hooks could not be read: the settings are not a JSON object', source: path };
  const hooks = (v as Record<string, unknown>)['hooks'];
  if (hooks === null || hooks === undefined || typeof hooks !== 'object' || Array.isArray(hooks) || Object.keys(hooks).length === 0) {
    return { records: [], message: 'Claude Code global settings contain no hook declarations.', source: path };
  }
  const records: ImportedRecord[] = [];
  const source = resolve(path);
  for (const [externalEvent, groups] of Object.entries(hooks as Record<string, unknown>)) {
    if (!Array.isArray(groups)) continue;
    groups.forEach((group, groupIndex) => {
      if (group === null || typeof group !== 'object') return;
      const g = group as Record<string, unknown>;
      const matcher = typeof g['matcher'] === 'string' ? g['matcher'] : '';
      const handlers = Array.isArray(g['hooks']) ? g['hooks'] : [];
      handlers.forEach((handler, handlerIndex) => {
        const h = (handler !== null && typeof handler === 'object' ? handler : {}) as Record<string, unknown>;
        const id = externalIdentity({ agent: CLAUDE_AGENT_ID, event: externalEvent, groupIndex, handler, handlerIndex, matcher, source });
        const name = `Claude Code ${externalEvent}`;
        const event = EVENT_MAP[externalEvent];
        const unusable = (reason: string): ImportedRecord => ({ id, name, event: event ?? externalEvent, usable: false, reason, command: commandOf(h), toolNames: [], timeoutSeconds: 60 });
        if (event === undefined) { records.push(unusable(`The Claude Code ${externalEvent} lifecycle event has no Rotaris equivalent.`)); return; }
        const type = typeof h['type'] === 'string' ? h['type'] : 'command';
        if (type !== 'command') { records.push(unusable(`${type} handlers are unavailable in Rotaris.`)); return; }
        const command = commandOf(h);
        if (command === '') { records.push(unusable('The command handler has no command.')); return; }
        if (h['if'] !== undefined) { records.push(unusable('Claude Code `if` predicates require tool arguments that Rotaris does not expose here.')); return; }
        let timeoutSeconds = 60;
        if (h['timeout'] !== undefined) {
          const t = typeof h['timeout'] === 'number' ? h['timeout'] : typeof h['timeout'] === 'string' ? Number(h['timeout']) : NaN;
          if (!Number.isFinite(t)) { records.push(unusable('The command handler timeout is invalid.')); return; }
          if (t <= 0) { records.push(unusable('The command handler timeout must be positive.')); return; }
          timeoutSeconds = t;
        }
        let toolNames: readonly string[] = [];
        if (event === 'pre_tool' || event === 'post_tool') {
          const mapped = mapToolMatcher(matcher);
          if (!mapped.ok) { records.push(unusable(mapped.reason)); return; }
          toolNames = mapped.toolNames;
        }
        records.push({ id, name, event, usable: true, reason: '', command, toolNames, timeoutSeconds });
      });
    });
  }
  return { records, message: '', source };
}

/** REQ-HOOKS-114/117: the effective hook an enabled usable record becomes. */
export function importedEntry(r: ImportedRecord): HookEntry {
  return { id: r.id, event: r.event as HookEntry['event'], command: r.command, name: r.name, matcher: '', timeoutSeconds: r.timeoutSeconds, required: false, enabled: true, source: EXTERNAL_CLAUDE_CODE_SCOPE, index: 0, toolNames: r.toolNames };
}
