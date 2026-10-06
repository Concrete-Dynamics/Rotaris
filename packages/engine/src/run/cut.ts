/**
 * REQ-SESSION-194's cut, the one copy its users share — the handoff (REQ-SESSION-115), the open offers list
 * (PD-ORCH-004 revision 3), the pending tasks a plan cycle held after a resumed iteration is told (PD-ORCH-003
 * revision 2) and, since 2026-10-06, the tool log's 2,000-character cut of an error-path record's arguments and result
 * (`SessionWriter.settleToolCall`, REQ-SESSION-136) — and that the session list's 80-character label (`Sessions.list`)
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
