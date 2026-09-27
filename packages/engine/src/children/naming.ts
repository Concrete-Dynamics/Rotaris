import { createHash, randomBytes } from 'node:crypto';
import type { SessionId } from '@rotaris/kernel';
import type { StoreDal } from '@rotaris/store';

/**
 * REQ-ORCH-036/044/045: task ids `bg_` + 8 hex, unique per session; canonical names — whitespace runs
 * collapsed, every character outside `[A-Za-z0-9_.-]` replaced by `-`, leading/trailing `-`, `.`, `_`
 * stripped, `task` when nothing remains, at most 80 characters with an 8-hex SHA-256 suffix over the
 * pre-shortening name; per-parent uniqueness by `_<n>` counting from 1.
 */
export function canonicaliseName(given: string): string {
  let s = given.replace(/\s+/g, ' ').replace(/[^A-Za-z0-9_.-]/g, '-').replace(/^[-._]+/, '').replace(/[-._]+$/, '');
  if (s === '') s = 'task';
  if (s.length > 80) {
    const digest = createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 8);
    s = `${s.slice(0, 71)}-${digest}`;
  }
  return s;
}

/** REQ-ORCH-044: a reused name under the same parent becomes `<name>_<n>`, the smallest n not in use. */
export function uniqueUnderParent(canonical: string, taken: ReadonlySet<string>): string {
  if (!taken.has(canonical)) return canonical;
  for (let n = 1; ; n += 1) {
    const candidate = `${canonical}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function mintTaskId(taken: ReadonlySet<string>): string {
  for (;;) {
    const id = `bg_${randomBytes(4).toString('hex')}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * REQ-ORCH-036 / PD-ORCH-005: every task id the session has used — each child's and each recorded iteration root's — so
 * a new id never repeats one the conversation record is keyed by (it is keyed by task id across the whole session).
 */
export function takenTaskIds(dal: StoreDal | undefined, sessionId: SessionId): Set<string> {
  if (!dal) return new Set();
  return new Set([...dal.childrenOf(sessionId).map((c) => c.task_id), ...dal.iterationsOf(sessionId).map((i) => i.root_task_id)]);
}
