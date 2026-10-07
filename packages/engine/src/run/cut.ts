/**
 * REQ-SESSION-194's cut, the one copy its users share — the handoff (REQ-SESSION-115), the open offers list
 * (PD-ORCH-004 revision 3), the pending tasks a plan cycle held after a resumed iteration is told (PD-ORCH-003
 * revision 2) and, since 2026-10-06, the tool log's 2,000-character cut of an error-path record's arguments and result
 * (`SessionWriter.settleToolCall`, REQ-SESSION-136; the result cut here whole, the arguments value by value through
 * `cutArguments` below, which keeps their shape and never cuts a path, an identifier, a count or a timestamp, as
 * PD-SESSION-003 narrows REQ-SESSION-136 and REQ-SESSION-194) — and that the session list's 80-character label (`Sessions.list`)
 * also calls, as it did before the move. Other bounds in the engine cut differently and are not this one (the intent
 * classifier's and a child report's).
 * FALSIFIED, kept beside its replacement (live-run M3,
 * docs/defects/fixed/an-error-path-tool-record-cuts-its-arguments-and-result-without-the-cut-marker.md): "the tool log's
 * 2,000-character cut … cut[s] differently and [is] not this one". REQ-SESSION-194 names that cut among those its marker
 * governs, and the writer's bare `slice` left a cut value that no reader could tell from a whole one. `cap` characters
 * at most, the last three an ellipsis, and never between the two halves of a surrogate pair (found by phase 6's
 * review). It lives under run/ so the session manager and the run share it without the run importing the session
 * manager.
 */
export function cut(text: string, cap: number): string {
  if (text.length <= cap) return text;
  const end = Math.max(0, cap - 3);
  const kept = end > 0 && /[\uD800-\uDBFF]/.test(text[end - 1]!) ? end - 1 : end;
  return `${text.slice(0, kept)}...`;
}

const MARKER = '...';
/** The last word of a key that names a path, an identifier or a timestamp (`file_path`, `task_ids`, `filePath`, `created_at`). */
const WHOLE_WORDS = new Set(['path', 'paths', 'file', 'files', 'filename', 'dir', 'directory', 'cwd', 'url', 'uri', 'id', 'ids', 'slug', 'ref', 'refs', 'hash', 'name', 'names', 'at', 'timestamp', 'time', 'date', 'since', 'until']);
/**
 * Keys of this product's own tools whose values are identifiers or path patterns though their last word does not say so
 * (PD-SESSION-003 (d)). `delegate`'s `inherited_context` (sibling task ids) and `attach_artifacts` (artifact ids or slugs,
 * REQ-TOOLS-152) joined on 2026-10-07: until then a failed delegate call's id lists were cut as free text
 * (docs/defects/fixed/a-delegate-calls-sibling-and-artifact-ids-can-be-cut-in-an-error-path-record.md).
 */
const WHOLE_KEYS = new Set(['persona', 'supersedes', 'depends_on', 'continuation_of', 'write_scope', 'inherited_context', 'attach_artifacts']);

/**
 * REQ-SESSION-136's error-path cut of a tool record's ARGUMENTS under REQ-SESSION-194 whole, its last sentence included:
 * "Counts, identifiers, paths and timestamps are never truncated." (the fin23 verifier's finding, 2026-10-06, on the first
 * repair of live-run M3, docs/defects/fixed/an-error-path-tool-record-cuts-its-arguments-and-result-without-the-cut-marker.md).
 * FALSIFIED, kept beside its replacement: the first repair stored arguments that do not fit as "the head of their JSON
 * text, marked". A head keeps whatever the model serialised first, so `{content: <1,990 characters>, path: '/ws/x.ts'}` lost
 * its path whole, and a path that began near character 1,997 was cut through.
 *
 * Arguments whose JSON text fits `cap` are returned as they are. Otherwise the shape is kept — an object stays an object
 * with every key — and only free-text string values are cut, each with `cut`'s marker, longest first, until the JSON text
 * fits. A value is a path, an identifier or a timestamp by its key (`argumentKeptWhole`), and is never cut, nor anything
 * beneath it; a number, a boolean and null are never cut (a count among them). Where what is kept whole cannot fit `cap`
 * on its own, every free-text value is cut to the marker alone and the record exceeds `cap`. That is PD-SESSION-003, which
 * narrows REQ-SESSION-136's "truncated to 2000 characters" and REQ-SESSION-194's "never exceeds its cap" for this one cut
 * (OQ-209, ruled 2026-10-07 under the owner's delegation, R-072, confirming the reading the build proceeded under).
 */
export function cutArguments(args: Readonly<Record<string, unknown>>, cap: number): Readonly<Record<string, unknown>> {
  const text = JSON.stringify(args);
  if (text.length <= cap) return args;
  const copy = JSON.parse(text) as Record<string, unknown>;
  const leaves: { holder: Record<string, unknown> | unknown[]; key: string | number; original: string }[] = [];
  const walk = (holder: Record<string, unknown> | unknown[], key: string | number): void => {
    const v = (holder as Record<string | number, unknown>)[key];
    if (typeof v === 'string') leaves.push({ holder, key, original: v });
    else if (Array.isArray(v)) v.forEach((_, i) => walk(v, i));
    else if (v !== null && typeof v === 'object') for (const k of Object.keys(v)) if (!argumentKeptWhole(k)) walk(v as Record<string, unknown>, k);
  };
  for (const k of Object.keys(copy)) if (!argumentKeptWhole(k)) walk(copy, k);
  // Longest first, in key order on a tie. Cutting `over` characters from a string takes at least `over` from its JSON text
  // (an escaped character is longer there, never shorter), so each value is either cut once to fit or cut to the marker.
  leaves.sort((a, b) => b.original.length - a.original.length);
  let over = text.length - cap;
  for (const leaf of leaves) {
    if (over <= 0) break;
    if (leaf.original.length <= MARKER.length) continue;
    const shorter = cut(leaf.original, Math.max(MARKER.length, leaf.original.length - over));
    over -= JSON.stringify(leaf.original).length - JSON.stringify(shorter).length;
    (leaf.holder as Record<string | number, unknown>)[leaf.key] = shorter;
  }
  return copy;
}

/** Whether an argument's key names a path, an identifier or a timestamp, which REQ-SESSION-194 never truncates. */
export function argumentKeptWhole(key: string): boolean {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0);
  return WHOLE_KEYS.has(words.join('_')) || WHOLE_WORDS.has(words.at(-1) ?? '');
}
