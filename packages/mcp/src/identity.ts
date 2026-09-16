import { compareCodePoints } from '@rotaris/kernel';
import type { ServerDescription } from './types.js';

/**
 * REQ-MCP-047's nine-value identity — name, type, command, args, env, cwd, url, headers, workspace root —
 * canonicalised into one string: maps with keys in code-point order, absent values as null, so two
 * descriptions differing in any one value key different memo entries and nothing else does.
 */
export function serverIdentity(name: string, description: ServerDescription, workspaceRoot: string): string {
  const sortedMap = (m: Readonly<Record<string, string>> | undefined): [string, string][] | null => (m ? Object.keys(m).sort(compareCodePoints).map((k) => [k, m[k]!]) : null);
  const nine = description.transport === 'stdio'
    ? [name, description.transport, description.command, [...description.args], sortedMap(description.env), description.cwd, null, null, workspaceRoot]
    : [name, description.transport, null, null, null, null, description.url, sortedMap(description.headers), workspaceRoot];
  return JSON.stringify(nine);
}

/**
 * What is LAUNCHED, with the name and the workspace root left out: the same server reached by discovery
 * (`req.name`), by a session (`name`) and by the health probe (`probe:<name>`) keys one entry, which is
 * the point — the three paths connect to one process and should not each re-learn its protocol era.
 */
export function launchIdentity(description: ServerDescription): string {
  return serverIdentity('', description, '');
}
