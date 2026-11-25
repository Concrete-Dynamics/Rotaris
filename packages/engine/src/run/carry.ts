import type { SessionId } from '@rotaris/kernel';
import type { ChatMessage } from '@rotaris/model';
import type { StoreDal } from '@rotaris/store';

/**
 * PD-ORCH-021 (R-134) — the conversation a continuation's first root carries over.
 *
 * Before the directive every root a continuation started was fresh: it was sent REQ-SESSION-115's handoff (the last six
 * transcript rows at 700 characters, the latest artifact, the todo, the progress) and nothing else, so a follow-up in the
 * same session rediscovered the workspace the previous root had already read. The first fresh root of a continued run now
 * begins with the conversation of the session's most recent root, read from its record (PD-ORCH-005 clause 1) as a resume
 * reads it — compressed where it was compressed — and is then sent its payload as the next user message.
 */

/**
 * The task id of the session's most recent root other than `exclude`: an iteration's or a plan cycle's, whichever was
 * opened last. The two times are the writer's own ISO instants, so they compare as text (as `latestArtifactText` does).
 * Null where the session has none.
 */
export function previousRootTaskId(dal: StoreDal, sessionId: SessionId, exclude: string): string | null {
  const roots = [
    ...dal.iterationsOf(sessionId).map((r) => ({ id: r.root_task_id, at: r.opened_at })),
    ...dal.planRootsOf(sessionId).map((r) => ({ id: r.root_task_id, at: r.opened_at })),
  ].filter((r) => r.id !== exclude && r.id !== '');
  let latest: { id: string; at: string } | null = null;
  for (const r of roots) if (latest === null || r.at >= latest.at) latest = r;
  return latest?.id ?? null;
}

/**
 * The part of a recorded conversation that may be carried: everything up to and including its last assistant message
 * that calls no tool — the root's last answer. What follows it (a call left unanswered by a cancel, a correction or a
 * steer the root never read) is dropped, and so is any earlier tool call the record holds no result for (a turn that
 * ended at the call), so every tool call carried has its result and a provider is never sent an unpaired one. Empty
 * where the root never answered.
 */
export function carriedConversation(messages: readonly ChatMessage[]): ChatMessage[] {
  let end = -1;
  for (let i = messages.length - 1; i >= 0 && end < 0; i -= 1) {
    const m = messages[i]!;
    if (m.role === 'assistant' && !m.content.some((p) => p.kind === 'tool-call')) end = i;
  }
  const kept = messages.slice(0, end + 1);
  const answered = new Set(kept.flatMap((m) => (m.role === 'tool' ? m.content.map((p) => p.callId) : [])));
  const out: ChatMessage[] = [];
  for (const m of kept) {
    if (m.role !== 'assistant') { out.push(m); continue; }
    const content = m.content.filter((p) => p.kind !== 'tool-call' || answered.has(p.callId));
    if (content.length > 0) out.push(content.length === m.content.length ? m : { role: 'assistant', content });
  }
  return out;
}
