/**
 * THE ONE RULE FOR "THIS START REFUSAL PROVES NO RUN EXISTS" (REQ-MCP-124/126). Two main-side places ask it and must
 * never drift: the inbound coordinator, which holds the surface's one-run slot and frees it only on a positive proof
 * (`inbound-runs.ts`), and the shared start coordinator, which may take a session-created worktree away again only when
 * nothing came to exist (`session-start.ts`). The rule is the same in both, because it is the same question.
 *
 * The run host's own `refused` reply is not one thing. Its validated refusals — `session.no-model`, `session.confinement`,
 * `session.workspace-none`, `workspace.not-open` and their like — answer that the run was refused BEFORE anything was
 * dispatched, and those DO prove no run. But four codes carry no such assurance:
 *
 * - `run-host.unreachable`: main's OWN reading of a no-reply within the bound. The bound may simply have been shorter than
 *   the host's work (its credential lease is bounded at 45 s), so the host may still start the run.
 * - `request.failed`: the host's own dispatch raised an exception. The throw may sit ANYWHERE in the dispatch, so a run
 *   may already have been dispatched.
 * - `request.malformed`: the host could not read the request. It proves the REQUEST was bad, not that nothing ran.
 * - `reply.unexpected`: a reply of a kind this start does not answer with. It says nothing about the run.
 *
 * Anything outside that set is a definite refusal. A caller that would free a resource, or delete a tree, on a start
 * refusal must ask this, never test one code by hand.
 */
export function isDefiniteStartRefusal(code: string): boolean {
  return code !== 'run-host.unreachable' && code !== 'reply.unexpected' && code !== 'request.failed' && code !== 'request.malformed';
}
