import type { McpServerEntry } from './entry.js';
import type { ResolvedCommand } from './commands.js';

/**
 * REQ-MCP-043: the normalised runtime description — exactly these keys and no others; `timeout` absent when
 * `request_timeout` is unset; filtering, renaming and grants applied BEFORE this is produced and never expressed as
 * keys; a remote entry never PATH-checked here. The shape is the `ServerDescription` of `@rotaris/mcp` (the two
 * packages agree on the key set by the test `describe.test.ts`, which compares the keys against this list exactly).
 */
export const STDIO_DESCRIPTION_KEYS = ['transport', 'command', 'args', 'env', 'cwd'] as const;
export const REMOTE_DESCRIPTION_KEYS = ['transport', 'url'] as const;

export type RuntimeDescription =
  | { readonly transport: 'stdio'; readonly command: string; readonly args: readonly string[]; readonly env: Readonly<Record<string, string>>; readonly cwd: string; readonly timeout?: number }
  | { readonly transport: 'http' | 'sse'; readonly url: string; readonly headers?: Readonly<Record<string, string>>; readonly timeout?: number };

export function describeForRuntime(entry: McpServerEntry, resolved: ResolvedCommand | null, resolvedEnv: Readonly<Record<string, string>>, resolvedUrl: string | null, workspaceRoot: string): RuntimeDescription {
  const timeout = entry.request_timeout === null ? {} : { timeout: entry.request_timeout };
  if (entry.type === 'stdio') {
    return { transport: 'stdio', command: resolved?.command ?? entry.command ?? '', args: [...(resolved?.args ?? entry.args)], env: { ...resolvedEnv }, cwd: entry.cwd ?? workspaceRoot, ...timeout };
  }
  return { transport: entry.type, url: resolvedUrl ?? entry.url ?? '', ...(entry.headers ? { headers: { ...entry.headers } } : {}), ...timeout };
}
