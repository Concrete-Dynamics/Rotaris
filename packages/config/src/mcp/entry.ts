import { isPlainMap } from '../merge.js';
import { typeName } from '../sections/field.js';
import { fatal, warn, type Diagnostic } from './diagnostics.js';

/**
 * REQ-MCP-001 — the product's single definition of the tool-server entry schema: exactly these fields, these types,
 * these defaults. Every surface that presents, validates, stores, merges or documents an entry cites the requirement
 * and reads this type; none holds a second copy of the list.
 */
export const MCP_TRANSPORTS = ['stdio', 'http', 'sse'] as const;
export type McpTransport = (typeof MCP_TRANSPORTS)[number];

export interface McpStaticTool {
  readonly name: string;
  readonly description: string;
}

export interface McpServerEntry {
  readonly type: McpTransport;
  readonly command: string | null;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string | null;
  readonly url: string | null;
  readonly headers: Readonly<Record<string, string>> | null;
  readonly request_timeout: number | null;
  readonly disabled_tools: readonly string[];
  readonly tool_name_map: Readonly<Record<string, string>>;
  /** REQ-MCP-006: inert — never affects what is advertised or callable. */
  readonly tools: readonly McpStaticTool[];
  /** REQ-CONFIG-465: default true. */
  readonly enabled: boolean;
}

export const MCP_ENTRY_KEYS = ['type', 'command', 'args', 'env', 'cwd', 'url', 'headers', 'request_timeout', 'disabled_tools', 'tool_name_map', 'tools', 'enabled'] as const;

export const MCP_ENTRY_DEFAULTS: McpServerEntry = Object.freeze({
  type: 'stdio', command: null, args: [], env: {}, cwd: null, url: null, headers: null, request_timeout: null, disabled_tools: [], tool_name_map: {}, tools: [], enabled: true,
});

export type McpOrigin = 'yaml' | 'discovered-project' | 'discovered-user' | 'default';

/**
 * Read one entry from a plain mapping. `source` decides severity (ADR-0034): from a YAML scope every defect is fatal
 * and ALL are reported (REQ-MCP-002 — the caller accumulates, then rejects); from a discovery file the entry is dropped
 * with a warning naming server and source and the rest continue (REQ-MCP-023). Unknown keys: a discovery file's are
 * ignored with one warning per (file, server, key) per load (REQ-MCP-027); a YAML scope's warn and contribute nothing
 * (REQ-CONFIG-233).
 */
