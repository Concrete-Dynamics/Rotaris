import { isPlainMap } from '../merge.js';
import { typeName, type ProblemSink } from './field.js';
import { readMcpServerEntry, type McpServerEntry } from '../mcp/entry.js';

/**
 * `mcp_servers:` (REQ-MCP-001, REQ-MCP-008) read from the MERGED document — defaults, the discovered files (their
 * entries already validated and the broken ones dropped, REQ-MCP-023), global YAML, workspace YAML, field-wise per name
 * (REQ-MCP-025). Every defect found here is therefore a YAML scope's: fatal, and EVERY one is reported, not the first
 * (REQ-MCP-002, ADR-0034 "accumulate, then reject"). `mcp_server_sources` is machine-maintained (REQ-MCP-008): a
 * hand-written value is overwritten by the loader's own origin map (REQ-MCP-026) and never read.
 */
export function readMcpServersSection(value: unknown, sink: ProblemSink): Record<string, McpServerEntry> {
  const out: Record<string, McpServerEntry> = {};
  if (value === undefined || value === null) return out;
  if (!isPlainMap(value)) { sink.errors.push({ path: 'mcp_servers', message: `must be a mapping of server entries, got ${typeName(value)}` }); return out; }
  for (const [name, raw] of Object.entries(value)) {
    const read = readMcpServerEntry(name, raw, { kind: 'yaml', file: 'agents.yaml' });
    for (const d of read.diagnostics) {
      const path = d.message.split(':')[0] ?? `mcp_servers.${name}`;
      const message = d.message.slice(path.length + 1).trim();
      if (d.severity === 'error') sink.errors.push({ path, message });
      else sink.warnings.push({ path, message });
    }
    if (read.entry) out[name] = read.entry;
  }
  return out;
}
