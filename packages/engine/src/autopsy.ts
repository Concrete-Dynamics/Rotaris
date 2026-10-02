/**
 * R-043 — the run-autopsy snapshot: one read-only pass over a session's own
 * records, joining what the autopsy of `2e21e324` joined by hand.
 *
 * Covered work (nothing minted): REQ-SESSION-139's metrics document rebuilt
 * from state plus evidence records, REQ-SESSION-199's four records read in
 * one read transaction, REQ-SESSION-153's trajectory summary recomputed from
 * the exported events alone, REQ-SESSION-136's tool-call record fields, and
 * REQ-SESSION-134/135's timeline and issue shapes. Locators are carried,
 * never resolved (REQ-EVENTS-056). The snapshot writes nothing to the
 * session's own record: every read runs inside `readTransaction`, and the
 * only wall-clock read is the ring headers' `taken_at`.
 *
 * What it answers, per section:
 * - `session`: the row's identity, status, stop reason, iterations, tokens,
 *   cost, tool-call and compression counts, token-sample span.
 * - `tools`: per-tool totals with elapsed sums (the dominated-wall-time
 *   read), failed-vs-blocked partitioned, plus the slowest calls.
 * - `failures`: every failed or blocked call grouped by cause — the
 *   `failure_kind` where the record carries one, else the status — with the
 *   tool, the agent, the truncated command or path, and the result head.
 * - `usage`: the largest `usage.update` jumps, so "slow" is a number.
 * - `coherence`: the checks the autopsy ran by hand — a NULL summary on a
 *   stopped run, a cost of zero beside non-zero tokens, duplicate reads of
 *   the same path, identical commands retried.
 * - `requests`: per-model-key tool-call attribution — a child's calls under
 *   the model_key the children record carries for the child of that name
 *   alive when the call started (the usage.update payload carries tokens and
 *   cost alone), the entry agent's under the key the
 *   launch audit, its continuations, its switches, the session's overrides
 *   of its pair and the ladder's fallbacks of it record for it
 *   (`entryModelKeys`), newest totals last.
 */

import type { SessionId, WallClock } from '@rotaris/kernel';
import { type AuditRow, type ChildRow, type IssueRow, type SessionRow, type StoreDal, type TimelineRow } from '@rotaris/store';
import { metricsDocument } from './export.js';
import type { JsonValue } from './export.js';

export interface AutopsyToolRow {
  readonly tool_name: string;
  readonly status: string;
  readonly calls: number;
  readonly errors: number;
  readonly elapsed_ms: number;
}

export interface AutopsyFailure {
  readonly ordinal: number;
  readonly tool_name: string;
  readonly agent_name: string;
  readonly status: string;
  readonly cause: string;
  readonly detail: string;
}

export interface AutopsyFailureGroup {
  readonly cause: string;
  readonly count: number;
  readonly tools: readonly string[];
  readonly ordinals: readonly number[];
  readonly sample: string;
}

export interface AutopsyUsageJump {
  readonly at: string;
  readonly input: number;
  readonly output: number;
  readonly jump: number;
}

export interface AutopsyCoherence {
  readonly null_summary_on_stopped: boolean;
  readonly zero_cost_with_tokens: boolean;
  readonly duplicate_reads: readonly { readonly path: string; readonly reads: number }[];
  readonly retried_commands: readonly { readonly command: string; readonly times: number }[];
}

export interface AutopsyEndpointRow {
  readonly endpoint: string;
  readonly agents: readonly string[];
  readonly tool_calls: number;
}

export interface AutopsySnapshot {
  readonly session: {
    readonly session_id: string;
    readonly execution_status: string;
    readonly stop_reason: string | null;
    readonly iterations_completed: number;
    readonly tokens_input: number;
    readonly tokens_output: number;
    readonly cost: string;
    readonly tool_calls: number;
    readonly compressions: number;
    readonly summary_status: string | null;
    readonly summary_text_head: string;
    readonly token_samples: number;
    readonly token_span: string | null;
  };
  readonly tools: readonly AutopsyToolRow[];
  readonly failures: readonly AutopsyFailureGroup[];
  readonly usage_jumps: readonly AutopsyUsageJump[];
  readonly coherence: AutopsyCoherence;
  readonly requests: readonly AutopsyEndpointRow[];
  readonly counts: { readonly timeline: number; readonly issues: number; readonly permission_audit: number; readonly children: number; readonly checkpoints: number };
}

