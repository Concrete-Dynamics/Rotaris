import { BUILT_IN_ROLE_NAMES, type BuiltInRoleName } from '@rotaris/contracts';
import { clonePlain, type PlainMap } from './merge.js';
import type { TierAlias } from './keys.js';
import { BUILT_IN_PERSONA_CODE_INTELLIGENCE_TIERS, BUILT_IN_PERSONA_MCP_SERVERS, SHIPPED_MCP_SERVERS } from './mcp/defaults.js';
import { CODE_INTELLIGENCE_SERVER_NAME, grantForTiers } from './mcp/code-intelligence.js';

/**
 * The built-in default layer (REQ-CONFIG-031 layer 1), copied per load so no load can mutate the shipped
 * defaults (REQ-CONFIG-032). Slots per REQ-CONFIG-063..067, the two shipped models per REQ-CONFIG-097.
 * The section defaults live with their readers (an absent section reads as its defaults).
 *
 * The thirteen built-in roles are declared here with their default tier only — the prompts and tool
 * grants stay in the engine's persona table (decision 3 of the plan) — so a `personas:` override that
 * states one field merges onto a complete entry and validates. The tiers are this build's proposal:
 * the coordinating and designing roles on the large tier, every other role on the medium tier.
 */
export const BUILT_IN_ROLE_TIERS: Readonly<Record<BuiltInRoleName, TierAlias>> = Object.freeze({
  orchestrator: 'large_model', architect: 'large_model', planner: 'large_model',
  'requirements-engineer': 'medium_model', 'codebase-analyst': 'medium_model', librarian: 'medium_model', 'coding-agent': 'medium_model',
  tester: 'medium_model', 'docs-writer': 'medium_model', refactorer: 'medium_model', verifier: 'medium_model', 'ui-verifier': 'medium_model', gatekeeper: 'medium_model',
});

export const SHIPPED_MODELS: PlainMap = {
  'gpt-4o': { provider: 'openai', model_id: 'gpt-4o', api_key_env: 'OPENAI_API_KEY' },
  'gpt-4o-mini': { provider: 'openai', model_id: 'gpt-4o-mini', api_key_env: 'OPENAI_API_KEY' },
};

const DEFAULT_LAYER: PlainMap = {
  default_persona: 'orchestrator',
  small_model: 'gpt-4o-mini',
  medium_model: 'gpt-4o-mini',
  large_model: 'gpt-4o',
  default_summary_model: 'small_model',
  fallback_model: 'small_model',
  improvement_collector_model: null,
  gatekeeper_model: null,
  worktree_storage_subpath: 'worktrees',
  inject_agents_md: true,
  models: SHIPPED_MODELS,
  // REQ-MCP-014: the servers each built-in persona carries (a list, replaced wholesale by an override — REQ-CONFIG-101), and its
  // `code_intelligence` grant: exactly the union of its tiers, the names read from the manifest (ADR-0035, Part T); no
  // `mcp_tools` entry for `browser` or `web_search` (the whole discovered surface, REQ-MCP-007).
  personas: Object.fromEntries([
    ...BUILT_IN_ROLE_NAMES.map((role) => {
      const tiers = BUILT_IN_PERSONA_CODE_INTELLIGENCE_TIERS[role];
      return [role, { name: role, model: BUILT_IN_ROLE_TIERS[role], mcp_servers: [...(BUILT_IN_PERSONA_MCP_SERVERS[role] ?? [])], ...(tiers ? { mcp_tools: { [CODE_INTELLIGENCE_SERVER_NAME]: grantForTiers(tiers) } } : {}) }];
    }),
    // REQ-MCP-014's `intent-classifier` row: a built-in persona outside the delegation vocabulary
    // (REQ-ORCH-028's thirteen), carrying no servers. The classifier selects its model from the slots
    // itself (REQ-ORCH-009) and the engine names it as a persona (`intent/classifier.ts`), so the default
    // layer must declare it — without an entry, a partial `personas:` override for the role has nothing
    // to merge onto and the required `name`/`model` (REQ-CONFIG-098) fail the whole load. Its model names
    // the small slot, which is the classifier's own first choice.
    ['intent-classifier', { name: 'intent-classifier', model: 'small_model', mcp_servers: [] }],
  ]),
  // REQ-MCP-010 / REQ-CONFIG-181: the three shipped tool-server entries (see mcp/defaults.ts for the identities and the enabled deviation).
  mcp_servers: SHIPPED_MCP_SERVERS,
};

export function builtInDefaults(): PlainMap {
  return clonePlain(DEFAULT_LAYER);
}
