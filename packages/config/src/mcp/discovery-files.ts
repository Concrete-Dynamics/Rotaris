import { readFileSync } from 'node:fs';
import { posix, win32 } from 'node:path';
import { isPlainMap } from '../merge.js';
import { typeName } from '../sections/field.js';
import { warn, type Diagnostic, type Staged } from './diagnostics.js';
import { readMcpServerEntry, type McpOrigin, type McpServerEntry } from './entry.js';

/**
 * REQ-MCP-017..024, 027: the two `mcp.json` discovery files, consumed strictly READ-ONLY (never rewritten; a test
 * hashes the file across loads). Locations: `<workspace>/.mcp.json` (`discovered-project`) and one user-level file
 * (`discovered-user`): macOS `~/Library/Application Support/mcp.json`, Windows `%APPDATA%/mcp.json` — user-level
 * discovery SKIPPED ENTIRELY when `APPDATA` is unset — else `~/.config/mcp.json`. Project beats user on a name
 * collision (REQ-MCP-024). Every fault is a warning that contributes nothing; nothing here fails a load.
 */
export interface DiscoveryLocations {
  readonly project: string;
  readonly user: string | null;
}

/**
 * The platform is a PARAMETER throughout this module, so the separators come from IT and never from the host the
 * code happens to run on: `node:path`'s host-bound exports resolved a Windows `envFile` against the POSIX rule
 * whenever the host was not Windows, and the file was then looked for at a path no Windows machine would spell
 * (found on Linux, 2026-09-16).
 */
function pathsFor(platform: NodeJS.Platform) {
  return platform === 'win32' ? win32 : posix;
}

export function discoveryLocations(workspaceRoot: string, platform: NodeJS.Platform, env: Readonly<Record<string, string | undefined>>, home: string): DiscoveryLocations {
  const { join } = pathsFor(platform);
  const project = join(workspaceRoot, '.mcp.json');
  if (platform === 'win32') {
    const appData = env['APPDATA'];
    return { project, user: appData && appData.trim() !== '' ? join(appData, 'mcp.json') : null };
  }
  if (platform === 'darwin') return { project, user: join(home, 'Library', 'Application Support', 'mcp.json') };
  return { project, user: join(home, '.config', 'mcp.json') };
}

export interface DiscoveredServers {
  readonly servers: Readonly<Record<string, McpServerEntry>>;
  /** The keys the file STATED per entry (transport made explicit, env and cwd resolved), for the merge layer — never the filled defaults, so a discovered entry overlays only what it says (REQ-MCP-025). */
  readonly stated: Readonly<Record<string, Record<string, unknown>>>;
  readonly origins: Readonly<Record<string, McpOrigin>>;
  /** Which file each entry came from, for the merge's source label. */
  readonly files: readonly string[];
}

const NAME = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const DISCOVERY_KEYS = new Set(['type', 'command', 'args', 'env', 'cwd', 'envFile', 'url', 'headers']);

/** REQ-MCP-021: `KEY=VALUE` lines; blanks and `#` comments skipped; single or double quotes stripped. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/** REQ-MCP-022: `${workspaceFolder}` and `${env:VAR}` resolve; any other `${...}` stays literal with a warning. */
function substitutePlaceholders(value: string, workspaceRoot: string, env: Readonly<Record<string, string | undefined>>, onUnknown: (placeholder: string) => void): string {
  return value.replace(/\$\{([^}]*)\}/g, (whole, inner: string) => {
    if (inner === 'workspaceFolder') return workspaceRoot;
    if (inner.startsWith('env:')) return env[inner.slice(4)] ?? '';
    onUnknown(whole);
    return whole;
  });
}

interface FileRead { readonly file: string; readonly origin: McpOrigin; readonly servers: Record<string, McpServerEntry>; readonly stated: Record<string, Record<string, unknown>>; readonly diagnostics: Diagnostic[] }