function parseJson(text: string): Record<string, unknown> | undefined {
  try {
    const v = JSON.parse(text) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function head(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** The command or path a failure was about, truncated for the report. */
function failureDetail(tool: string, entry: Record<string, unknown> | undefined): string {
  const args = entry?.['args'];
  const argv = args !== null && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : undefined;
  if (tool === 'terminal') return head(str(argv?.['command']).replace(/\s+/g, ' '), 160);
  const path = argv?.['path'] ?? argv?.['pattern'];
  if (typeof path === 'string' && path !== '') return head(path, 160);
  return head(str(entry?.['result']), 220);
}

/** The loader's own prefixes for the models it copies (`packages/config/src/keys.ts`; REQ-CONFIG-076..081). */
const SYNTHETIC_PREFIXES = ['__startup_slot__:', '__persona__:'] as const;
const isSynthetic = (name: string): boolean => SYNTHETIC_PREFIXES.some((p) => name.startsWith(p));
/** A `models:` entry with the two fields the loader's copy changes taken out, so a copy compares equal to its original. */
const copiedFields = (entry: unknown): string => {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return '';
  const { thinking: _t, reasoning_effort: _r, ...rest } = entry as Record<string, unknown>;
  return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]]));
};

const asMap = (v: unknown): Record<string, unknown> | undefined => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/**
 * The label a recorded model name reads as: a loader-made copy (a slot's or a role's reasoning synthesis,
 * REQ-CONFIG-076..081) reads as the one non-copy `models:` key it was copied from — the key a child on that model is
 * recorded under (REQ-CONFIG-094) — and as its own recorded name when none or more than one matches.
 */
function modelLabel(models: Record<string, unknown>, model: string): string {
  if (!isSynthetic(model)) return model;
  const copied = copiedFields(models[model]);
  const origins = copied === '' ? [] : Object.keys(models).filter((k) => !isSynthetic(k) && copiedFields(models[k]) === copied);
  return origins.length === 1 ? origins[0]! : model;
}

/**
 * The `provider|model` pair a `models:` key resolves to in a snapshot — the identity the run's session-wide override
 * memory is keyed by (`providerIdentity`, `pairKey`: the entry's sign-in provider when it names one, else its family;
 * REQ-NOTIFY-082) — or `null` when the snapshot does not record the key's provider and model id.
 */
function modelPair(models: Record<string, unknown>, key: string): string | null {
  const entry = asMap(models[key]);
  if (!entry || typeof entry['model_id'] !== 'string') return null;
  const provider = entry['auth_provider'] ?? entry['provider'];
  return typeof provider === 'string' ? `${provider}|${entry['model_id']}` : null;
}

/** What one configuration snapshot (REQ-SESSION-138's `config_snapshot`) records of its entry role's model, or `null`. */
function snapshotEntry(snapshot: unknown): { readonly models: Record<string, unknown>; readonly label: string; readonly pair: string | null } | null {
  const s = asMap(snapshot);
  if (!s) return null;
  const role = str(s['default_persona']);
  const persona = role !== '' ? asMap(asMap(s['personas'])?.[role]) : undefined;
  const model = str(persona?.['model']);
  if (model === '') return null;
  const models = asMap(s['models']) ?? {};
  return { models, label: modelLabel(models, model), pair: modelPair(models, model) };
}

/** One child's model key over its lifetime in the children record: from its spawn to its completion, open while it has none. */
export interface ChildWindow {
  readonly model_key: string;
  readonly spawned_at: string;
  readonly completed_at: string | null;
}

/** Each child's windows, by the name its own records carry (`childModelKeys`). */
export type ChildModelKeys = ReadonlyMap<string, readonly ChildWindow[]>;

/**
 * Each child's model key (the children record's `model_key`) over its lifetime, keyed by the name the child's own records
 * carry: its canonical name (REQ-ORCH-044), which the child's turns run under (`agentName: row.canonical_name`), so its
 * tool calls (`tool_calls.agent_name`) and the ladder's entries about it (`quota_fallback_model`, `llm_unresponsive`:
 * `agent`) name it by that. Never by `given_name`: the model's own words differ from the canonical name whenever they hold a
 * space, punctuation or a reused name, and keyed by those the child's calls and moves read as the root's (the live pack
 * 2026-10-01T17-04-24-814Z, 'Run 13 shell commands verbatim' / 'Run-13-shell-commands-verbatim').
 *
 * A canonical name is unique only among one parent's children in one iteration (REQ-ORCH-044), so one session can hold two
 * children of one name — a continued session's later run reusing an earlier run's child name, a grandchild named like a
 * child — and a root whose persona spells an earlier child's name. The records carry the name and no task id (OQ-158), so
 * each child keeps its window, `[spawned_at, completed_at]`, ordered by spawn, and a record is attributed by its name and
 * its instant (`childKeyAt`). Never keyed by name alone: the later child's key then took every call of both.
 */
