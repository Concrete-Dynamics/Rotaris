import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { guardedRead, replaceDocument } from '@rotaris/platform';
import { err, ok, type Result } from '@rotaris/kernel';

/**
 * REQ-HOOKS-115/116/117: the global runtime policy `<config-dir>/external-hooks.json` — agent and per-hook
 * toggles for this product's own hooks (`rotaris`) and the imported ones (`claude-code`). Unreadable
 * or malformed loads as empty, meaning everything is on; an id not mentioned is on; a hook is on when
 * both its agent and its own toggle are on. `ROTARIS_CONFIG_DIR` relocates THIS FILE ONLY.
 */
export const POLICY_FILE = 'external-hooks.json' as const;
export const POLICY_VERSION = 1;

export interface ExternalPolicy {
  readonly version: 1;
  readonly agents: Readonly<Record<string, boolean>>;
  readonly hooks: Readonly<Record<string, boolean>>;
}
export const EMPTY_POLICY: ExternalPolicy = { version: 1, agents: {}, hooks: {} };

/** REQ-HOOKS-115: `ROTARIS_CONFIG_DIR` when set to a non-blank value (trimmed, `~` expanded), else the per-user configuration directory. */
export function policyDir(env: Readonly<Record<string, string | undefined>>, configDir: string, home = homedir()): string {
  const raw = (env['ROTARIS_CONFIG_DIR'] ?? '').trim();
  if (raw === '') return configDir;
  const expanded = raw === '~' ? home : raw.startsWith('~/') || raw.startsWith('~\\') ? join(home, raw.slice(2)) : raw;
  return resolve(expanded);
}
export function policyPath(env: Readonly<Record<string, string | undefined>>, configDir: string): string {
  return join(policyDir(env, configDir), POLICY_FILE);
}

export function readPolicy(path: string): ExternalPolicy {
  const outcome = guardedRead(path, (raw) => JSON.parse(raw) as unknown);
  if (outcome.state !== 'readable') return EMPTY_POLICY;
  const v = outcome.value;
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return EMPTY_POLICY;
  const o = v as Record<string, unknown>;
  if (o['version'] !== POLICY_VERSION) return EMPTY_POLICY;
  const bools = (x: unknown): Record<string, boolean> => {
    if (x === null || typeof x !== 'object' || Array.isArray(x)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, val] of Object.entries(x as Record<string, unknown>)) if (typeof val === 'boolean') out[k] = val;
    return out;
  };
  return { version: 1, agents: bools(o['agents']), hooks: bools(o['hooks']) };
}

/** Sorted keys, two-space indentation, a trailing newline, an atomic write. */
export async function writePolicy(path: string, policy: ExternalPolicy): Promise<Result<void, { readonly reason: string }>> {
  const sorted = (r: Readonly<Record<string, boolean>>): Record<string, boolean> => Object.fromEntries(Object.keys(r).sort().map((k) => [k, r[k]!]));
  const doc = { agents: sorted(policy.agents), hooks: sorted(policy.hooks), version: POLICY_VERSION };
  const r = await replaceDocument(path, `${JSON.stringify(doc, null, 2)}\n`);
  return r.ok ? ok(undefined) : err({ reason: r.error.headline });
}

export function agentOn(policy: ExternalPolicy, agent: string): boolean {
  return policy.agents[agent] !== false;
}
export function hookOn(policy: ExternalPolicy, agent: string, hookId: string): boolean {
  return agentOn(policy, agent) && policy.hooks[hookId] !== false;
}
export function withToggle(policy: ExternalPolicy, agent: string, hookId: string | null, on: boolean): ExternalPolicy {
  if (hookId === null) return { ...policy, agents: { ...policy.agents, [agent]: on } };
  return { ...policy, hooks: { ...policy.hooks, [hookId]: on } };
}
