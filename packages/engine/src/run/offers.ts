import type { SessionId } from '@rotaris/kernel';
import type { ChatMessage, ContentPart } from '@rotaris/model';
import type { StoreDal } from '@rotaris/store';
import { parseReport } from '../children/notify.js';
import { cut } from './cut.js';

/**
 * PD-ORCH-004 revisions 3 and 4 — how a later root learns of an open continuation offer. The list is told to the root
 * of a new run in the handoff's progress context, to a resumed root at the continue that resumes it, and to the root
 * of each later iteration of the same run in that iteration's first message — each root once. It lives here, beside
 * the run, so the run can tell a later iteration's root without the run importing the session manager (which imports
 * the run: the import would close a cycle).
 */

/** PD-ORCH-004 revision 3: how many open offers a later root is told of — the newest; the rest are elided. */
export const OFFERS_TOLD = 10;
export const OFFERS_HEADER = 'Open continuation offers (delegate with `continuation_of` set to the task id to take one up):';
/** The line a list carries, after its header, when it left earlier offers out. */
const ELIDED_LINE = '- [... earlier continuation offers elided]';

/**
 * PD-ORCH-004 revision 3: the task ids whose continuation offer a conversation already holds — the offer itself, as a
 * child's report carries it (`continuation_of: "<id>"`, in a message or a tool result), or a line of an offers list it
 * was told, alone or in a handoff. A task id merely mentioned is not an offer told (found by phase 6's fourth review).
 */
export function offersToldIn(messages: readonly ChatMessage[]): ReadonlySet<string> {
  const told = new Set<string>();
  for (const m of messages) {
    for (const p of m.content) {
      const text = p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '';
      for (const hit of text.matchAll(/continuation_of: \\?"(bg_[0-9a-f]{8})\\?"/g)) told.add(hit[1]!);
      if (p.kind !== 'text') continue;
      // An offers list stands alone when a resumed root is told it, and inside the handoff a new iteration's root reads.
      for (let at = p.text.indexOf(OFFERS_HEADER); at >= 0; at = p.text.indexOf(OFFERS_HEADER, at + 1)) {
        for (const line of p.text.slice(at + OFFERS_HEADER.length + 1).split('\n')) {
          if (!line.startsWith('- ')) break;
          const hit = /\((bg_[0-9a-f]{8})\)$/.exec(line);
          if (hit !== null) told.add(hit[1]!);
        }
      }
    }
  }
  return told;
}

/**
 * PD-ORCH-004 revision 3: the continuation offers the session holds that no child has taken up, which a later root may
 * take up — each by its child's name and task id, the newest ten, with the way to take one up (OQ-72). A new iteration's
 * root reads it in the handoff's progress context, a resumed root at the continue (only those `include` admits).
 * Empty when there is none.
 */
export function openOffersText(dal: StoreDal, sessionId: SessionId, include: (taskId: string) => boolean = () => true): string {
  const all = dal.childrenOf(sessionId);
  const continued = new Set(all.flatMap((c) => (c.continuation_of === null ? [] : [c.continuation_of])));
  const open = all.filter((c) => typeof parseReport(c)?.cut_off?.continuation_offer === 'string' && !continued.has(c.task_id) && include(c.task_id));
  if (open.length === 0) return '';
  const told = open.slice(-OFFERS_TOLD).map((c) => `- ${cut(c.canonical_name, 80)} (${c.task_id})`);
  const elided = open.length > OFFERS_TOLD ? [ELIDED_LINE] : [];
  return [OFFERS_HEADER, ...elided, ...told].join('\n');
}

/**
 * PD-ORCH-004 revision 3: whether an offers list in `parts` said earlier offers were left out, and the task ids of the
 * oldest offer each such list names — the newest ten it names are the tail of the offers open when it was built, so
 * every offer before its oldest line was left out of it.
 */
function elidedBeforeIn(parts: readonly ContentPart[]): string[] {
  const oldest: string[] = [];
  for (const p of parts) {
    if (p.kind !== 'text') continue;
    for (let at = p.text.indexOf(OFFERS_HEADER); at >= 0; at = p.text.indexOf(OFFERS_HEADER, at + 1)) {
      const lines = p.text.slice(at + OFFERS_HEADER.length + 1).split('\n');
      if (lines[0] !== ELIDED_LINE) continue;
      const first = lines.slice(1).map((line) => /^- .*\((bg_[0-9a-f]{8})\)$/.exec(line)).find((hit) => hit !== null);
      if (first) oldest.push(first[1]!);
    }
  }
  return oldest;
}

/**
 * PD-ORCH-004 revision 4: what the root of an execution iteration is told of the open offers in its first message —
 * the offers its first message has not already told it, as a text part of their own, or null when there are none. An
 * offer is told when the message holds it (`offersToldIn`), and also when a list it holds left it out as one of the
 * earlier offers: that list names the newest ten and says the rest were left out, which is the whole of what the
 * directive tells a root, so an elided offer is not named again beside it. The root of a continuation's first
 * iteration therefore reads them all in its handoff and is told nothing more, and so is every later iteration it
 * re-sends that handoff to, but for the offers raised since; a later continue that resumes one of them finds its list in
 * its record (`offersToldIn`), so each root is told once (OQ-80).
 */
export function offersForFirstMessage(dal: StoreDal, sessionId: SessionId, first: readonly ContentPart[]): ContentPart | null {
  const held = offersToldIn([{ role: 'user', content: first }]);
  const order = new Map(dal.childrenOf(sessionId).map((c, i) => [c.task_id, i]));
  // Every offer spawned before the oldest a list names that elided earlier ones was left out by it, and counts as told.
  const floor = Math.max(-1, ...elidedBeforeIn(first).map((id) => order.get(id) ?? -1));
  const text = openOffersText(dal, sessionId, (taskId) => !held.has(taskId) && (order.get(taskId) ?? Infinity) >= floor);
  return text === '' ? null : { kind: 'text', text };
}