export function childModelKeys(children: readonly Pick<ChildRow, 'canonical_name' | 'model_key' | 'spawned_at' | 'completed_at'>[]): Map<string, ChildWindow[]> {
  const byName = new Map<string, ChildWindow[]>();
  for (const c of [...children].sort((a, b) => (a.spawned_at < b.spawned_at ? -1 : a.spawned_at > b.spawned_at ? 1 : 0))) {
    const windows = byName.get(c.canonical_name) ?? [];
    windows.push({ model_key: c.model_key, spawned_at: c.spawned_at, completed_at: c.completed_at });
    byName.set(c.canonical_name, windows);
  }
  return byName;
}

/** The label of a record two children of one name could have made, their windows overlapping: both keys, never one by guess. */
export const ambiguousChildKey = (keys: readonly string[]): string => `ambiguous (${keys.join(' | ')})`;

/**
 * The child model key a record of `name` made at `at` (a tool call's `started_at`, a timeline entry's `at`) is
 * attributed to: the key of the one child of that name whose window holds the instant, `ambiguousChildKey` of every key
 * when windows of different keys hold it, and `null` when no child of that name was alive then — the record is the
 * root's. Instants are the store's ISO UTC strings, compared as written. Two agents of one name alive at once (a child
 * and a root of its name, or two children whose windows overlap) are not told apart: that waits on an identity on the
 * rows (OQ-158), and a child that never records a completion keeps its window open.
 */
export function childKeyAt(children: ChildModelKeys, name: string, at: string): string | null {
  const keys = [...new Set((children.get(name) ?? []).filter((w) => w.spawned_at <= at && (w.completed_at === null || at <= w.completed_at)).map((w) => w.model_key))];
  if (keys.length === 0) return null;
  return keys.length === 1 ? keys[0]! : ambiguousChildKey(keys);
}

/** Printed where the record cannot say which key the entry agent ran on: an override may or may not have moved it. */
export const ENTRY_KEY_UNDETERMINED = 'undetermined';

