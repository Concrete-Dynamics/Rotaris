import { compareCodePoints } from '@rotaris/kernel';
import { info, warn, type Diagnostic, type Staged } from './diagnostics.js';
import type { McpOrigin, McpServerEntry } from './entry.js';

/**
 * REQ-MCP-038..042, 055..063, 078, 094: a persona's MCP surface as a PURE function of configuration plus the discovery
 * results it is handed (REQ-MCP-061). Grants are `undefined` (no entry: unrestricted) versus `[]` (nothing) and are
 * never collapsed (ADR-0034). Denial outranks every grant (REQ-MCP-004/056); candidate spellings are added, never
 * substituted (REQ-MCP-057); renaming applies to survivors only and is matched on the reported name alone
 * (REQ-MCP-005). Enablement is consulted at every call (REQ-MCP-078): the configured field and the session override.
 */
export interface DiscoveredTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface PersonaMcpInput {
  readonly persona: string;
  readonly carried: readonly string[];
  /** REQ-MCP-007: server → original tool names; null when the whole map is unset. */
  readonly grants: Readonly<Record<string, readonly string[]>> | null;
  /** REQ-MCP-039: the persona's generic tool list, for names that are configured servers. */
  readonly genericTools: readonly string[];
  readonly servers: Readonly<Record<string, McpServerEntry>>;
  readonly origins: Readonly<Record<string, McpOrigin>>;
  /** REQ-MCP-094: the session override — servers toggled off for this application process. */
  readonly sessionDisabled: ReadonlySet<string>;
  readonly availability: (name: string) => { readonly available: boolean; readonly detail?: string };
  /** What discovery holds for a server: its tools and whether the last attempt failed; null when never discovered. */
  readonly discovered: (name: string) => { readonly tools: readonly DiscoveredTool[]; readonly failed: boolean } | null;
  /**
   * The names already taken in the persona's aggregate surface (its native tools). The specification aggregates every
   * server's tools into one callable surface (REQ-MCP-069) and prints names per server (REQ-MCP-101) but never says what
   * happens when two servers, or a server and a native tool, report the same name. The reading taken here: a colliding
   * name is offered under the client-side prefix `<server>_` that REQ-MCP-057 already anticipates (so grants and denials
   * written against the reported name still match), and ONLY on collision, in code-point order of the servers, so the
   * printed name and the callable name stay one (REQ-MCP-062). Recorded in the ADR-0034 note.
   */
  readonly reservedNames?: ReadonlySet<string>;
}

export type DropReason = 'not-configured' | 'disabled' | 'unavailable' | 'discovery-failed';

