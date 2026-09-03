import { commandPatternMatches, hookGlob, type HookEntry } from '@rotaris/config';
import { isToolHookEvent, type HookEvent } from '@rotaris/contracts';

/**
 * REQ-HOOKS-021..029: which hooks a tool call selects. Matchers apply to tool events only; a lifecycle
 * hook fires on every occurrence. The text compared against is the same facet the permission policy
 * matches on: the command line for `terminal`, the requested action name for a file-editing tool, and
 * `''` for a tool with neither (REQ-HOOKS-029). Total over every input (REQ-HOOKS-028).
 */
export interface ToolOccurrence {
  readonly toolName: string;
  /** The policy facet text; empty when the tool supplies none. */
  readonly facetText: string;
}

export function hookMatchesCall(hook: HookEntry, call: ToolOccurrence): boolean {
  if (!isToolHookEvent(hook.event)) return true;
  // REQ-HOOKS-023: an imported hook's tool-name set decides alone.
  if (hook.toolNames !== undefined && hook.toolNames.length > 0) return hook.toolNames.includes(call.toolName);
  // REQ-HOOKS-022: an empty matcher selects every tool call.
  if (hook.matcher === '') return true;
  const facet = call.facetText;
  // REQ-HOOKS-027: a blank facet compares the matcher with the tool name as one case-sensitive glob.
  if (facet.trim() === '') return hookGlob(hook.matcher, call.toolName);
  return commandPatternMatches(hook.matcher, facet);
}

/** The hooks applicable to one occurrence, declaration order preserved (REQ-HOOKS-019). */
export function selectHooks(index: ReadonlyMap<HookEvent, readonly HookEntry[]>, event: HookEvent, call: ToolOccurrence | null): readonly HookEntry[] {
  const forEvent = index.get(event);
  if (forEvent === undefined || forEvent.length === 0) return [];
  if (call === null) return forEvent;
  return forEvent.filter((h) => hookMatchesCall(h, call));
}

/** REQ-HOOKS-131/135: the per-event index, built once for a run from the fixed set; disabled entries never enter it. */
export function indexByEvent(hooks: readonly HookEntry[]): ReadonlyMap<HookEvent, readonly HookEntry[]> {
  const m = new Map<HookEvent, HookEntry[]>();
  for (const h of hooks) {
    if (!h.enabled) continue;
    const list = m.get(h.event);
    if (list) list.push(h);
    else m.set(h.event, [h]);
  }
  return m;
}