/**
 * Live-run finding a71-13: every model key the entry agent ran on, in order, from what the store records of the entry
 * agent itself, consecutive repeats folded; empty when nothing records one. Never read from the children: a child's
 * key says nothing about the root's.
 *
 * The entry agent's configured key comes from the launch audit's configuration snapshot (REQ-SESSION-138), then each
 * continuation's own snapshot (`run_continuation_intent`) and each switch (`entry_model_switched`, REQ-MONITOR-142).
 * The key it runs on is that one carried through the session's overrides: the wait's "change model now"
 * (REQ-MONITOR-303, REQ-ORCH-091 d) records a `model_override` keyed by the waiting `provider|model` pair, and the run
 * resolves the root's model through every override of the session (`ResilienceMemory.effective`, replayed on every
 * later run), whichever agent was waiting. So an override moves the root exactly when it replaces the pair the root's
 * key resolves to. Where the snapshot does not say which pair the root's key resolves to and an override is recorded,
 * the key from that point on is `ENTRY_KEY_UNDETERMINED`, never one key given as fact.
 *
 * The ladder's two automatic moves of the root are read as well, from the entries that name no child alive at the entry's
 * instant (`children`: the children record names only the children, by the canonical names their records carry, each over
 * its lifetime — `childModelKeys`, `childKeyAt` — so every other agent an entry names is the root). The
 * root's cell lives for the run (`rootResilience`), so after either move the root runs on the new model until the next
 * continuation (a new run: its snapshot's key, or the configured key when it records none) or its next switch:
 * - `quota_fallback_model` (REQ-ORCH-091 b, REQ-NOTIFY-082): the same-tier candidate, whose key the entry records
 *   (`to_key`);
 * - `llm_unresponsive` (REQ-ORCH-090): the role's fallback, recorded as a `provider|model` pair with no key, so the key
 *   is the one `models:` key of the snapshot in force that resolves to that pair, and the pair itself
 *   (`provider/model`) when none does or more than one does.
 * A child's move leaves the root where it is. A switch ends a move only when the run rebuilt the root's cell for
 * it: the run records `rebuilds: false` on a switch onto the model the cell was last built from (`rootResilience`,
 * `sameRef`), and the move then stands while the switched key becomes the configured one; a store written before the
 * run recorded `rebuilds` is read as rebuilt. Since 2026-10-02 (OQ-177) the run rebuilds the cell on every switch and
 * records `rebuilds: true` on each, so `rebuilds: false` is found only in stores written before then; this reading keeps
 * them right. A switch applies at the root's next turn, which the record does not show,
 * so the run records what places the records around that turn:
 * - on each switch and on the root's own wait choice, whether it `supersedes` a switch recorded since the root's cell was
 *   last settled. That switch never applied, so it is read as if it were not recorded: the reader returns to the state
 *   before it — the key it printed taken back with it, rightly, since the root never ran on it — and reads again every
 *   record since it, a ladder move of the root or a child's wait choice made in between included, then the superseding
 *   record. Away from the configured model and back onto it with no turn between leaves a move in force standing, whether
 *   the move came before the first switch or between the two. (Restoring that state without reading the records since it
 *   again, as the repair before this one did, erased a move made between the two: the verifier's second case.)
 * - on each ladder move of the root, whether a switch was pending at it (`switch_pending`): the move was made on the cell
 *   from before that switch, in the turn already running when it was made, so it is read before the switch, which then
 *   ends it at the next turn unless it records `rebuilds: false`. `switch_pending: false` says the switch had applied.
 * - on a child's wait choice, whether such a switch was pending at it (`switch_pending`, since 2026-10-02): every agent
 *   on the replaced pair follows the override from its next call (`followOverride`), the root on the cell from before
 *   the switch, and the switch's rebuild then resolves through it, so the choice is read before the switch and a switched
 *   key it replaced is never printed (the repair of
 *   the-autopsy-reader-can-print-a-switched-key-a-childs-wait-choice-overrode-before-the-root-ran-on-it).
 * A store recording no `supersedes` reads each switch as applied; one recording no `switch_pending` reads each move and
 * each child's choice where it is recorded, until a switch that supersedes places it.
 * A switch is held on its run alone (`entryOverride`; a continuation is a new `Run`), and whether it should reach the next
 * run is OQ-183's open question (an-entry-switch-made-in-a-runs-last-iteration-does-not-reach-a-continuation). A continuation
 * whose snapshot names the entry model says which it ran on; one recording none, after a switch onto another key than the
 * last snapshot's, prints `ENTRY_KEY_UNDETERMINED` until a record names a key, so neither answer is printed as fact (since
 * 2026-10-02; until then the switched key was kept, and a move such a run's fresh cell ended was read as ending on it:
 * the-autopsy-reader-keeps-a-switched-key-across-a-continuation-that-records-no-snapshot). With no such switch the last
 * snapshot's key is kept, as before. One reading stays coarse: an entry naming a child alive at its instant is that
 * child's, even where a root of the same name was alive too (OQ-158; `childKeyAt`).
 */
