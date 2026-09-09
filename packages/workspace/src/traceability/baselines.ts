import { identifierOf, identifierPattern } from './identifiers.js';

/**
 * The three debt baselines (REQ-TRACE-116 to REQ-TRACE-129): shrink-only ratchets that may lose entries and never
 * gain them. Shared parsing (117): UTF-8, split into lines, each stripped, blanks and `#` lines skipped, a malformed
 * line reported with `<path>:<line>: ` counted 1-based over the raw file. A missing file is no error and yields no
 * entries. Every header states, in the file, that it may only shrink, how the debt is paid, the exact pruning
 * action, and that entries must never be added for new work (121).
 */
export type DebtFlag = 'test' | 'trace';
export const PRUNE_ACTION = 'the requirements view’s "Update baselines" action (REQ-TRACE-510)';

export interface MalformedLine { readonly path: string; readonly line: number; readonly text: string; readonly message: string }

export interface DebtBaseline { readonly entries: Map<number, Set<DebtFlag>>; readonly malformed: MalformedLine[] }
export interface PathBaseline { readonly entries: Set<string>; readonly malformed: MalformedLine[] }

function lines(text: string | null): { line: number; text: string }[] {
  if (text === null) return [];
  const out: { line: number; text: string }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim();
    if (t.length === 0 || t.startsWith('#')) return;
    out.push({ line: i + 1, text: t });
  });
  return out;
}

function malformed(path: string, line: number, text: string, expected: string): MalformedLine {
  return { path, line, text, message: `${path}:${line}: malformed baseline line ${JSON.stringify(text)}; expected ${expected}` };
}

/** REQ-TRACE-118: `<id> <flag> [<flag>]`, flags from {trace, test}, repeats merged by set union. */
export function parseDebtBaseline(text: string | null, prefix: string, path: string): DebtBaseline {
  const entries = new Map<number, Set<DebtFlag>>();
  const out: MalformedLine[] = [];
  const id = identifierPattern(prefix);
  for (const { line, text: t } of lines(text)) {
    const parts = t.split(/\s+/);
    const m = id.exec(parts[0]!);
    const flags = parts.slice(1);
    if (!m || flags.length < 1 || flags.length > 2 || !flags.every((f) => f === 'trace' || f === 'test')) {
      out.push(malformed(path, line, t, `<${prefix}-n> followed by one or two of the flags trace and test`));
      continue;
    }
    const n = Number(m[1]);
    const set = entries.get(n) ?? new Set<DebtFlag>();
    for (const f of flags) set.add(f as DebtFlag);
    entries.set(n, set);
  }
  return { entries, malformed: out };
}

export function renderDebtBaseline(entries: ReadonlyMap<number, ReadonlySet<DebtFlag>>, prefix: string): string {
  const header = [
    '# Trace/test debt baseline. This file may only SHRINK: entries may be removed and are never added.',
    `# One line per requirement: <${prefix}-n> followed by the flags still unmet (trace, test), sorted.`,
    '# Debt is paid by adding the missing implementation trace or covering test; the entry is then pruned by',
    `# ${PRUNE_ACTION}.`,
    '# Never add an entry for new work: new debt of any kind is an error (REQ-TRACE-116).',
  ];
  const body = [...entries.keys()].sort((a, b) => a - b).filter((n) => (entries.get(n)?.size ?? 0) > 0).map((n) => `${identifierOf(prefix, n)} ${[...entries.get(n)!].sort().join(' ')}`);
  return `${[...header, ...body].join('\n')}\n`;
}

/** REQ-TRACE-119: one path per line; deliberately loose — the basename contains a dot and the line holds no space. */
export function parseOrphanModuleBaseline(text: string | null, path: string): PathBaseline {
  const entries = new Set<string>();
  const out: MalformedLine[] = [];
  for (const { line, text: t } of lines(text)) {
    const base = t.slice(t.lastIndexOf('/') + 1);
    if (t.includes(' ') || !base.includes('.')) { out.push(malformed(path, line, t, 'one repository-relative source path whose file name carries an extension')); continue; }
    entries.add(t);
  }
  return { entries, malformed: out };
}

export function renderOrphanModuleBaseline(entries: ReadonlySet<string>, exemptMarker: string): string {
  const header = [
    '# Orphan-module baseline. This file may only SHRINK: entries may be removed and are never added.',
    '# Each line names a production module that holds no implementation trace. Pay the debt by tracing the module',
    `# to the requirement it serves, authoring a technical requirement with an origin, or marking it ${JSON.stringify(exemptMarker)}`,
    `# if it is intentionally trace-free; the entry is then pruned by ${PRUNE_ACTION}.`,
    '# Never add an entry for new work: a new orphan module is an error (REQ-TRACE-116).',
  ];
  return `${[...header, ...[...entries].sort()].join('\n')}\n`;
}

const ORPHAN_TEST_ENTRY = /^\S+\.[^\s:./]+(?:::[^\s:]+)*::[^\s:]+$/;

/** REQ-TRACE-120: a path with an extension, zero or more `::` class segments, and a final `::` test segment. */
export function parseOrphanTestBaseline(text: string | null, path: string): PathBaseline {
  const entries = new Set<string>();
  const out: MalformedLine[] = [];
  for (const { line, text: t } of lines(text)) {
    if (!ORPHAN_TEST_ENTRY.test(t)) { out.push(malformed(path, line, t, '<path with an extension>::<test function>, optionally with ::<Class> segments between')); continue; }
    entries.add(t);
  }
  return { entries, malformed: out };
}

export function renderOrphanTestBaseline(entries: ReadonlySet<string>, exemptMarker: string): string {
  const header = [
    '# Orphan-test baseline. This file may only SHRINK: entries may be removed and are never added.',
    '# Each line names a collected test function carrying no coverage annotation or comment reference. Pay the debt',
    `# by annotating the test with the requirement it covers, or marking it ${JSON.stringify(exemptMarker)} within its window;`,
    `# the entry is then pruned by ${PRUNE_ACTION}.`,
    '# Never add an entry for new work: a new orphan test is an error (REQ-TRACE-116).',
  ];
  return `${[...header, ...[...entries].sort()].join('\n')}\n`;
}

/** REQ-TRACE-124: per-identifier intersection of recorded and currently unmet flags; bootstrap records all current debt once. */
export function ratchetDebt(existing: ReadonlyMap<number, ReadonlySet<DebtFlag>> | null, current: ReadonlyMap<number, ReadonlySet<DebtFlag>>): Map<number, Set<DebtFlag>> {
  const out = new Map<number, Set<DebtFlag>>();
  if (existing === null) {
    for (const [n, flags] of current) if (flags.size > 0) out.set(n, new Set(flags));
    return out;
  }
  for (const [n, recorded] of existing) {
    const now = current.get(n);
    if (now === undefined) continue;
    const kept = new Set<DebtFlag>([...recorded].filter((f) => now.has(f)));
    if (kept.size > 0) out.set(n, kept);
  }
  return out;
}

/** REQ-TRACE-125: plain set intersection; bootstrap when absent. */
export function ratchetSet(existing: ReadonlySet<string> | null, current: ReadonlySet<string>): Set<string> {
  if (existing === null) return new Set(current);
  return new Set([...existing].filter((e) => current.has(e)));
}

/** REQ-TRACE-122: suppression is per flag. */
export function suppressed(baseline: ReadonlyMap<number, ReadonlySet<DebtFlag>>, n: number, flag: DebtFlag): boolean {
  return baseline.get(n)?.has(flag) ?? false;
}
