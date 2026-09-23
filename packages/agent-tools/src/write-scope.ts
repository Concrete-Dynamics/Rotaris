import { canonicalToolName } from './registry.js';

/**
 * PD-TOOLS-006: the tools a write scope fences. Only the file tools' own writes pass through a path the gate can
 * compare against a claim — `terminal`, `git_commit`, MCP and plugin tools can still write a claimed path, which is
 * the cost the directive states rather than a gap left here. Every `write_file` operation counts, `undo` included.
 */
export function fencedByWriteScope(toolName: string): boolean {
  const name = canonicalToolName(toolName);
  return name === 'write_file' || name === 'haet_edit';
}

/** What a write-scope refusal names: the child whose live claim holds the path, its persona and the pattern that matched. */
export interface WriteClaimHolder {
  readonly canonicalName: string;
  readonly persona: string;
  readonly pattern: string;
}

/** PD-TOOLS-006's refusal, in the form the directive fixes, pointing to the two ways forward. */
export function writeScopeRefusal(rel: string, holder: WriteClaimHolder): string {
  return `${rel} is inside the write scope of ${holder.canonicalName} (${holder.persona}), which is still running: '${holder.pattern}'. The write was not executed. Choose a path outside that scope, or wait for ${holder.canonicalName} with wait_for_tasks.`;
}