function readOneFile(file: string, origin: McpOrigin, workspaceRoot: string, platform: NodeJS.Platform, env: Readonly<Record<string, string | undefined>>, read: (path: string) => string | null): FileRead {
  const { dirname, normalize, resolve } = pathsFor(platform);
  const diagnostics: Diagnostic[] = [];
  const servers: Record<string, McpServerEntry> = {};
  const stated: Record<string, Record<string, unknown>> = {};
  let text: string | null;
  try { text = read(file); } catch (cause) {
    diagnostics.push(warn(`${file}: the discovery file could not be read (${String(cause instanceof Error ? cause.message : cause)}); it contributes nothing (REQ-MCP-018)`, 'load', `mcp.discovery.unreadable.${file}`, { channels: 'log' }));
    return { file, origin, servers, stated, diagnostics };
  }
  if (text === null) return { file, origin, servers, stated, diagnostics };
  let root: unknown;
  try { root = JSON.parse(text); } catch (cause) {
    diagnostics.push(warn(`${file}: the discovery file is not valid JSON (${String(cause instanceof Error ? cause.message : cause)}); it contributes nothing (REQ-MCP-018)`, 'load', `mcp.discovery.invalid.${file}`, { channels: 'log' }));
    return { file, origin, servers, stated, diagnostics };
  }
  if (!isPlainMap(root)) {
    diagnostics.push(warn(`${file}: the discovery file's root is ${typeName(root)}, not an object; it contributes nothing (REQ-MCP-018)`, 'load', `mcp.discovery.root.${file}`, { channels: 'log' }));
    return { file, origin, servers, stated, diagnostics };
  }
  const table = isPlainMap(root['mcpServers']) ? root['mcpServers'] : isPlainMap(root['servers']) ? root['servers'] : null;
  if (table === null) return { file, origin, servers, stated, diagnostics };
  for (const [name, raw] of Object.entries(table)) {
    if (!NAME.test(name)) { diagnostics.push(warn(`${file}: server name '${name}' does not match ^[a-zA-Z][a-zA-Z0-9_-]*$; skipped (REQ-MCP-019)`, 'load', `mcp.discovery.name.${file}.${name}`, { channels: 'log' })); continue; }
    if (!isPlainMap(raw)) { diagnostics.push(warn(`${file}: server '${name}' is ${typeName(raw)}, not an object; skipped (REQ-MCP-019)`, 'load', `mcp.discovery.shape.${file}.${name}`, { server: name, channels: 'log' })); continue; }
    // REQ-MCP-027: keys outside the discovery vocabulary are ignored with one warning per (file, server, key) per load.
    const accepted: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(raw)) {
      if (DISCOVERY_KEYS.has(key)) accepted[key] = v;
      else diagnostics.push(warn(`${file}: server '${name}' carries the key '${key}', which this product does not read; ignored (REQ-MCP-027)`, 'load', `mcp.unknown-key.${file}.${name}.${key}`, { server: name, channels: 'log' }));
    }
    // REQ-MCP-021: envFile relative to the declaring file; explicit env wins on collision; unreadable → empty with a warning.
    let fileEnv: Record<string, string> = {};
    if (accepted['envFile'] !== undefined) {
      if (typeof accepted['envFile'] !== 'string') diagnostics.push(warn(`${file}: server '${name}': envFile must be a string; ignored`, 'load', `mcp.discovery.envfile.${file}.${name}`, { server: name, channels: 'log' }));
      else {
        const path = resolve(dirname(file), accepted['envFile']);
        try { const t = read(path); fileEnv = t === null ? {} : parseEnvFile(t); if (t === null) diagnostics.push(warn(`${file}: server '${name}': envFile ${path} does not exist; an empty map is used (REQ-MCP-021)`, 'load', `mcp.discovery.envfile.${file}.${name}`, { server: name, channels: 'log' })); }
        catch (cause) { diagnostics.push(warn(`${file}: server '${name}': envFile ${path} could not be read (${String(cause instanceof Error ? cause.message : cause)}); an empty map is used (REQ-MCP-021)`, 'load', `mcp.discovery.envfile.${file}.${name}`, { server: name, channels: 'log' })); }
      }
      delete accepted['envFile'];
    }
    const explicitEnv = isPlainMap(accepted['env']) ? accepted['env'] : {};
    const unknownPlaceholder = (p: string) => diagnostics.push(warn(`${file}: server '${name}': the placeholder ${p} is not one this product resolves; left literal (REQ-MCP-022)`, 'load', `mcp.discovery.placeholder.${file}.${name}.${p}`, { server: name, channels: 'log' }));
    const mergedEnv: Record<string, unknown> = { ...fileEnv };
    for (const [k, v] of Object.entries(explicitEnv)) mergedEnv[k] = typeof v === 'string' ? substitutePlaceholders(v, workspaceRoot, env, unknownPlaceholder) : v;
    for (const k of Object.keys(fileEnv)) if (!(k in explicitEnv)) mergedEnv[k] = substitutePlaceholders(fileEnv[k]!, workspaceRoot, env, unknownPlaceholder);
    accepted['env'] = mergedEnv;
    if (typeof accepted['cwd'] === 'string') accepted['cwd'] = normalize(substitutePlaceholders(accepted['cwd'], workspaceRoot, env, unknownPlaceholder));
    const read1 = readMcpServerEntry(name, accepted, { kind: 'discovered', file });
    diagnostics.push(...read1.diagnostics);
    if (read1.entry) { servers[name] = read1.entry; stated[name] = { ...accepted, type: read1.entry.type }; }
  }
  return { file, origin, servers, stated, diagnostics };
}

export interface DiscoveryInput {
  readonly workspaceRoot: string;
  readonly platform: NodeJS.Platform;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly home: string;
  /** Read-only by construction: the only file operation this stage can perform. Null means absent. */
  readonly read?: (path: string) => string | null;
}

function readOnly(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw cause;
  }
}

/** Both files, project winning (REQ-MCP-024); every entry carries its origin tag (REQ-MCP-026). */
export function readDiscoveryFiles(input: DiscoveryInput): Staged<DiscoveredServers> {
  const locations = discoveryLocations(input.workspaceRoot, input.platform, input.env, input.home);
  const read = input.read ?? readOnly;
  const user = locations.user === null ? null : readOneFile(locations.user, 'discovered-user', input.workspaceRoot, input.platform, input.env, read);
  const project = readOneFile(locations.project, 'discovered-project', input.workspaceRoot, input.platform, input.env, read);
  const servers: Record<string, McpServerEntry> = {};
  const stated: Record<string, Record<string, unknown>> = {};
  const origins: Record<string, McpOrigin> = {};
  for (const f of [user, project]) {
    if (!f) continue;
    for (const [name, entry] of Object.entries(f.servers)) { servers[name] = entry; stated[name] = f.stated[name]!; origins[name] = f.origin; }
  }
  return { value: { servers, stated, origins, files: [locations.project, ...(locations.user === null ? [] : [locations.user])] }, diagnostics: [...(user?.diagnostics ?? []), ...project.diagnostics] };
}
