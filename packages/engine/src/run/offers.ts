import type { SessionId } from '@rotaris/kernel';
import type { ChatMessage, ContentPart } from '@rotaris/model';
import type { AgentMessageRow, ChildRow, StoreDal } from '@rotaris/store';
import { parseReport } from '../children/notify.js';
import { cut } from './cut.js';
import { conversationOf } from './record.js';

/**
 * PD-ORCH-004 revisions 3 and 4 — how a later root learns of an open continuation offer. The list is told to the root
 * of a new run in the handoff's progress context, to a resumed root at the continue that resumes it, and to the root
 * of each later iteration of the same run in that iteration's first message — each root once. It lives here, beside
 * the run, so the run can tell a later iteration's root without the run importing the session manager (which imports
 * the run: the import would close a cycle).
 */

/** PD-ORCH-004 revision 3: how many open offers a later root is told of — the newest; the rest are elided. */
const OFFERS_TOLD = 10;
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
 * PD-ORCH-004 revision 3: the children whose continuation offer no child has taken up — the open offers — in the order
 * they were spawned.
 */
function openOffers(dal: StoreDal, sessionId: SessionId): ChildRow[] {
  const all = dal.childrenOf(sessionId);
  const continued = new Set(all.flatMap((c) => (c.continuation_of === null ? [] : [c.continuation_of])));
  return all.filter((c) => typeof parseReport(c)?.cut_off?.continuation_offer === 'string' && !continued.has(c.task_id));
}

/** PD-ORCH-004 revision 4: the task ids of every open offer — what a handoff built now covers, named or left out. */
export function openOfferIds(dal: StoreDal, sessionId: SessionId): ReadonlySet<string> {
  return new Set(openOffers(dal, sessionId).map((c) => c.task_id));
}

/**
 * PD-ORCH-004 revision 3: the continuation offers the session holds that no child has taken up, which a later root may
 * take up — each by its child's name and task id, the newest ten, with the way to take one up (OQ-99). A new iteration's
 * root reads it in the handoff's progress context, a resumed root at the continue (only those `include` admits).
 * Empty when there is none.
 */
export function openOffersText(dal: StoreDal, sessionId: SessionId, include: (taskId: string) => boolean = () => true): string {
  const open = openOffers(dal, sessionId).filter((c) => include(c.task_id));
  if (open.length === 0) return '';
  const told = open.slice(-OFFERS_TOLD).map((c) => `- ${cut(c.canonical_name, 80)} (${c.task_id})`);
  const elided = open.length > OFFERS_TOLD ? [ELIDED_LINE] : [];
  return [OFFERS_HEADER, ...elided, ...told].join('\n');
}

/**
 * PD-ORCH-004 revision 3: the task id of the oldest offer each offers list in `parts` names, for every list that says
 * earlier offers were left out — the newest ten it names are the tail of the offers open when it was built, so every
 * offer open then and spawned before its oldest line was left out of it.
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
 * PD-ORCH-004 revision 4: what the root of an execution iteration is told of the open offers in its first message — the
 * offers its first message has not already told it, as a text part of their own, or null when there are none. An offer
 * is told when the message holds it (`offersToldIn`), and also when it is one of `covered`, the offers open when the
 * launch content's handoff was built: that list names the newest ten and says the rest were left out, which is the whole
 * of what the directive tells a root, so an offer it left out is not named again beside it. The root of a continuation's
 * first iteration therefore reads them all in its handoff and is told nothing more, and so is every later iteration it
 * re-sends that handoff to, but for the offers raised since — whichever child raised one, however early it was spawned;
 * a later continue that resumes one of them finds its lists in its record (`offersHeldIn`), so each root is told once
 * (OQ-107).
 */
export function offersForFirstMessage(dal: StoreDal, sessionId: SessionId, first: readonly ContentPart[], covered: ReadonlySet<string> = new Set()): ContentPart | null {
  const held = offersToldIn([{ role: 'user', content: first }]);
  const text = openOffersText(dal, sessionId, (taskId) => !held.has(taskId) && !covered.has(taskId));
  return text === '' ? null : { kind: 'text', text };
}

/**
 * PD-ORCH-004 revision 4: the offers a root's recorded conversation (`rows`, as `agentConversation` reads them) already
 * holds, so a continue that resumes it tells it only the others. An offer is held when the conversation names it
 * (`offersToldIn`), and also when a list recorded as a message of its own left it out as earlier: an offer spawned
 * before the oldest one that list names, which the record shows raised no later than the list was recorded — a child's
 * offer is raised as it ends (`completed_at`), and one that has none recorded counts as raised before. An offer raised
 * after the list was recorded is not held by it, however early its child was spawned. A list a compression carried into
 * the conversation holds only what it names, as the compression's summary of a list holds nothing (OQ-107).
 */
export function offersHeldIn(dal: StoreDal, sessionId: SessionId, rows: readonly AgentMessageRow[]): ReadonlySet<string> {
  const held = new Set(offersToldIn(conversationOf(rows)));
  const children = dal.childrenOf(sessionId);
  const order = new Map(children.map((c, i) => [c.task_id, i]));
  for (const row of rows) {
    // A replacement's body is the compressed conversation, an array with no role of its own: only what it names counts
    // (PD-ORCH-005 clause 12 writes every compression into the record, so every compressed root's resume meets one). The
    // role check below is what passes it by; the lists the compression carried are counted through `conversationOf`.
    const message = JSON.parse(row.body) as ChatMessage;
    if (message.role !== 'user') continue;
    for (const oldest of elidedBeforeIn(message.content)) {
      const floor = order.get(oldest) ?? -1;
      for (const [i, c] of children.entries()) if (i < floor && (c.completed_at === null || c.completed_at <= row.at)) held.add(c.task_id);
    }
  }
  return held;
}