export function readMcpServerEntry(name: string, value: unknown, source: { readonly kind: 'yaml' | 'discovered'; readonly file: string }): { readonly entry: McpServerEntry | null; readonly diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const isYaml = source.kind === 'yaml';
  const where = isYaml ? `mcp_servers.${name}` : `${source.file} → ${name}`;
  const defect = (field: string, message: string): void => {
    diagnostics.push(isYaml
      ? fatal(`${where}.${field}: ${message}`, `mcp.load.${name}.${field}`, { server: name })
      : warn(`${where}: ${field} ${message}; the entry is dropped (REQ-MCP-023)`, 'load', `mcp.discovered.${source.file}.${name}.${field}`, { server: name }));
  };
  if (!isPlainMap(value)) {
    defect('entry', `must be a mapping, got ${typeName(value)}`);
    return { entry: null, diagnostics };
  }
  let broken = false;
  const fail = (field: string, message: string): void => { broken = true; defect(field, message); };
  for (const key of Object.keys(value)) {
    if ((MCP_ENTRY_KEYS as readonly string[]).includes(key)) continue;
    diagnostics.push(warn(isYaml ? `${where}.${key}: unknown key '${key}' is not recognised by this build and contributes nothing` : `${source.file}: server '${name}' carries the key '${key}', which this product does not read; ignored (REQ-MCP-027)`, 'load', `mcp.unknown-key.${source.file}.${name}.${key}`, { server: name, channels: 'log' }));
  }
  const str = (key: string): string | null => {
    const v = value[key];
    if (v === undefined || v === null) return null;
    if (typeof v === 'string') return v;
    fail(key, `must be a string, got ${typeName(v)}`);
    return null;
  };
  const strList = (key: string): string[] => {
    const v = value[key];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) { fail(key, `must be a list of strings, got ${typeName(v)}`); return []; }
    return [...v];
  };
  const strMap = (key: string): Record<string, string> | null => {
    const v = value[key];
    if (v === undefined || v === null) return null;
    if (!isPlainMap(v)) { fail(key, `must be a mapping of strings, got ${typeName(v)}`); return null; }
    const out: Record<string, string> = {};
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'string') out[k] = x;
      else if (typeof x === 'number' || typeof x === 'boolean') out[k] = String(x);
      else fail(`${key}.${k}`, `must be a string, got ${typeName(x)}`);
    }
    return out;
  };
  // Transport: explicit `type` wins; else a url implies http; else stdio (REQ-MCP-001/020).
  const rawType = value['type'];
  let type: McpTransport = 'stdio';
  if (rawType !== undefined && rawType !== null) {
    if (typeof rawType === 'string' && (MCP_TRANSPORTS as readonly string[]).includes(rawType)) type = rawType as McpTransport;
    else fail('type', `'${String(rawType)}' is not one of ${MCP_TRANSPORTS.join(', ')}`);
  } else if (typeof value['url'] === 'string' && value['url'] !== '') type = 'http';
  const command = str('command');
  const url = str('url');
  const cwd = str('cwd');
  const args = strList('args');
  const env = strMap('env') ?? {};
  const headers = strMap('headers');
  const disabledTools = strList('disabled_tools');
  const toolNameMap = strMap('tool_name_map') ?? {};
  let requestTimeout: number | null = null;
  const rt = value['request_timeout'];
  if (rt !== undefined && rt !== null) {
    // REQ-MCP-003: a whole number greater than zero, never silently treated as unset.
    if (typeof rt === 'number' && Number.isInteger(rt) && rt > 0) requestTimeout = rt;
    else fail('request_timeout', `must be a whole number of seconds greater than zero, got ${typeof rt === 'number' ? String(rt) : typeName(rt)} (REQ-MCP-003)`);
  }
  let enabled = true;
  const en = value['enabled'];
  if (en !== undefined && en !== null) {
    if (typeof en === 'boolean') enabled = en;
    else fail('enabled', `must be a boolean, got ${typeName(en)}`);
  }
  const tools: McpStaticTool[] = [];
  const st = value['tools'];
  if (st !== undefined && st !== null) {
    if (!Array.isArray(st)) fail('tools', `must be a list, got ${typeName(st)}`);
    else st.forEach((t, i) => {
      if (!isPlainMap(t) || typeof t['name'] !== 'string') { fail(`tools.${i}`, 'must be a mapping with a name'); return; }
      tools.push({ name: t['name'], description: typeof t['description'] === 'string' ? t['description'] : '' });
    });
  }
  // REQ-MCP-002: a stdio entry without a command, or with an empty or whitespace one, is one defect reported alike.
  if (type === 'stdio' && (command === null || command.trim() === '')) fail('command', `a ${type} server needs a command; it is ${command === null ? 'absent' : 'empty'} (REQ-MCP-002)`);
  if (type !== 'stdio' && (url === null || url.trim() === '')) fail('url', `a ${type} server needs a url; it is ${url === null ? 'absent' : 'empty'} (REQ-MCP-002)`);
  // REQ-MCP-005: two entries of one map may not share a replacement name.
  const seenReplacement = new Map<string, string>();
  for (const [from, to] of Object.entries(toolNameMap)) {
    const other = seenReplacement.get(to);
    if (other !== undefined) fail('tool_name_map', `both '${other}' and '${from}' are renamed to '${to}' on server '${name}' (REQ-MCP-005)`);
    seenReplacement.set(to, from);
  }
  if (broken) return { entry: null, diagnostics };
  return { entry: { type, command, args, env, cwd, url, headers, request_timeout: requestTimeout, disabled_tools: disabledTools, tool_name_map: toolNameMap, tools, enabled }, diagnostics };
}
