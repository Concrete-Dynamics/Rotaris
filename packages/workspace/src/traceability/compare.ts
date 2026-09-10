import { millis, type Clocks } from '@rotaris/kernel';
import { compareReqIds, type AnnotationSite, type ChangeEntry, type StoreParse, type SweepResult } from '@rotaris/contracts';
import { invokeGit, type GitResult } from '../git/invoke.js';
import { recoverEntries, type RecoveredEntry } from './artifact.js';
import { identifierOf } from './identifiers.js';
import type { ResolvedLayout } from './layout.js';
import { indexSweep } from './verify.js';

/**
 * Change comparison against a base revision (REQ-TRACE-156 to REQ-TRACE-170, 511): each requirement's "before"
 * is taken from the generated artifact AS COMMITTED at the base (157) — never by re-reading the historical
 * documents — and compared with the working tree's content hash. An unavailable base is reported as such with
 * nothing computed and nothing drifting (158). The changed-file set is the union of two version-control queries,
 * each merged only when it succeeded (159). Every git call is a read-only child process bounded at 30 s (170).
 */
export const VCS_TIMEOUT = millis(30_000);

export const CHANGE_OBLIGATIONS: Readonly<Record<ChangeEntry['kind'], string>> = {
  added: 'Implement the requirement, then attach both annotations: the implementation trace on the implementing element and the coverage annotation on the covering test.',
  removed: 'Delete each listed reference or point it at another requirement.',
  modified: 'Re-check every site in the list against the rewritten text.',
  status: "Bring the existing references into line with the requirement's new lifecycle.",
};

export interface CompareInput {
  readonly root: string;
  readonly layout: ResolvedLayout;
  readonly parse: StoreParse;
  readonly sweep: SweepResult;
  /** The base revision; REQ-TRACE-511's default is the revision the working tree sits on (`HEAD`). */
  readonly base: string;
  readonly clocks: Clocks;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly executable?: string;
}

export interface CompareOutput {
  readonly entries: readonly ChangeEntry[];
  readonly drift: boolean;
  readonly noBase: boolean;
  readonly unpropagated: number;
  readonly baseEntries: number;
  readonly changedFiles: readonly string[];
  readonly queries: readonly { readonly name: string; readonly ok: boolean }[];
}

const okText = (r: GitResult): string | null => (r.outcome === 'exited' && r.status === 0 ? r.stdout : null);

/** REQ-TRACE-160: pure classification given the current records, the base snapshot, the site index and the changed set. */
export function classifyChanges(parse: StoreParse, base: readonly RecoveredEntry[], sweep: SweepResult, layout: ResolvedLayout, changed: ReadonlySet<string>): ChangeEntry[] {
  const index = indexSweep(sweep, layout);
  const baseByNumber = new Map(base.map((e) => [e.number, e]));
  const sitesOf = (n: number): AnnotationSite[] => index.references.get(n) ?? [];
  const untouched = (sites: readonly AnnotationSite[]): boolean => sites.length > 0 && !sites.some((s) => changed.has(s.path));
  const entries: ChangeEntry[] = [];
  for (const r of parse.records) {
    const b = baseByNumber.get(r.number);
    const sites = sitesOf(r.number);
    if (b === undefined) { entries.push({ kind: 'added', id: r.id, title: r.title, obligation: CHANGE_OBLIGATIONS.added, drift: false, sites }); continue; }
    if (b.contentHash !== r.contentHash) {
      const e: { -readonly [K in keyof ChangeEntry]: ChangeEntry[K] } = { kind: 'modified', id: r.id, title: r.title, obligation: CHANGE_OBLIGATIONS.modified, drift: r.status === 'approved' && untouched(sites), sites };
      if (b.status !== r.status) { e.from = b.status; e.to = r.status; }
      entries.push(e);
      continue;
    }
    if (b.status !== r.status) entries.push({ kind: 'status', id: r.id, title: r.title, from: b.status, to: r.status, obligation: CHANGE_OBLIGATIONS.status, drift: false, sites });
  }
  const current = new Set(parse.records.map((r) => r.number));
  for (const b of base) {
    if (current.has(b.number)) continue;
    const sites = sitesOf(b.number);
    entries.push({ kind: 'removed', id: identifierOf(layout.idPrefix, b.number), title: b.title, from: b.status, obligation: CHANGE_OBLIGATIONS.removed, drift: untouched(sites), sites });
  }
  // REQ-TRACE-289/494 (Part AJ2): change-comparison entries by identifier, through contracts' one comparator.
  return entries.sort((a, b) => compareReqIds(a.id, b.id));
}

export async function compareAgainstBase(input: CompareInput): Promise<CompareOutput> {
  const { root, layout, clocks } = input;
  const git = (args: readonly string[]) => invokeGit({ args, workspaceRoot: root, timeoutMs: VCS_TIMEOUT, timers: clocks.timers, clock: clocks.monotonic, ...(input.env ? { env: input.env } : {}), ...(input.executable ? { executable: input.executable } : {}) });
  const queries: { name: string; ok: boolean }[] = [];
  // REQ-TRACE-157/158: the base artifact as committed at the base; unavailable, empty or unusable → no base.
  const shown = await git(['show', `${input.base}:${layout.generatedPath}`]);
  const artifact = okText(shown);
  queries.push({ name: 'show', ok: artifact !== null });
  const base = recoverEntries(artifact);
  if (base.length === 0) return { entries: [], drift: false, noBase: true, unpropagated: 0, baseEntries: 0, changedFiles: [], queries };
  // REQ-TRACE-159: tracked changes between the base and the working tree, and untracked-but-not-ignored files.
  const changed = new Set<string>();
  const tracked = okText(await git(['diff', '--name-only', input.base]));
  queries.push({ name: 'diff', ok: tracked !== null });
  if (tracked !== null) for (const l of tracked.split(/\r?\n/)) if (l.trim().length > 0) changed.add(l.trim());
  const untracked = okText(await git(['ls-files', '--others', '--exclude-standard']));
  queries.push({ name: 'ls-files', ok: untracked !== null });
  if (untracked !== null) for (const l of untracked.split(/\r?\n/)) if (l.trim().length > 0) changed.add(l.trim());
  const entries = classifyChanges(input.parse, base, input.sweep, layout, changed);
  const unpropagated = entries.filter((e) => e.drift).length;
  return { entries, drift: unpropagated > 0, noBase: false, unpropagated, baseEntries: base.length, changedFiles: [...changed].sort(), queries };
}
