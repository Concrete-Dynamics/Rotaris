import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { isPlainMap } from '../merge.js';
import { info, warn, type Diagnostic, type Staged } from './diagnostics.js';
import type { McpServerEntry } from './entry.js';
import { textOf } from '@rotaris/kernel';

/**
 * REQ-MCP-082/083 (the read path), 087, 088, 090: secrets per scope loaded read-only, the merged view, the environment
 * a server receives, the remote URL's substitution. The write path (REQ-MCP-084, 110, 111) is owed: the settings
 * surface reads and masks only. `.gitignore`'s `.rotaris/` amendment (REQ-MCP-089) is REQ-CONFIG-013's existing
 * `keepScopeDirIgnored` — the same line, the same idempotent atomic best-effort write; nothing is added here.
 */
export type SecretScope = 'global' | 'workspace';

export interface SecretEntry {
  readonly server: string;
  readonly key: string;
  readonly value: string;
  readonly scope: SecretScope;
}

export const SECRETS_FILE = 'secrets.yaml' as const;

/** One scope's file: unreadable, invalid or non-mapping → empty; empty key or value skipped with a warning (REQ-MCP-082). */
export function readSecretsFile(path: string, scope: SecretScope, read: (p: string) => string | null = readOnly): Staged<SecretEntry[]> {
  const diagnostics: Diagnostic[] = [];
  const out: SecretEntry[] = [];
  let text: string | null;
  try { text = read(path); } catch { return { value: out, diagnostics }; }
  if (text === null) return { value: out, diagnostics };
  let root: unknown;
  try { root = parseYaml(text); } catch { return { value: out, diagnostics }; }
  if (!isPlainMap(root)) return { value: out, diagnostics };
  for (const [server, block] of Object.entries(root)) {
    if (!isPlainMap(block)) continue;
    for (const [rawKey, rawValue] of Object.entries(block)) {
      const key = String(rawKey);
      const value = rawValue === null || rawValue === undefined ? '' : textOf(rawValue);
      if (key === '' || value === '') {
        diagnostics.push(warn(`${scope} secrets: server '${server}' key '${key}' is ${key === '' ? 'empty' : 'without a value'}; skipped (REQ-MCP-082)`, 'load', `mcp.secret.empty.${scope}.${server}.${key}`, { server, channels: 'log' }));
        continue;
      }
      out.push({ server, key, value, scope });
    }
  }
  return { value: out, diagnostics };
}

function readOnly(path: string): string | null {
  try { return readFileSync(path, 'utf8'); } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw cause;
  }
}

/** REQ-MCP-083: global then workspace per key, workspace winning; the overridden global entry is not listed twice. */
export function mergeSecrets(global: readonly SecretEntry[], workspace: readonly SecretEntry[]): SecretEntry[] {
  // The separator is NUL, which neither a server name nor a key can hold; written as the escape, never the byte, so Git
  // reads this file as text (docs/archive/defects/the-secret-merge-keys-carry-literal-nul-bytes-so-git-treats-their-file-as-binary.md).
  const byKey = new Map<string, SecretEntry>();
  for (const e of global) byKey.set(`${e.server}\u0000${e.key}`, e);
  for (const e of workspace) byKey.set(`${e.server}\u0000${e.key}`, e);
  return [...byKey.values()];
}

export function secretsFor(merged: readonly SecretEntry[], server: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of merged) if (e.server === server) out[e.key] = e.value;
  return out;
}

/**
 * REQ-MCP-087 / REQ-MCP-090: per `env` entry, a value that is exactly `${VAR}` becomes the process environment's
 * value — unset means the key is OMITTED, never the literal; any other value is kept; stored secrets overlay last.
 */
export function resolveServerEnvironment(entry: Pick<McpServerEntry, 'env'>, processEnv: Readonly<Record<string, string | undefined>>, secrets: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(entry.env)) {
    const full = /^\$\{([^}]+)\}$/.exec(value);
    if (full) {
      const v = processEnv[full[1]!];
      if (v !== undefined) out[key] = v;
      continue;
    }
    out[key] = value;
  }
  for (const [key, value] of Object.entries(secrets)) out[key] = value;
  return out;
}

/**
 * REQ-MCP-088: every `${VAR}` in a remote URL, secret first then the process environment; unresolved stays literal with a
 * warning. For a DISABLED entry the warning goes to the log alone: the shipped `web_search` is disabled by default and
 * its key unset, and REQ-MCP-040 makes a server turned off a choice, not a fault — a notice on every load would say
 * otherwise (the part-j regression showed it on every launch). The category still shows the entry as present but
 * unavailable (`unresolved`, REQ-CONFIG-225).
 *
 * Restricting the CHANNEL was half the sentence. The line was still a `warning` in the `load` scope, so the run host
 * logged it at warn level and `newLoad()` cleared its key between the two loads every launch performs — the shipped
 * `web_search` warned twice per launch about a key nobody was asked for (measured 2026-09-16). For a disabled entry
 * it is now what REQ-MCP-040 says it is: informational, once per process. An ENABLED entry is unchanged; there the
 * placeholder is a fault, the user is told, and each load may say so again.
 */
export function resolveRemoteUrl(name: string, url: string, processEnv: Readonly<Record<string, string | undefined>>, secrets: Readonly<Record<string, string>>, enabled = true, source: string | null = null): Staged<{ url: string; unresolved: string[] }> {
  const unresolved: string[] = [];
  const resolved = url.replace(/\$\{([^}]+)\}/g, (whole, variable: string) => {
    const s = secrets[variable];
    if (s !== undefined) return s;
    const e = processEnv[variable];
    if (e !== undefined) return e;
    unresolved.push(variable);
    return whole;
  });
  // The words follow the reason too (2026-10-06): an enabled entry is unavailable until the placeholder resolves; a
  // disabled one is unavailable because it is switched off (REQ-CONFIG-465), and a resolved key would leave it so —
  // "unavailable until it is" promised otherwise on every launch for the shipped `web_search`
  // (docs/archive/defects/a-disabled-servers-unresolved-placeholder-line-says-a-key-would-make-it-available.md).
  const consequence = enabled
    ? 'the server is configured but unavailable until it is'
    : "the server is disabled by its configured 'enabled: false' (REQ-CONFIG-465), so nothing connects to it, and enabling it will also need the placeholder resolved";
  // REQ-CONFIG-225 names "the file the entry came from": the file that stated this url, or the built-in defaults when
  // none did (docs/archive/defects/the-unresolved-placeholder-warning-names-no-configuration-file.md).
  const where = source === null ? 'from the built-in defaults' : `set in ${source}`;
  const diagnostics: Diagnostic[] = unresolved.map((v) => {
    const message = `mcp ${name}: the placeholder \${${v}} in its url, ${where}, could not be resolved from a stored secret or the environment; ${consequence} (REQ-MCP-088, REQ-CONFIG-225)`;
    const key = `mcp.url-unresolved.${name}.${v}`;
    return enabled ? warn(message, 'load', key, { server: name, channels: 'user' }) : info(message, 'process', key, { server: name });
  });
  return { value: { url: resolved, unresolved }, diagnostics };
}
