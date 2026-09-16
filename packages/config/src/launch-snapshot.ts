import { redact } from '@rotaris/kernel';
import type { LoadedConfiguration } from './load.js';

const MASKED = '[redacted]';
const MASKED_MAP_KEYS = new Set(['env', 'headers']);
const MASKED_VALUE_KEYS = new Set(['api_key', 'password', 'secret', 'token', 'authorization', 'cookie', 'credential', 'bearer']);

function secretFree(value: unknown, key = ''): unknown {
  if (MASKED_VALUE_KEYS.has(key.toLowerCase())) return value === null ? null : MASKED;
  if (Array.isArray(value)) return value.map((entry) => secretFree(entry));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value as Readonly<Record<string, unknown>>)) {
      if (MASKED_MAP_KEYS.has(key.toLowerCase())) out[childKey] = MASKED;
      else out[childKey] = secretFree(child, childKey);
    }
    return out;
  }
  return typeof value === 'string' ? redact(value) : value;
}

/**
 * REQ-SESSION-138: the full effective configuration made durable with the launch audit.
 * Runtime-only inputs such as credentials and MCP secret values stay outside this value; every
 * remaining string also passes through the shared deterministic redactor.
 */
export function launchConfigurationSnapshot(
  cfg: LoadedConfiguration,
  resolvedSystemPrompts: Readonly<Record<string, string>>,
): Readonly<Record<string, unknown>> {
  const personas = Object.fromEntries(Object.entries(cfg.personas).map(([role, persona]) => [role, {
    ...persona,
    resolved_system_prompt: resolvedSystemPrompts[role] ?? persona.system_prompt ?? '',
  }]));
  const mcpServers = Object.fromEntries(Object.entries(cfg.mcp.servers).map(([name, server]) => [name, {
    ...server.entry,
    origin: server.origin,
  }]));
  return secretFree({
    default_persona: cfg.defaultPersona,
    slots: cfg.slots,
    slot_thinking: cfg.slotThinking,
    models: cfg.models,
    personas,
    runtime: cfg.runtime,
    compressor: cfg.compressor,
    circuit_breaker: cfg.circuitBreaker,
    checkpoints: cfg.checkpoints,
    requirements: cfg.requirements,
    display: cfg.display,
    skills: cfg.skills,
    hooks: cfg.hooks,
    worktree_storage_subpath: cfg.worktreeStorageSubpath,
    inject_agents_md: cfg.injectAgentsMd,
    delegation_strategy: cfg.delegationStrategy,
    resolved_persona_model_tiers: cfg.resolvedPersonaModelTiers,
    authenticated_providers: cfg.authenticatedProviders,
    discovered_slots: cfg.discoveredSlots,
    mcp_servers: mcpServers,
  }) as Readonly<Record<string, unknown>>;
}
