/**
 * REQ-SESSION-194's cut, the one copy every bounded text in the engine uses — the handoff (REQ-SESSION-115), the open
 * offers list (PD-ORCH-004 revision 3) and the pending tasks a plan cycle held after a resumed iteration is told
 * (PD-ORCH-003 revision 2): `cap` characters at most, the last three an ellipsis, and never between the two halves of
 * a surrogate pair (found by phase 6's review). It lives under run/ so the session manager and the run share it
 * without the run importing the session manager.
 */
export function cut(text: string, cap: number): string {
  if (text.length <= cap) return text;
  const end = Math.max(0, cap - 3);
  const kept = end > 0 && /[\uD800-\uDBFF]/.test(text[end - 1]!) ? end - 1 : end;
  return `${text.slice(0, kept)}...`;
}