export function entryModelKeys(launchAuditPayload: string | undefined, timeline: readonly Pick<TimelineRow, 'name' | 'metadata' | 'at'>[], children: ChildModelKeys): string[] {
  type Key = { readonly label: string; readonly pair: string | null };
  type Row = Pick<TimelineRow, 'name' | 'metadata' | 'at'>;
  interface State {
    models: Record<string, unknown>;
    base: Key | null;
    // The key the configuration names (snapshot or switch); `base` departs from it only while a ladder move is in force.
    configured: Key | null;
    // The entry key the last snapshot naming one recorded; `configured` differs from it after a switch since.
    snapshotLabel: string | null;
    fellBack: boolean;
    readonly keys: string[];
    readonly overrides: Map<string, { readonly key: string; readonly to: string | null }>;
  }
  const clone = (s: State): State => ({ ...s, keys: [...s.keys], overrides: new Map(s.overrides) });
  const effective = (s: State): string | null => {
    if (s.base === null) return null;
    if (s.base.pair === null) return s.overrides.size > 0 ? ENTRY_KEY_UNDETERMINED : s.base.label;
    let label = s.base.label;
    let pair: string = s.base.pair;
    for (let hops = 0; hops < 8; hops++) {
      const o = s.overrides.get(pair);
      if (!o || o.to === pair) break;
      label = o.key;
      if (o.to === null) return s.overrides.size > 1 ? ENTRY_KEY_UNDETERMINED : label;
      pair = o.to;
    }
    return label;
  };
  const add = (s: State, key: string | null): void => { if (key !== null && key !== '' && s.keys[s.keys.length - 1] !== key) s.keys.push(key); };
  const fromSnapshot = (s: State, snapshot: unknown): void => {
    const e = snapshotEntry(snapshot);
    if (!e) {
      // A switch recorded since the last snapshot naming an entry model, onto another key: whether it reaches this new run
      // or ended with its own (`entryOverride` is held per `Run`) is OQ-183's open question
      // (an-entry-switch-made-in-a-runs-last-iteration-does-not-reach-a-continuation), and this snapshot does not say which
      // model the run was configured with, so the key is undetermined until a record names one (the repair of
      // the-autopsy-reader-keeps-a-switched-key-across-a-continuation-that-records-no-snapshot; revisit when it is ruled).
      if (s.configured !== null && s.configured.label !== s.snapshotLabel) {
        s.base = s.configured = { label: ENTRY_KEY_UNDETERMINED, pair: null };
        s.fellBack = false;
        add(s, ENTRY_KEY_UNDETERMINED);
        return;
      }
      // A continuation recording no entry model (`config_snapshot: {}`) is still a new run with a new root cell, built
      // from the configured model: a ladder move of the run before it ends there, back to the configured key, or to an
      // undetermined one when nothing ever named it.
      if (s.fellBack) { s.fellBack = false; s.base = s.configured; add(s, s.configured === null ? ENTRY_KEY_UNDETERMINED : effective(s)); }
      return;
    }
    s.models = e.models;
    s.snapshotLabel = e.label;
    s.base = s.configured = { label: e.label, pair: e.pair };
    s.fellBack = false;
    add(s, effective(s));
  };
  /** A root ladder move the record names, or null: an entry naming a child alive at its instant is that child's. */
  const rootMove = (t: Row): { readonly meta: Record<string, unknown>; readonly toProvider: string; readonly toModel: string } | null => {
    if (t.name !== 'quota_fallback_model' && t.name !== 'llm_unresponsive') return null;
    const meta = parseJson(t.metadata);
    const agent = meta?.['agent'];
    const toProvider = meta?.['to_provider'];
    const toModel = meta?.['to_model'];
    if (meta === undefined || typeof agent !== 'string' || childKeyAt(children, agent, t.at) !== null || typeof toProvider !== 'string' || typeof toModel !== 'string') return null;
    return { meta, toProvider, toModel };
  };
  /** One record read as it applies to the root, with no regard to when the run applied a switch (the loop below sees to that). */
  const read = (s: State, t: Row): void => {
    if (t.name === 'run_continuation_intent') fromSnapshot(s, parseJson(t.metadata)?.['config_snapshot']);
    else if (t.name === 'entry_model_switched') {
      const meta = parseJson(t.metadata);
      const key = str(meta?.['model']);
      if (key === '') return;
      s.configured = { label: modelLabel(s.models, key), pair: modelPair(s.models, key) };
      // `rebuilds: false`: the switch named the model the root's cell was last built from, so the run did not rebuild
      // it and a ladder move in force stands. A store recording no `rebuilds` (written before the run recorded it) is
      // read as rebuilt.
      if (meta?.['rebuilds'] === false && s.fellBack) return;
      s.base = s.configured;
      s.fellBack = false;
      add(s, effective(s));
    } else if (t.name === 'model_override') {
      const meta = parseJson(t.metadata);
      const provider = meta?.['provider'];
      const model = meta?.['model'];
      // REQ-NOTIFY-070/078: an entry carrying `cleared: true` takes the pin on its pair back (`ResilienceMemory.rehydrate`).
      if (typeof provider === 'string' && typeof model === 'string' && meta?.['cleared'] === true) {
        s.overrides.delete(`${provider}|${model}`);
        add(s, effective(s));
        return;
      }
      const key = str(meta?.['model_key']);
      if (typeof provider !== 'string' || typeof model !== 'string' || key === '') return;
      const toProvider = meta?.['to_provider'];
      const toModel = meta?.['to_model'];
      const to = typeof toProvider === 'string' && typeof toModel === 'string' ? `${toProvider}|${toModel}` : modelPair(s.models, key);
      s.overrides.set(`${provider}|${model}`, { key, to });
      add(s, effective(s));
    } else {
      const move = rootMove(t);
      if (move === null) return;
      const pair = `${move.toProvider}|${move.toModel}`;
      const toKey = str(move.meta['to_key']);
      if (t.name === 'quota_fallback_model' && toKey !== '') s.base = { label: modelLabel(s.models, toKey), pair };
      else {
        const labels = new Set(Object.keys(s.models).filter((k) => modelPair(s.models, k) === pair).map((k) => modelLabel(s.models, k)));
        s.base = { label: labels.size === 1 ? [...labels][0]! : `${move.toProvider}/${move.toModel}`, pair };
      }
      s.fellBack = true;
      add(s, effective(s));
    }
  };

  let s: State = { models: {}, base: null, configured: null, snapshotLabel: null, fellBack: false, keys: [], overrides: new Map() };
  if (launchAuditPayload !== undefined) fromSnapshot(s, parseJson(launchAuditPayload)?.['config_snapshot']);
  // A switch the run has not applied yet: it applies at the root's next turn, which the record does not show. `before` is
  // the state before it; `ahead` the records known to precede that turn, read before the switch; `after` the records
  // since whose place against that turn is unknown, read after it as recorded.
  let pending: { readonly before: State; switched: Row; ahead: Row[]; after: Row[] } | null = null;
  const replay = (p: NonNullable<typeof pending>): void => {
    s = clone(p.before);
    for (const t of p.ahead) read(s, t);
    read(s, p.switched);
    for (const t of p.after) read(s, t);
  };
  for (const t of timeline) {
    const meta = t.name === 'entry_model_switched' || t.name === 'model_override' ? parseJson(t.metadata) : undefined;
    const move = rootMove(t);
    // Where the record places it against a pending switch: a root move's `switch_pending`, or a child's wait choice's.
    const placed = move !== null ? move.meta['switch_pending'] : t.name === 'model_override' ? meta?.['switch_pending'] : undefined;
    if (t.name === 'run_continuation_intent') {
      // A new run, whose root cell is its own: no switch of the run before it is pending in it.
      pending = null;
      read(s, t);
    } else if (t.name === 'entry_model_switched' && str(meta?.['model']) !== '') {
      if (meta?.['supersedes'] === true && pending !== null) {
        // The pending switch never applied (no root turn between the two), so it is read as if it were not recorded —
        // the key it printed taken back with it — and every record since it precedes this one, read from the state
        // before it.
        pending = { before: pending.before, switched: t, ahead: [...pending.ahead, ...pending.after], after: [] };
        replay(pending);
      } else {
        // The first switch not yet applied (a store recording no `supersedes` reads each switch as this one).
        pending = { before: clone(s), switched: t, ahead: [], after: [] };
        read(s, t);
      }
    } else if (t.name === 'model_override' && meta?.['supersedes'] === true && pending !== null) {
      // The root's own wait choice replaced the pending switch, which never ran: every record since it is read from the
      // state before it, then the choice.
      const p = pending;
      pending = null;
      s = clone(p.before);
      for (const r of [...p.ahead, ...p.after, t]) read(s, r);
    } else if (placed === true && pending !== null) {
      // `switch_pending`: the root moved in the turn that was running when the switch was made, on the cell from before
      // it; the switch then applies at the next turn, after the move, and ends it unless it `rebuilds: false`. A child's
      // wait choice recording it moved the root the same way (the root follows an override from its next call), and the
      // switch's rebuild then resolves through it, so a switched key it replaced is never printed.
      pending.ahead = [...pending.ahead, ...pending.after, t];
      pending.after = [];
      replay(pending);
    } else {
      // `switch_pending: false`: the root's turn had applied the switch before this move or choice, read as recorded.
      if (placed === false) pending = null;
      else pending?.after.push(t);
      read(s, t);
    }
  }
  return s.keys;
}

