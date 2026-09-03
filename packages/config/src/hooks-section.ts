import { isScalar, type Node, type YAMLMap } from 'yaml';
import { HOOK_EVENTS, isHookEvent, type HookEvent, type TrustedHookScope } from '@rotaris/contracts';
import { err, ok, type Result } from '@rotaris/kernel';
import { asMap, asSeq, plainOf, triOf, typeNameOf, vocabularyText, type ParsedConfig, type Tri } from './document.js';
import { tokenizeHookPattern } from './command-pattern.js';

/**
 * The `hooks:` section (REQ-HOOKS-007..018; REQ-CONFIG-148..158): one scope's layer read from its own
 * document with the scope stamped BEFORE any merge (REQ-HOOKS-014), then the merge across scopes with
 * full-list substitution and the displaced lists kept as a record (REQ-HOOKS-013/015).
 */
export interface HookEntry {
  /** REQ-HOOKS-018: `<source>:<index>:<event>`, the index counted with disabled entries present. */
  readonly id: string;
  readonly event: HookEvent;
  /** Kept exactly as written (REQ-HOOKS-008). */
  readonly command: string;
  readonly name: string;
  readonly matcher: string;
  readonly timeoutSeconds: number;
  readonly required: boolean;
  readonly enabled: boolean;
  /** The declaring scope, or `external:claude-code` for an imported record. */
  readonly source: string;
  readonly index: number;
  /** REQ-HOOKS-023: only an imported hook carries a tool-name set. */
  readonly toolNames?: readonly string[];
}

export interface HooksLayer {
  readonly scope: TrustedHookScope;
  readonly enabled: Tri<boolean>;
  readonly entries: Tri<readonly HookEntry[]>;
}

export interface ConfigError {
  /** The YAML path, a machine-readable contract (REQ-HOOKS-012). */
  readonly path: string;
  readonly message: string;
}

export const HOOK_TIMEOUT_DEFAULT_SECONDS = 60;
export const EMPTY_HOOKS_LAYER = (scope: TrustedHookScope): HooksLayer => ({ scope, enabled: { kind: 'absent' }, entries: { kind: 'absent' } });

const EVENT_LIST = HOOK_EVENTS.join(', ');

/** Read one scope's `hooks:` section. `ok` with an unset layer when the key is absent or bare. */
export function readHooksSection(parsed: ParsedConfig, scope: TrustedHookScope): Result<HooksLayer, ConfigError[]> {
  const hooksTri = triOf(parsed.root, 'hooks');
  if (hooksTri.kind !== 'value') return ok(EMPTY_HOOKS_LAYER(scope));
  const node = hooksTri.value;
  let map: YAMLMap | null = asMap(node);
  let entriesTri: Tri<Node>;
  let enabledTri: Tri<boolean> = { kind: 'absent' };
  const seq = asSeq(node);
  if (seq !== null) {
    // REQ-HOOKS-010: the list shorthand is normalised to `{entries: [...]}` before validation and merging.
    entriesTri = { kind: 'value', value: seq };
    map = null;
  } else if (map !== null) {
    entriesTri = triOf(map, 'entries');
    const en = triOf(map, 'enabled');
    if (en.kind === 'null') enabledTri = { kind: 'null' };
    else if (en.kind === 'value') {
      const v = plainOf(en.value);
      if (typeof v !== 'boolean') return err([{ path: 'hooks.enabled', message: `hooks.enabled must be a boolean, got ${typeNameOf(en.value)}` }]);
      enabledTri = { kind: 'value', value: v };
    }
  } else {
    return err([{ path: 'hooks', message: `Invalid 'hooks' section: expected a mapping or a list of hook entries, got ${typeNameOf(node)}` }]);
  }
  if (entriesTri.kind !== 'value') return ok({ scope, enabled: enabledTri, entries: { kind: entriesTri.kind } });
  const list = asSeq(entriesTri.value);
  if (list === null) return err([{ path: 'hooks.entries', message: `hooks.entries must be a list of hook entries, got ${typeNameOf(entriesTri.value)}` }]);
  const errors: ConfigError[] = [];
  const entries: HookEntry[] = [];
  list.items.forEach((item, i) => {
    const r = readEntry(item as Node, i, scope);
    if (r.ok) entries.push(r.value);
    else errors.push(...r.error);
  });
  if (errors.length > 0) return err(errors);
  return ok({ scope, enabled: enabledTri, entries: { kind: 'value', value: entries } });
}

