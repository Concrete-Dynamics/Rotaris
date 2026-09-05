import { compareCodePoints } from '@rotaris/kernel';
import type { PersonaMcpSurface } from './persona.js';

/**
 * REQ-MCP-101, byte-exact: ONE heading everywhere; `_No MCP servers configured._` when no active server; else one
 * top-level bullet per active server in code-point order by configured name — `` `name` `` when no tool is known,
 * ``**`name`**`` with one indented child bullet per tool (`- `, the callable name in code, then ` — description`
 * only when non-empty) in code-point order by the printed name. The names are exactly REQ-MCP-062's: after denial,
 * grants and renaming. REQ-MCP-102's project-memories block is owed with ADR-0035's manifest.
 */
export const MCP_SECTION_HEADING = '## MCP servers' as const;
export const NO_MCP_SERVERS_LINE = '_No MCP servers configured._' as const;

export function renderMcpSection(surface: PersonaMcpSurface): string {
  const lines: string[] = [MCP_SECTION_HEADING, ''];
  if (surface.active.length === 0) {
    lines.push(NO_MCP_SERVERS_LINE);
    return lines.join('\n');
  }
  for (const server of [...surface.active].sort((a, b) => compareCodePoints(a.name, b.name))) {
    if (server.tools.length === 0) { lines.push(`- \`${server.name}\``); continue; }
    lines.push(`- **\`${server.name}\`**`);
    for (const tool of [...server.tools].sort((a, b) => compareCodePoints(a.callable, b.callable))) {
      lines.push(`  - \`${tool.callable}\`${tool.description === '' ? '' : ` — ${tool.description}`}`);
    }
  }
  return lines.join('\n');
}

/** REQ-MCP-062: the set of names the section prints, per server — what the callable set must equal at render time. */
export function printedNames(surface: PersonaMcpSurface): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const s of surface.active) out.set(s.name, new Set(s.tools.map((t) => t.callable)));
  return out;
}
