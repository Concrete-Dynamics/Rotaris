import { withholdsOn } from './registry.js';

/**
 * REQ-ORCH-153's planning grants, as ONE predicate over the registry (ADR-0062).
 *
 * "the tool set it would otherwise hold, less every tool the public tool-name registry declares as writing
 * workspace files or running commands (REQ-TOOLS-001), with a tool the registry carries no declaration for
 * counting as declaring all three." The second clause is already the direction-aware accessor's job:
 * `withholdsOn` answers `true` for a name outside the table, so every MCP tool and every plugin name is
 * withheld at the gate without a second table to keep in step (ADR-0016's fail-closed reading, reused).
 *
 * The `readsWorkspaceFiles` facet is deliberately NOT consulted: the requirement names two facets and a plan
 * is written by reading. `read_file`, `grep`, `glob`, `haet_read`, `fetch`, `todo`, `delegate` and the artifact
 * tools all survive the narrowing, which is what makes a plan cycle able to produce a plan at all.
 *
 * `isPublicTool` is whether the surface serves this name with the public tool of that name — the run host's
 * `publicTool` predicate, PD-TOOLS-004's seam. The registry answers by NAME, and a name is not a declaration: a
 * server's tool offered as `read_file` (a persona's MCP surface prefixes a server's tool only when its name is
 * already taken) carries none, so it is withheld like every other undeclared tool whatever it is called. Until
 * 2026-09-28 both readers asked the registry about the name alone and such a tool survived the hold
 * (`docs/defects/fixed/an-mcp-tool-offered-under-a-public-name-is-ruled-as-that-public-tool.md`). The default
 * serves the caller that narrows a persona's DECLARED names, which REQ-TOOLS-002 keeps public.
 */
export function withheldUnderPlanGate(name: string, isPublicTool = true): boolean {
  if (!isPublicTool) return true;
  return withholdsOn(name, 'writesWorkspaceFiles') || withholdsOn(name, 'runsCommands');
}

/**
 * The refusal the model reads when a withheld call is dispatched anyway (REQ-TOOLS-013's shape, this gate's reason).
 *
 * The remedy names the act, not the state. It read "Finish the plan" until 2026-09-16, which a role that had
 * already written one could only read as an instruction to keep going: the run that found this spent its hold
 * re-trying withheld calls and then asking for approval with `ask_questions`, a tool no plan gate reads. What
 * ends the hold is a message — the turn's last one — and then a decision the user takes in the product.
 */
export function planGateRefusal(name: string): string {
  return `The '${name}' call was refused: this run is held at the plan gate, so every tool that writes workspace files or runs commands is withheld until the plan is approved (REQ-ORCH-153). Write the plan as the final message of this turn and stop; the product presents it to the user, and their approval releases these tools for the rest of the run.`;
}