function readEntry(item: Node | null | undefined, i: number, scope: TrustedHookScope): Result<HookEntry, ConfigError[]> {
  const base = `hooks.entries.${i}`;
  const map = item ? asMap(item) : null;
  if (map === null) return err([{ path: base, message: `a hook entry must be a mapping, got ${typeNameOf(item)}` }]);
  const errors: ConfigError[] = [];
  const field = (key: string) => triOf(map, key);

  // event: required; surrounding whitespace removed; one of the seven (REQ-HOOKS-001).
  const ev = field('event');
  const evText = ev.kind === 'value' ? vocabularyText(ev.value) : null;
  const eventTrimmed = evText === null ? null : evText.trim();
  let event: HookEvent | null = null;
  if (eventTrimmed === null || eventTrimmed === '') errors.push({ path: `${base}.event`, message: `hook 'event' is required; expected one of: ${EVENT_LIST}` });
  else if (!isHookEvent(eventTrimmed)) errors.push({ path: `${base}.event`, message: `hook event '${eventTrimmed}' is not a known lifecycle hook event; expected one of: ${EVENT_LIST}` });
  else event = eventTrimmed;

  // command: required, non-blank, kept exactly as written.
  const cmd = field('command');
  const command = cmd.kind === 'value' && isScalar(cmd.value) && cmd.value.value !== null ? String(cmd.value.value) : '';
  if (command.trim() === '') errors.push({ path: `${base}.command`, message: "hook 'command' must not be blank" });

  const nameTri = field('name');
  const name = nameTri.kind === 'value' ? String(plainOf(nameTri.value) ?? '') : '';

  const matcherTri = field('matcher');
  const matcher = matcherTri.kind === 'value' ? String(plainOf(matcherTri.value) ?? '').trim() : '';
  if (matcher !== '' && tokenizeHookPattern(matcher) === null) errors.push({ path: `${base}.matcher`, message: `hook matcher '${matcher}' is not a usable command pattern: unterminated quote` });

  let timeoutSeconds = HOOK_TIMEOUT_DEFAULT_SECONDS;
  const to = field('timeout_seconds');
  if (to.kind === 'value') {
    const v = plainOf(to.value);
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push({ path: `${base}.timeout_seconds`, message: `hook timeout_seconds '${String(v)}' is not a number; the budget must be a number of seconds greater than zero` });
    else if (v <= 0) errors.push({ path: `${base}.timeout_seconds`, message: `hook timeout_seconds '${String(v)}' was rejected; the budget must be greater than zero` });
    else timeoutSeconds = v;
  }

  const bool = (key: string, dflt: boolean): boolean => {
    const t = field(key);
    if (t.kind !== 'value') return dflt;
    const v = plainOf(t.value);
    if (typeof v === 'boolean') return v;
    errors.push({ path: `${base}.${key}`, message: `hook '${key}' must be a boolean, got ${typeNameOf(t.value)}` });
    return dflt;
  };
  const required = bool('required', false);
  const enabled = bool('enabled', true);

  if (errors.length > 0 || event === null) return err(errors);
  // `source` written by hand is replaced (REQ-HOOKS-008); the index counts every declared entry (REQ-HOOKS-018).
  return ok({ id: `${scope}:${i}:${event}`, event, command, name, matcher, timeoutSeconds, required, enabled, source: scope, index: i });
}

export interface HooksResolved {
  readonly enabled: boolean;
  readonly entries: readonly HookEntry[];
  /** REQ-HOOKS-015: displaced lists, a record only — nothing in it runs and nothing in it decides trust. */
  readonly superseded: readonly HookEntry[];
}

/** REQ-HOOKS-013/015/017: precedence default → global → workspace; a supplied list substitutes in full. */
export function mergeHooks(layers: readonly HooksLayer[]): HooksResolved {
  let enabled = true;
  let entries: readonly HookEntry[] = [];
  let superseded: HookEntry[] = [];
  for (const layer of layers) {
    if (layer.enabled.kind === 'value') enabled = layer.enabled.value;
    if (layer.entries.kind === 'value') {
      superseded = [...superseded, ...entries];
      entries = layer.entries.value;
    }
  }
  if (!enabled) return { enabled, entries: [], superseded: [] };
  return { enabled, entries, superseded };
}

/** REQ-HOOKS-008: the display name, or the stable id in REQ-HOOKS-018's form when the name is empty after trimming. */
export function hookDisplayName(h: Pick<HookEntry, 'id' | 'name'>): string {
  const n = h.name.trim();
  return n === '' ? h.id : n;
}