/**
 * R-043: one read-only pass over the session's own records. `undefined` for
 * no such session. Every table read runs inside one `readTransaction`, so the
 * entries and the ring headers come from one consistent state (ADR-0024 c.5).
 */
export function readAutopsy(dal: StoreDal, sessionId: SessionId, _wall: WallClock): AutopsySnapshot | undefined {
  return dal.readTransaction(() => {
    const row: SessionRow | undefined = dal.getSession(sessionId);
    if (!row) return undefined;
    const toolCalls = dal.toolCallsOf(sessionId);
    const timeline: TimelineRow[] = dal.timelineOf(sessionId);
    const issues: IssueRow[] = dal.issuesOf(sessionId);
    const audit: AuditRow[] = dal.auditOf(sessionId);
    const children = dal.childrenOf(sessionId);
    const checkpoints = dal.listCheckpoints(sessionId);
    const events = dal.eventsOf(sessionId);
    const launchAudit = dal.getLaunchAudit(sessionId);

    // Per-tool totals with elapsed sums; failed vs blocked partitioned by status.
    const byTool = new Map<string, AutopsyToolRow>();
    for (const t of toolCalls) {
      const key = `${t.tool_name}\0${t.status}`;
      const prev = byTool.get(key) ?? { tool_name: t.tool_name, status: t.status, calls: 0, errors: 0, elapsed_ms: 0 };
      byTool.set(key, {
        ...prev,
        calls: prev.calls + 1,
        errors: prev.errors + (t.is_error === 1 ? 1 : 0),
        elapsed_ms: prev.elapsed_ms + (t.elapsed_ms ?? 0),
      });
    }
    const tools = [...byTool.values()].sort((a, b) => b.elapsed_ms - a.elapsed_ms);

    // Failures grouped by cause: the record's failure_kind where it carries
    // one, else the status. Two failures with the same root are one group.
    const failures: AutopsyFailure[] = [];
    for (const t of toolCalls) {
      if (t.is_error !== 1 && t.status === 'ok') continue;
      const entry = parseJson(t.entry);
      const cause = str(entry?.['failure_kind']) || t.status;
      failures.push({
        ordinal: t.ordinal,
        tool_name: t.tool_name,
        agent_name: t.agent_name,
        status: t.status,
        cause,
        detail: failureDetail(t.tool_name, entry) || head(str(entry?.['result']), 220),
      });
    }
    const groups = new Map<string, AutopsyFailure[]>();
    for (const f of failures) {
      const list = groups.get(f.cause) ?? [];
      list.push(f);
      groups.set(f.cause, list);
    }
    const failureGroups: AutopsyFailureGroup[] = [...groups.entries()]
      .map(([cause, list]) => ({
        cause,
        count: list.length,
        tools: [...new Set(list.map((f) => f.tool_name))].sort(),
        ordinals: list.map((f) => f.ordinal),
        sample: list[0]?.detail ?? '',
      }))
      .sort((a, b) => b.count - a.count);

    // Usage curve with the largest jumps, from the stored usage.update payloads.
    const jumps: AutopsyUsageJump[] = [];
    let prev = 0;
    for (const e of events) {
      if (e.kind !== 'usage.update') continue;
      const payload = parseJson(e.payload);
      const tokens = payload?.['tokens'];
      const input = tokens !== null && typeof tokens === 'object' && !Array.isArray(tokens) ? num((tokens as Record<string, unknown>)['input']) : 0;
      const output = tokens !== null && typeof tokens === 'object' && !Array.isArray(tokens) ? num((tokens as Record<string, unknown>)['output']) : 0;
      const jump = input - prev;
      prev = input;
      if (jump > 0) jumps.push({ at: e.at, input, output, jump });
    }
    jumps.sort((a, b) => b.jump - a.jump);
    const usageJumps = jumps.slice(0, 10);

    // Coherence: the checks the autopsy ran by hand.
    const stopped = row.execution_status !== 'idle' && row.execution_status !== 'running' && row.execution_status !== 'background' && row.execution_status !== 'waiting';
    const nullSummary = (row.summary_text ?? '') === '';
    const readPaths = new Map<string, number>();
    for (const t of toolCalls) {
      if (t.tool_name !== 'read_file' || t.status !== 'ok') continue;
      const entry = parseJson(t.entry);
      const args = entry?.['args'];
      const path = args !== null && typeof args === 'object' && !Array.isArray(args) ? str((args as Record<string, unknown>)['path']) : '';
      if (path !== '') readPaths.set(path, (readPaths.get(path) ?? 0) + 1);
    }
    const duplicateReads = [...readPaths.entries()]
      .filter(([, n]) => n > 1)
      .map(([path, reads]) => ({ path, reads }))
      .sort((a, b) => b.reads - a.reads)
      .slice(0, 10);
    const commands = new Map<string, number>();
    for (const t of toolCalls) {
      if (t.tool_name !== 'terminal') continue;
      const entry = parseJson(t.entry);
      const args = entry?.['args'];
      const command = args !== null && typeof args === 'object' && !Array.isArray(args) ? head(str((args as Record<string, unknown>)['command']).replace(/\s+/g, ' '), 120) : '';
      if (command !== '') commands.set(command, (commands.get(command) ?? 0) + 1);
    }
    const retriedCommands = [...commands.entries()]
      .filter(([, n]) => n > 1)
      .map(([command, times]) => ({ command, times }))
      .sort((a, b) => b.times - a.times)
      .slice(0, 10);

    // Per-model-key attribution: the store records no provider or model on
    // the usage.update payload (REQ-EVENTS-053's payload is tokens and cost
    // alone), so a child's tool calls go to the model_key the children record
    // carries, matched by the canonical name its calls carry and the instant
    // each call started within that child's lifetime (`childModelKeys`,
    // `childKeyAt`; two windows of one name holding the instant print both keys).
    // A call no child of its name was alive for is the entry agent's,
    // attributed to the key(s) its own records name (`entryModelKeys`: its
    // snapshots, its switches, the overrides of the pair it runs on and the
    // ladder's fallbacks of it), joined in order when it ran on more than one,
    // and to `session` when none is recorded. Its calls are never split between
    // keys by guess, and its key is never taken from its children (live-run
    // finding a71-13: it had been, whenever they shared one).
    const childKeys = childModelKeys(children);
    const recordedEntryKeys = entryModelKeys(launchAudit?.payload, timeline, childKeys);
    const entryKey = recordedEntryKeys.length > 0 ? recordedEntryKeys.join(' → ') : 'session';
    const byEndpoint = new Map<string, { agents: Set<string>; calls: number }>();
    for (const t of toolCalls) {
      const endpoint = childKeyAt(childKeys, t.agent_name, t.started_at) ?? entryKey;
      const row = byEndpoint.get(endpoint) ?? { agents: new Set<string>(), calls: 0 };
      row.agents.add(t.agent_name);
      row.calls += 1;
      byEndpoint.set(endpoint, row);
    }
    const requests: AutopsyEndpointRow[] = [...byEndpoint.entries()]
      .map(([endpoint, r]) => ({ endpoint, agents: [...r.agents].sort() as readonly string[], tool_calls: r.calls }))
      .sort((a, b) => b.tool_calls - a.tool_calls);

    let tokenSpan: string | null = null;
    try {
      const samples = JSON.parse(row.token_samples) as unknown;
      if (Array.isArray(samples) && samples.length > 0) {
        const first = (samples[0] as [string, number])[0];
        const last = (samples[samples.length - 1] as [string, number])[0];
        tokenSpan = typeof first === 'string' && typeof last === 'string' ? `${first} → ${last}` : null;
      }
    } catch {
      tokenSpan = null;
    }

    return {
      session: {
        session_id: row.session_id,
        execution_status: row.execution_status,
        stop_reason: row.stop_reason,
        iterations_completed: row.iterations_completed,
        tokens_input: row.tokens_input,
        tokens_output: row.tokens_output,
        cost: row.cost,
        tool_calls: row.tool_calls,
        compressions: row.compressions,
        summary_status: row.summary_status,
        summary_text_head: head(row.summary_text ?? '', 200),
        token_samples: Array.isArray(JSON.parse(row.token_samples || '[]')) ? (JSON.parse(row.token_samples || '[]') as unknown[]).length : 0,
        token_span: tokenSpan,
      },
      tools,
      failures: failureGroups,
      usage_jumps: usageJumps,
      coherence: {
        null_summary_on_stopped: stopped && nullSummary,
        zero_cost_with_tokens: row.cost === '0' && row.tokens_input + row.tokens_output > 0,
        duplicate_reads: duplicateReads,
        retried_commands: retriedCommands,
      },
      requests,
      counts: { timeline: timeline.length, issues: issues.length, permission_audit: audit.length, children: children.length, checkpoints: checkpoints.length },
    };
  });
}

/** The snapshot as a JSON value, for the script that prints it. */
export function autopsyDocument(snapshot: AutopsySnapshot): JsonValue {
  return snapshot as unknown as JsonValue;
}

/** REQ-SESSION-139's metrics beside the snapshot, from the same records. */
export function autopsyMetrics(dal: StoreDal, sessionId: SessionId): JsonValue | undefined {
  return dal.readTransaction(() => {
    const row = dal.getSession(sessionId);
    if (!row) return undefined;
    const toolCalls = dal.toolCallsOf(sessionId);
    const audit = dal.auditOf(sessionId);
    const issues = dal.issuesOf(sessionId);
    const auditState = dal.ringState(sessionId, 'permission_audit');
    const issuesState = dal.ringState(sessionId, 'issues');
    const toolState = dal.ringState(sessionId, 'tool_calls');
    return metricsDocument(row, toolCalls, audit, issues, auditState.dropped, issuesState.dropped, toolState.dropped);
  });
}
