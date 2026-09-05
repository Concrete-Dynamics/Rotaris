import { join } from 'node:path';
import { availability, findOnPath, resolveCommand, type Availability, type ResolvedCommand } from './commands.js';
import { describeForRuntime, type RuntimeDescription } from './describe.js';
import type { Diagnostic } from './diagnostics.js';
import type { DiscoveredServers } from './discovery-files.js';
import { mergeSecrets, readSecretsFile, resolveRemoteUrl, resolveServerEnvironment, SECRETS_FILE, secretsFor, type SecretEntry } from './environment.js';
import type { McpOrigin, McpServerEntry } from './entry.js';

export * from './diagnostics.js';
export * from './entry.js';
export * from './discovery-files.js';
export * from './commands.js';
export * from './environment.js';
export * from './persona.js';
export * from './describe.js';
export * from './prompt.js';
export * from './defaults.js';

/**
 * The load-time half of ADR-0034's pipeline, run once per configuration load over the merged `mcp_servers` map:
 * origin (REQ-MCP-026), command resolution (028..035), availability (037), the environment and the URL (087, 088,
 * 090), the normalised description (043). Every stage is pure over its inputs; the file reads (secrets) and the PATH
 * lookup are injected. The persona half (`resolvePersonaMcp`) runs per agent construction in the run host, where the
 * discovery memo and the session override live.
 */
export interface McpResolvedServer {
  readonly name: string;
  readonly entry: McpServerEntry;
  readonly origin: McpOrigin;
  readonly resolved: ResolvedCommand | null;
  readonly availability: Availability;
  readonly description: RuntimeDescription;
  /** REQ-MCP-088 / REQ-CONFIG-225: placeholders in a remote URL no secret or variable satisfied. */
  readonly unresolved: readonly string[];
}

export interface McpConfiguration {
  readonly servers: Readonly<Record<string, McpResolvedServer>>;
  readonly origins: Readonly<Record<string, McpOrigin>>;
  /** The merged view (REQ-MCP-083): values held for environment resolution, never rendered raw. */
  readonly secrets: readonly SecretEntry[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface McpResolveInput {
  readonly servers: Readonly<Record<string, McpServerEntry>>;
  readonly yamlNamed: ReadonlySet<string>;
  readonly discovered: DiscoveredServers;
  readonly workspaceRoot: string;
  readonly globalDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform?: NodeJS.Platform;
  readonly onPath?: (executable: string) => boolean;
  readonly readFile?: (path: string) => string | null;
  readonly binding?: { readonly launchSubcommand: string; readonly projectPathOption: string; readonly projectFromCwdOption: string } | null;
}

export function originOf(name: string, yamlNamed: ReadonlySet<string>, discovered: Readonly<Record<string, McpOrigin>>): McpOrigin {
  if (yamlNamed.has(name)) return 'yaml';
  return discovered[name] ?? 'default';
}

export function resolveMcpConfiguration(input: McpResolveInput): McpConfiguration {
  const diagnostics: Diagnostic[] = [];
  const platform = input.platform ?? process.platform;
  const onPath = input.onPath ?? ((exe: string) => findOnPath(exe, input.env, platform) !== null);
  const read = input.readFile;
  const globalSecrets = readSecretsFile(join(input.globalDir, SECRETS_FILE), 'global', read);
  const workspaceSecrets = readSecretsFile(join(input.workspaceRoot, '.rotaris', SECRETS_FILE), 'workspace', read);
  diagnostics.push(...globalSecrets.diagnostics, ...workspaceSecrets.diagnostics);
  const secrets = mergeSecrets(globalSecrets.value, workspaceSecrets.value);
  const servers: Record<string, McpResolvedServer> = {};
  const origins: Record<string, McpOrigin> = {};
  for (const [name, entry] of Object.entries(input.servers)) {
    const origin = originOf(name, input.yamlNamed, input.discovered.origins);
    origins[name] = origin;
    const own = secretsFor(secrets, name);
    let resolved: ResolvedCommand | null = null;
    let url: string | null = null;
    let unresolved: string[] = [];
    if (entry.type === 'stdio') {
      const r = resolveCommand({ name, command: entry.command ?? '', args: entry.args, workspaceRoot: input.workspaceRoot, onPath, binding: input.binding ?? null });
      diagnostics.push(...r.diagnostics);
      resolved = r.value;
    } else {
      const u = resolveRemoteUrl(name, entry.url ?? '', input.env, own, entry.enabled);
      diagnostics.push(...u.diagnostics);
      url = u.value.url;
      unresolved = u.value.unresolved;
    }
    const env = resolveServerEnvironment(entry, input.env, own);
    servers[name] = {
      name, entry, origin, resolved,
      availability: availability(entry, resolved, onPath),
      description: describeForRuntime(entry, resolved, env, url, input.workspaceRoot),
      unresolved,
    };
  }
  return { servers, origins, secrets, diagnostics };
}
