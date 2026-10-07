import { countNoun } from '@rotaris/kernel';
import { isReadyArtifactStatus } from '@rotaris/contracts';
import type { ArtifactRecord } from './record.js';

/**
 * REQ-LIBRARY-097 and REQ-LIBRARY-098 — the two context blocks a newly created agent is given.
 *
 * The sibling index is automatic and bounded at 10,000 characters; the full block is explicit
 * (`attach_artifacts` on `delegate`) and bounded at REQ-TOOLS-152's 100,000 (PD-TOOLS-006 revision 5, which narrows
 * REQ-TOOLS-152 and REQ-LIBRARY-098 to one figure and one dropping rule). Both report what they left out: the index by an
 * elision marker naming the `artifact_list` tool, the full block by naming the ids it elided and the references it could
 * not resolve. The wording of each marker is the implementation's; what it must convey is the requirement's.
 *
 * The full block's budget was 48,000 until 2026-10-07, REQ-LIBRARY-098's figure, read as the one that governed. It was not:
 * REQ-TOOLS-152 calls itself the whole `delegate` contract, REQ-ORCH-032 hands the oversized attachment to it, and domain
 * 05's limits inventory carries 100,000; REQ-LIBRARY-098's restatement was the one the reconciliation missed (OQ-221, AB1).
 */
export const SIBLING_INDEX_BUDGET = 10_000;
export const FULL_CONTEXT_BUDGET = 100_000;
export const SIBLING_SUMMARY_CAP = 160;
export const SIBLING_INDEX_HEADING = 'PRIOR SIBLING ARTIFACT INDEX';
export const FULL_CONTEXT_HEADING = 'PRIOR AGENT CONTEXT (FULL)';

function summaryOf(record: ArtifactRecord): string {
  const flat = record.summary.replace(/\s+/g, ' ').trim();
  return flat.length > SIBLING_SUMMARY_CAP ? flat.slice(0, SIBLING_SUMMARY_CAP) : flat;
}

/**
 * REQ-LIBRARY-097's total order: every artifact whose status is neither `succeeded` nor `published` first —
 * "so a failure is never the entry elided while a success survives" — then the ready ones; within each
 * group newest first by creation time, ties broken by ASCENDING id, so two readings of the same session
 * produce the same block.
 */
