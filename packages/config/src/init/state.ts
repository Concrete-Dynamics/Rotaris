import { readFileSync } from 'node:fs';
import type { WorkspaceClassificationValue } from '@rotaris/contracts';
import { parseConfig, plainOf } from '../document.js';
import { isPlainMap, type PlainMap } from '../merge.js';

/**
 * ADR-0064 — the persisted initialization marker (REQ-WORKSPACE-078, REQ-WORKSPACE-079).
 *
 * The `initialization:` key has been section-class in `keys.ts` since Part I with nothing standing
 * behind it, the same shape the `skills:` key was in before ADR-0063.
 *
 * **This state is read from the workspace file itself, never from the merged configuration.**
 * REQ-WORKSPACE-078 names `<workspace>/.rotaris/agents.yaml` and only that file. Reading it through
 * the layered loader would let a *global* `agents.yaml` declare `initialization:` and have one
 * machine's marker decide every workspace on it — which is also why the refresh of REQ-WORKSPACE-115
 * can promise to show "the values the persisted `initialization:` section holds at that moment"
 * without disturbing anything else: it is one file, read on its own, on demand.
 *
 * An unreadable or unparseable file reads as never-initialized rather than raising. The failure
 * a user can act on is the one the loader already reports for that file (REQ-CONFIG-024); a second
 * copy of it here would say nothing new and would block the window on a file the user may be editing.
 */
export type WorkspaceClassification = WorkspaceClassificationValue;

export interface InitializationState {
  readonly completed: readonly string[];
  readonly skipped: readonly string[];
  /** ISO-8601 UTC, or null when nothing has ever been recorded. */
  readonly lastRun: string | null;
  readonly classification: WorkspaceClassification | null;
}

/** REQ-WORKSPACE-078: a missing file, a missing key, or a bare empty section all read as this. */
export const NEVER_INITIALIZED: InitializationState = Object.freeze({ completed: [], skipped: [], lastRun: null, classification: null });

/**
 * REQ-WORKSPACE-078: never-initialized is no `last_run` **and** both lists empty. A file carrying
 * `last_run` alone has left the state — that stamp on its own is what stops a workspace where no
 * task applied from prompting again (REQ-WORKSPACE-079).
 */
export function isNeverInitialized(state: InitializationState): boolean {
  return state.lastRun === null && state.completed.length === 0 && state.skipped.length === 0;
}

/** REQ-WORKSPACE-078: a task is resolved when its id appears in either list. */
export function isResolved(state: InitializationState, id: string): boolean {
  return state.completed.includes(id) || state.skipped.includes(id);
}

function stringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) if (typeof entry === 'string' && entry.trim() !== '') out.push(entry);
  return out;
}

function classificationOf(value: unknown): WorkspaceClassification | null {
  return value === 'code' || value === 'non-code' ? value : null;
}

/** The workspace `agents.yaml` as a plain map, or null when it is absent, unreadable or not a mapping. */
export function readWorkspaceDocument(agentsFile: string): PlainMap | null {
  let text: string;
  try { text = readFileSync(agentsFile, 'utf8'); } catch { return null; }
  const parsed = parseConfig(text);
  if (!parsed.ok || parsed.value.root === null) return null;
  const plain = plainOf(parsed.value.root);
  return isPlainMap(plain) ? plain : null;
}

export function initializationOf(document: PlainMap | null): InitializationState {
  const section = document === null ? undefined : document['initialization'];
  if (!isPlainMap(section)) return NEVER_INITIALIZED;
  const lastRun = section['last_run'];
  return {
    completed: stringList(section['completed']),
    skipped: stringList(section['skipped']),
    lastRun: typeof lastRun === 'string' && lastRun.trim() !== '' ? lastRun : null,
    classification: classificationOf(section['classification']),
  };
}

export function readInitializationState(agentsFile: string): InitializationState {
  return initializationOf(readWorkspaceDocument(agentsFile));
}

/**
 * REQ-WORKSPACE-099: `project_init.source_extensions`, normalized — lower-cased, a leading dot added,
 * blanks dropped. `null` means the workspace states no override and the default 23 stand; an override
 * that normalizes to nothing at all is an override to the empty set, which classifies every tree
 * `non-code`, and is kept as stated rather than quietly read as "no override".
 */
export function sourceExtensionOverrideOf(document: PlainMap | null): readonly string[] | null {
  const section = document === null ? undefined : document['project_init'];
  if (!isPlainMap(section)) return null;
  const raw = section['source_extensions'];
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim().toLowerCase();
    if (trimmed === '' || trimmed === '.') continue;
    out.push(trimmed.startsWith('.') ? trimmed : `.${trimmed}`);
  }
  return out;
}

export type TaskOutcome = 'completed' | 'skipped';

export interface RecordedOutcome {
  readonly id: string;
  readonly outcome: TaskOutcome;
}

/**
 * REQ-WORKSPACE-079: the patch one recording produces. Move, never duplicate — every id being recorded
 * leaves both lists first and is then appended to the one chosen for it, so an id a hand-edited file
 * placed in both lists comes back in exactly one. `classification` is overwritten only by a non-null
 * value. `last_run` is stamped whatever else the recording carries, the degenerate "no task applied"
 * case included, which is the whole of what makes such a workspace stop counting as never-initialized.
 *
 * The patch names the `initialization:` section and nothing else; `overlaySection` replaces the two
 * lists wholesale (REQ-CONFIG-050) and leaves every other top-level key of the file untouched, which
 * is REQ-WORKSPACE-079's last sentence and REQ-WORKSPACE-147's atomicity through the one writer.
 */
export function recordPatch(state: InitializationState, outcomes: readonly RecordedOutcome[], classification: WorkspaceClassification | null, nowIso: string): PlainMap {
  const moving = new Set(outcomes.map((o) => o.id));
  const completed = state.completed.filter((id) => !moving.has(id));
  const skipped = state.skipped.filter((id) => !moving.has(id));
  for (const o of outcomes) (o.outcome === 'completed' ? completed : skipped).push(o.id);
  const next = classification ?? state.classification;
  return {
    initialization: {
      completed,
      skipped,
      last_run: nowIso,
      ...(next === null ? {} : { classification: next }),
    },
  };
}

/** The state the patch above will produce, without re-reading the file — what the coordinator publishes. */
export function applyRecord(state: InitializationState, outcomes: readonly RecordedOutcome[], classification: WorkspaceClassification | null, nowIso: string): InitializationState {
  const patch = recordPatch(state, outcomes, classification, nowIso)['initialization'] as PlainMap;
  return {
    completed: patch['completed'] as readonly string[],
    skipped: patch['skipped'] as readonly string[],
    lastRun: nowIso,
    classification: classificationOf(patch['classification']),
  };
}
