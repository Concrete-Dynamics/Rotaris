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
 */
export function withheldUnderPlanGate(name: string): boolean {
  return withholdsOn(name, 'writesWorkspaceFiles') || withholdsOn(name, 'runsCommands');
}

/** The refusal the model reads when a withheld call is dispatched anyway (REQ-TOOLS-013's shape, this gate's reason). */
export function planGateRefusal(name: string): string {
  return `The '${name}' call was refused: this run is held at the plan gate, so every tool that writes workspace files or runs commands is withheld until the plan is approved (REQ-ORCH-153). Finish the plan; the user's approval releases these tools for the rest of the run.`;
}