export function siblingIndexOrder(records: readonly ArtifactRecord[]): readonly ArtifactRecord[] {
  const rank = (r: ArtifactRecord) => (isReadyArtifactStatus(r.status) ? 1 : 0);
  return [...records].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function siblingIndexLine(record: ArtifactRecord): string {
  return `- ${record.slug} (${record.id}) persona=${record.sourcePersona ?? '—'} status=${record.status} — ${summaryOf(record)}`;
}

/**
 * REQ-LIBRARY-097: artifacts are dropped from the TAIL of that total order until the block fits, and the
 * block then ends with a marker stating how many were left out and naming `artifact_list` as the way to
 * reach them. An empty store produces no block at all — a heading over nothing would tell a child that
 * siblings exist.
 */
export function siblingIndexBlock(records: readonly ArtifactRecord[], budget = SIBLING_INDEX_BUDGET): { readonly text: string; readonly included: number; readonly elided: number } {
  const ordered = siblingIndexOrder(records.filter((r) => r.supersededBy === null));
  if (ordered.length === 0) return { text: '', included: 0, elided: 0 };
  const head = `${SIBLING_INDEX_HEADING}\n`;
  const marker = (n: number, first: boolean) => `${first ? '' : '\n'}… ${countNoun(n, 'further artifact')} ${n === 1 ? 'is' : 'are'} not listed here; call artifact_list to reach them.`;
  const lines = ordered.map(siblingIndexLine);
  for (let take = lines.length; take >= 0; take -= 1) {
    const elided = lines.length - take;
    const text = `${head}${lines.slice(0, take).join('\n')}${elided > 0 ? marker(elided, take === 0) : ''}`;
    // A budget that fits nothing still carries the marker rather than nothing at all: a child told nothing
    // would not know the session holds artifacts, and REQ-LIBRARY-097 makes naming `artifact_list` the remedy.
    if (text.length <= budget) return { text, included: take, elided };
  }
  return { text: '', included: 0, elided: ordered.length };
}

export interface AttachedResolution {
  readonly reference: string;
  readonly record: ArtifactRecord | null;
  readonly body: string | null;
  /** Why the body is absent: unresolvable reference, or a document that could not be read (REQ-LIBRARY-091). */
  readonly failure: string | null;
}

/** What the full block carried and left out, by id and reference; `included` is `carried.length`. */
export interface FullContextBlock {
  readonly text: string;
  readonly included: number;
  /** The ids carried whole, in the caller's order. */
  readonly carried: readonly string[];
  /** The ids left out because their whole body would have carried the section past the budget. */
  readonly elided: readonly string[];
  /** The references that named no artifact. */
  readonly unresolved: readonly string[];
  /** The ids whose document could not be read (REQ-LIBRARY-091). */
  readonly unreadable: readonly string[];
}

/**
 * REQ-LIBRARY-098 as PD-TOOLS-006 revision 5 narrows it with REQ-TOOLS-152: the explicitly attached artifacts, in the order
 * they were named, inside a 100,000-character section. Each body is carried whole or not at all. One whose whole section
 * would carry the block past the budget is left out, and every later attachment is still tried: REQ-TOOLS-152's "and so is
 * every attachment after it" no longer governs, so a short attachment named after a long one still arrives. The budget is
 * measured over the heading and the carried sections, the separator between two sections included, so a block that fits
 * exactly is carried; the closing notes naming what was left out sit outside it. Unresolvable references, unreadable
 * documents and elided ids are reported IN the block, so a child is never left to infer that an attachment it was promised
 * is missing, and returned, so the caller's observation names the same ids (`selectAttachments`).
 */
export function fullContextBlock(resolved: readonly AttachedResolution[], budget = FULL_CONTEXT_BUDGET): FullContextBlock {
  const unresolved = resolved.filter((r) => r.record === null).map((r) => r.reference);
  const failures = resolved.filter((r) => r.record !== null && r.body === null);
  const usable = resolved.filter((r) => r.record !== null && r.body !== null);
  const head = `${FULL_CONTEXT_HEADING}\n`;
  const sections: string[] = [];
  const carried: string[] = [];
  const elided: string[] = [];
  let used = head.length;
  for (const entry of usable) {
    const record = entry.record!;
    // Every section after the first is set off by one more newline, which the budget counts.
    const section = `${sections.length > 0 ? '\n' : ''}\n## ${record.slug} (${record.id}) — ${record.title}\n\n${entry.body ?? ''}`;
    if (used + section.length > budget) { elided.push(record.id); continue; }
    used += section.length;
    sections.push(section);
    carried.push(record.id);
  }
  const unreadable = failures.map((f) => f.record!.id);
  const notes: string[] = [];
  for (const f of failures) notes.push(`\n(the document of ${f.record!.id} could not be read: ${f.failure ?? 'unknown reason'})`);
  if (unresolved.length > 0) notes.push(`\n(${countNoun(unresolved.length, 'attached reference')} could not be resolved: ${unresolved.join(', ')})`);
  if (elided.length > 0) notes.push(`\n(${countNoun(elided.length, 'attached artifact')} did not fit the ${budget.toLocaleString('en-US')}-character context budget and ${elided.length === 1 ? 'was' : 'were'} left out: ${elided.join(', ')}; call artifact_read to fetch ${elided.length === 1 ? 'it' : 'one'})`);
  const outcome = { included: sections.length, carried, elided, unresolved, unreadable };
  if (sections.length === 0 && notes.length === 0) return { text: '', ...outcome };
  return { text: `${head}${sections.join('')}${notes.join('')}`, ...outcome };
}
