import { join } from 'node:path';
import { availability, FILESYSTEM_PACKAGES, findOnPath, resolveCommand, type Availability, type BuiltinLaunch, type ResolvedCommand } from './commands.js';
import { CODE_INTELLIGENCE_BINDING } from './code-intelligence.js';
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
export * from './code-intelligence.js';

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
  /**
   * REQ-CONFIG-225: per server, the YAML file whose `mcp_servers:` entry stated the `url` the merge kept (the workspace
   * scope's over the global's), so an unresolved placeholder's warning names the file to correct. A server absent here
   * took its url from a discovered file (`discovered.sources`) or from the built-in defaults.
   */
  readonly urlFiles?: Readonly<Record<string, string>>;
  readonly discovered: DiscoveredServers;
  readonly workspaceRoot: string;
  readonly globalDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly platform?: NodeJS.Platform;
  readonly onPath?: (executable: string) => boolean;
  readonly readFile?: (path: string) => string | null;
  /** REQ-MCP-034: the manifest's binding by default (ADR-0035 executed 2026-09-06); `null` switches the stage off for a test. */
  readonly binding?: { readonly launchSubcommand: string; readonly projectPathOption: string; readonly projectFromCwdOption: string } | null;
  /** REQ-MCP-033: what the token launches; the run host supplies it, a test may omit it. */
  readonly builtinLaunch?: BuiltinLaunch | null;
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
      const r = resolveCommand({ name, command: entry.command ?? '', args: entry.args, workspaceRoot: input.workspaceRoot, onPath, binding: input.binding === undefined ? CODE_INTELLIGENCE_BINDING : input.binding, builtinLaunch: input.builtinLaunch ?? null });
      diagnostics.push(...r.diagnostics);
      resolved = r.value;
    } else {
      const u = resolveRemoteUrl(name, entry.url ?? '', input.env, own, entry.enabled, urlSourceOf(name, input));
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

/**
 * REQ-CONFIG-225: "the file the entry came from", read as the file that stated the url the placeholder sits in — the
 * entry is merged field by field (REQ-CONFIG-043), so a workspace file that only switches the shipped `web_search` on
 * did not write its url. `null` when no file did: the built-in defaults (REQ-CONFIG-181).
 */
export function urlSourceOf(name: string, input: Pick<McpResolveInput, 'urlFiles' | 'discovered'>): string | null {
  const yaml = input.urlFiles?.[name];
  if (yaml !== undefined) return yaml;
  const stated = input.discovered.stated[name];
  if (stated !== undefined && stated['url'] !== undefined) return input.discovered.sources[name] ?? null;
  return null;
}

type ProjectBinding = { readonly launchSubcommand: string; readonly projectPathOption: string; readonly projectFromCwdOption: string };

/**
 * REQ-MCP-034's isolated-run clause: "For a run against an isolated working tree, the appended path SHALL be that tree's
 * root." The configuration is resolved once per load, against the workspace root (`resolveMcpConfiguration`), so every path
 * the load filled in is the ANCHORING root; a run whose execution root is a worktree (REQ-GIT-140's unit tree, the
 * start-session dialog's isolated worktree) takes this view of it, in which each of those paths is the tree's root instead —
 * in the resolved arguments and in the runtime description launch and discovery both read (REQ-MCP-050).
 *
 * Three fills, each rebound only where the load made it, read exactly:
 *  - REQ-MCP-034's project path: the entry's CONFIGURED arguments carry neither project-selection option (a selection
 *    already present is left as configured), its resolved arguments carry the launch subcommand, and they end with the
 *    project-path option and the workspace root the load appended;
 *  - REQ-MCP-035's filesystem fill-in (`PD-MCP-002`, OQ-194): the resolved arguments after a filesystem package are the
 *    workspace root alone, and the entry's configured arguments did not name it there itself;
 *  - REQ-MCP-043/050's default working directory (`PD-MCP-002`): the description's `cwd` is the workspace root and the entry
 *    configures none — which also moves a runtime launched with the project-from-working-directory option onto the tree.
 * REQ-MCP-070's `lsp_init` root is the run host's (`McpHost.executorsFor`), which names the same execution root.
 * Until 2026-10-06 only the first was rebound (OQ-194's literal reading, kept beside its replacement: "REQ-MCP-035's
 * fill-in and REQ-MCP-043's default `cwd` name the workspace root, and stay it"); a filesystem server a user added would
 * have read and written the main checkout from a run that promises isolation. OQ-195 asks whose project memories the
 * tree-bound runtime then serves. Found unfixed by the default live run at 1763f7f (ADR-0034, Part T's stated gap). Pure;
 * the same object back when nothing is rebound.
 */
export function mcpConfigurationForExecutionRoot(mcp: McpConfiguration, workspaceRoot: string, executionRoot: string, binding: ProjectBinding | null = CODE_INTELLIGENCE_BINDING): McpConfiguration {
  if (executionRoot === workspaceRoot) return mcp;
  let changed = false;
  const servers: Record<string, McpResolvedServer> = {};
  for (const [name, server] of Object.entries(mcp.servers)) {
    const rebound = rebindToExecutionRoot(server, workspaceRoot, executionRoot, binding);
    if (rebound !== server) changed = true;
    servers[name] = rebound;
  }
  return changed ? { ...mcp, servers } : mcp;
}

function rebindToExecutionRoot(server: McpResolvedServer, workspaceRoot: string, executionRoot: string, binding: ProjectBinding | null): McpResolvedServer {
  const { entry, resolved, description } = server;
  if (entry.type !== 'stdio' || resolved === null || description.transport !== 'stdio') return server;
  let args = resolved.args;
  // REQ-MCP-034's project path, where the load appended it.
  if (binding !== null && !entry.args.includes(binding.projectPathOption) && !entry.args.includes(binding.projectFromCwdOption) && args.includes(binding.launchSubcommand)) {
    const n = args.length;
    if (n >= 2 && args[n - 2] === binding.projectPathOption && args[n - 1] === workspaceRoot) args = [...args.slice(0, n - 1), executionRoot];
  }
  // PD-MCP-002: REQ-MCP-035's fill-in, where the load made it (appended, or substituted for a missing path).
  const at = args.findIndex((a) => FILESYSTEM_PACKAGES.has(a));
  if (at !== -1 && at === args.length - 2 && args[at + 1] === workspaceRoot && entry.args[entry.args.length - 1] !== workspaceRoot) args = [...args.slice(0, at + 1), executionRoot];
  // PD-MCP-002: REQ-MCP-043/050's default working directory.
  const cwd = (entry.cwd ?? null) === null && description.cwd === workspaceRoot ? executionRoot : description.cwd;
  if (args === resolved.args && cwd === description.cwd) return server;
  return { ...server, resolved: { ...resolved, args: [...args] }, description: { ...description, args: [...args], cwd } };
}

/**
 * The project a stdio description launches the code-intelligence runtime against, read from the arguments it carries —
 * what the run host's launch lines name (REQ-MCP-034), so a log reader sees the binding a run launched with and not the
 * one it was meant to have. The value after the project-path option; the working directory under the
 * project-from-working-directory option; null for a remote server or arguments holding neither.
 */
export function launchedProjectOf(description: RuntimeDescription, binding: ProjectBinding = CODE_INTELLIGENCE_BINDING): string | null {
  if (description.transport !== 'stdio') return null;
  const at = description.args.indexOf(binding.projectPathOption);
  if (at !== -1 && at + 1 < description.args.length) return description.args[at + 1]!;
  if (description.args.includes(binding.projectFromCwdOption)) return description.cwd;
  return null;
}
