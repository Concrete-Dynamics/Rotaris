/**
 * The layers a role's prompt gains before it becomes an agent's — the playbook (REQ-ORCH-019/020) and the always-active
 * context units (REQ-WORKSPACE-047/060). Moved out of `run.ts` so that `children/orchestration.ts`, which `run.ts` imports,
 * reaches them without importing `run.ts` back (an import cycle, R-091); `run.ts` re-exports both.
 */

/** REQ-ORCH-019/020: the playbook after the role's own instructions, once. */
export function withPlaybook(systemPrompt: string, playbook: string): string {
  return playbook === '' ? systemPrompt : `${systemPrompt}\n\n${playbook}`;
}

/**
 * REQ-WORKSPACE-047/060 (ADR-0063) — the always-active context units, after the role's instructions and its
 * playbook, in the order the caller supplies. REQ-WORKSPACE-060 fixes that order as **workspace context →
 * skill catalog → force-loaded skill bodies → persona memory**, and the caller is the one place that knows
 * all four; this composes what it is given and adds nothing.
 *
 * It is deliberately a **list** rather than four parameters: one of the four units is not built in this release
 * (persona memory), and a signature naming it would have to change when it arrives. Workspace-context injection
 * (REQ-WORKSPACE-041..050) is built and arrives first in the list (`apps/desktop/src/run-host/skills.ts`); until
 * 2026-10-13 this comment listed it as not built too. An empty unit contributes nothing, so a slot that is not
 * filled costs no separator.
 *
 * Applied at the two places a role's prompt becomes an agent's — the entry turn and a child's construction —
 * so REQ-WORKSPACE-065's "every agent built for a session sees the same catalog" holds by construction: the
 * units are a property of the session, composed onto whatever prompt the role resolved.
 */
export function withContextUnits(systemPrompt: string, units: readonly string[]): string {
  const present = units.filter((u) => u.trim() !== '');
  return present.length === 0 ? systemPrompt : [systemPrompt, ...present].join('\n\n');
}