export interface CallableTool {
  /** The name the model sees and calls (after renaming). */
  readonly callable: string;
  /** The server-reported name, what the dispatch sends. */
  readonly reported: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface ActiveServer {
  readonly name: string;
  readonly entry: McpServerEntry;
  readonly origin: McpOrigin;
  /** REQ-MCP-042: discovery failed — the server is listed in the prompt with no tools. */
  readonly discoveryFailed: boolean;
  readonly tools: readonly CallableTool[];
}

export interface DroppedServer {
  readonly name: string;
  readonly transport: string;
  readonly origin: McpOrigin | null;
  readonly reason: DropReason;
  readonly detail: string;
}

export interface PersonaMcpSurface {
  readonly persona: string;
  /** In code-point order by configured name (REQ-MCP-117). */
  readonly active: readonly ActiveServer[];
  readonly dropped: readonly DroppedServer[];
}

/** REQ-MCP-057: the literal name plus the unprefixed remainder under the three provider prefixes. */
export function candidateSpellings(server: string, reported: string): string[] {
  const out = [reported];
  for (const prefix of [`${server}_`, `mcp-${server}-`, `mcp__${server}__`]) if (reported.startsWith(prefix) && reported.length > prefix.length) out.push(reported.slice(prefix.length));
  return out;
}

/** REQ-MCP-056: denied if any spelling is in `disabled_tools`; else allowed when unrestricted; else when a spelling intersects the grant. */
export function grantDecision(server: string, reported: string, disabled: readonly string[], grant: readonly string[] | undefined): 'denied' | 'allowed' | 'not-granted' {
  const spellings = candidateSpellings(server, reported);
  if (spellings.some((s) => disabled.includes(s))) return 'denied';
  if (grant === undefined) return 'allowed';
  return spellings.some((s) => grant.includes(s)) ? 'allowed' : 'not-granted';
}

/**
 * The callable tools of one server for one grant: REQ-MCP-049's order (drop disabled, then rename), with the grant
 * applied between; REQ-MCP-005's second collision (a replacement equal to another survivor's reported name) reported.
 */
export function filterServerTools(server: string, entry: McpServerEntry, discovered: readonly DiscoveredTool[], grant: readonly string[] | undefined): Staged<CallableTool[]> {
  const diagnostics: Diagnostic[] = [];
  const survivors = discovered.filter((t) => grantDecision(server, t.name, entry.disabled_tools, undefined) !== 'denied');
  const survivorNames = new Set(survivors.map((t) => t.name));
  const out: CallableTool[] = [];
  for (const t of survivors) {
    if (grantDecision(server, t.name, entry.disabled_tools, grant) !== 'allowed') continue;
    const replacement = entry.tool_name_map[t.name];
    if (replacement !== undefined && replacement !== t.name && survivorNames.has(replacement)) {
      diagnostics.push(warn(`mcp ${server}: tool_name_map renames '${t.name}' to '${replacement}', which is the reported name of another surviving tool of the same server; the rename is refused for this tool (REQ-MCP-005)`, 'process', `mcp.rename-collision.${server}.${t.name}`, { server }));
      out.push({ callable: t.name, reported: t.name, description: t.description, inputSchema: t.inputSchema });
      continue;
    }
    out.push({ callable: replacement ?? t.name, reported: t.name, description: t.description, inputSchema: t.inputSchema });
  }
  out.sort((a, b) => compareCodePoints(a.callable, b.callable));
  return { value: out, diagnostics };
}

/** The whole surface for one persona — the five cases of REQ-MCP-055 and the drop rules, every warning a value. */
export function resolvePersonaMcp(input: PersonaMcpInput): Staged<PersonaMcpSurface> {
  const diagnostics: Diagnostic[] = [];
  const { persona } = input;
  // REQ-MCP-039: a configured server named in the generic tool list is treated as carried, with the move-it warning.
  const carried = [...input.carried];
  for (const t of input.genericTools) {
    if (Object.prototype.hasOwnProperty.call(input.servers, t) && !carried.includes(t)) {
      carried.push(t);
      diagnostics.push(warn(`persona ${persona}: '${t}' in its tools list is a configured MCP server; it is treated as one — move it to mcp_servers (REQ-MCP-039, REQ-MCP-105)`, 'process', `mcp.generic-server.${persona}.${t}`, { persona, server: t }));
    }
  }
  const active: ActiveServer[] = [];
  const dropped: DroppedServer[] = [];
  const taken = new Set(input.reservedNames ?? []);
  for (const name of [...new Set(carried)].sort(compareCodePoints)) {
    const entry = input.servers[name];
    const origin = input.origins[name] ?? null;
    if (!entry) {
      // (a) REQ-MCP-038.
      diagnostics.push(warn(`persona ${persona} carries MCP server '${name}', which is not configured; the run proceeds without it (REQ-MCP-038)`, 'process', `mcp.missing.${persona}.${name}`, { persona, server: name }));
      dropped.push({ name, transport: '', origin, reason: 'not-configured', detail: 'not present in configuration' });
      continue;
    }
    if (!entry.enabled || input.sessionDisabled.has(name)) {
      // REQ-MCP-040: informational, no warning, no issue.
      const by = !entry.enabled ? "its configured 'enabled: false' (REQ-CONFIG-465)" : 'the session override of the MCP settings category (REQ-MCP-094)';
      diagnostics.push(info(`persona ${persona}: MCP server '${name}' is disabled by ${by}; skipped (REQ-MCP-040)`, 'process', '', { persona, server: name }));
      dropped.push({ name, transport: entry.type, origin, reason: 'disabled', detail: `disabled by ${by}` });
      continue;
    }
    const avail = input.availability(name);
    if (!avail.available) {
      // REQ-MCP-041: a per-persona warning; the detailed line is the caller's once-per-process diagnostic.
      diagnostics.push(warn(`persona ${persona}: MCP server '${name}' is unavailable — ${avail.detail ?? 'its command was not found on PATH'}; its tools will not be available (REQ-MCP-041)`, 'process', `mcp.unavailable.${persona}.${name}`, { persona, server: name }));
      dropped.push({ name, transport: entry.type, origin, reason: 'unavailable', detail: avail.detail ?? 'the command was not found on PATH' });
      continue;
    }
    const disc = input.discovered(name);
    const grant = input.grants === null ? undefined : Object.prototype.hasOwnProperty.call(input.grants, name) ? input.grants[name] : undefined;
    if (disc === null || disc.failed) {
      if (disc?.failed) diagnostics.push(warn(`persona ${persona}: MCP server '${name}' failed tool discovery; its tools may be unavailable (REQ-MCP-042)`, 'process', `mcp.discovery-failed.${persona}.${name}`, { persona, server: name }));
      // REQ-MCP-101: an active server with no known tools renders as its bare name; REQ-MCP-114 records it as carried.
      active.push({ name, entry, origin: origin ?? 'default', discoveryFailed: disc?.failed ?? false, tools: [] });
      continue;
    }
    const filtered = filterServerTools(name, entry, disc.tools, grant);
    diagnostics.push(...filtered.diagnostics);
    const tools = filtered.value.map((t) => {
      if (!taken.has(t.callable)) { taken.add(t.callable); return t; }
      const prefixed = `${name}_${t.callable}`;
      diagnostics.push(info(`persona ${persona}: the tool name '${t.callable}' of server '${name}' is already taken in the persona's surface; offered as '${prefixed}' (the client-side prefix of REQ-MCP-057)`, 'process', `mcp.prefixed.${persona}.${name}.${t.callable}`, { persona, server: name }));
      taken.add(prefixed);
      return { ...t, callable: prefixed };
    }).sort((a, b) => compareCodePoints(a.callable, b.callable));
    // REQ-MCP-058: inert grant entries reported once per (server, tool) per process.
    if (grant !== undefined) {
      for (const g of grant) {
        const matches = disc.tools.some((t) => candidateSpellings(name, t.name).includes(g));
        if (!matches) diagnostics.push(info(`persona ${persona}: mcp_tools grants '${g}' on server '${name}', which matched no tool the server reports; the entry is inert (REQ-MCP-058)`, 'process', `mcp.inert-grant.${name}.${g}`, { persona, server: name }));
      }
      if (filtered.value.length < disc.tools.length) diagnostics.push(info(`persona ${persona}: ${filtered.value.length} of ${disc.tools.length} tools granted on server '${name}' (REQ-MCP-059)`, 'process', '', { persona, server: name }));
    }
    active.push({ name, entry, origin: origin ?? 'default', discoveryFailed: false, tools });
  }
  return { value: { persona, active, dropped }, diagnostics };
}

/**
 * REQ-MCP-060: the recomputation after a list change — the same decision, then intersected with the connect-time set
 * (only ever narrows). The connect-time tools are matched by REPORTED name (a collision prefix is a presentation of the
 * surface, not of the decision) and returned under their connect-time callable names.
 */
export function narrowAfterUpdate(server: string, entry: McpServerEntry, updated: readonly DiscoveredTool[], grant: readonly string[] | undefined, connectTime: readonly CallableTool[]): CallableTool[] {
  const allowed = new Set(filterServerTools(server, entry, updated, grant).value.map((t) => t.reported));
  return connectTime.filter((t) => allowed.has(t.reported));
}
