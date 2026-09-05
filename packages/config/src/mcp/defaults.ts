import type { PlainMap } from '../merge.js';

/**
 * REQ-MCP-010 / REQ-CONFIG-181: exactly three shipped server entries. The third-party identities are this build's,
 * recorded once here (REQ-MCP-010 leaves them to the implementation):
 *   - `web_search`: http, the URL carrying `${ROTARIS_SEARCH_API_KEY}` (substituted per REQ-MCP-088), `request_timeout`
 *     600, `enabled: false`.
 *   - `browser`: stdio `npx -y @playwright/mcp@0.0.80 --headless` — the Playwright MCP server (Apache-2.0), pinned to an
 *     exact MAJOR.MINOR.PATCH (never a range or a tag), headless selected; `enabled: false`. The setup manifest of
 *     REQ-MCP-095 (owed with ADR-0035) must carry this string character for character.
 *   - `code_intelligence`: stdio, the reserved token of REQ-MCP-033; the arguments that select stdio transport and the
 *     host-integration mode come from the binding manifest of REQ-MCP-116, which ADR-0035 has not produced — the pair
 *     below is a PLACEHOLDER. **`enabled: false` — the owner's decision of 2026-09-05**, a recorded deviation from
 *     REQ-CONFIG-181's "enabled by default": until ADR-0035 executes, the token resolves to nothing launchable, and an
 *     enabled entry would put a permanent unavailable warning into every run; revert to `true` when the manifest and the
 *     token's launch exist (the ADR-0034 note records the deviation beside this comment).
 * No other field is set on any of the three (REQ-MCP-010).
 */
export const WEB_SEARCH_KEY_VARIABLE = 'ROTARIS_SEARCH_API_KEY' as const;
export const BROWSER_PACKAGE = '@playwright/mcp' as const;
export const BROWSER_PACKAGE_VERSION = '0.0.80' as const;
export const CODE_INTELLIGENCE_PLACEHOLDER_ARGS = ['--transport', 'stdio'] as const;

export const SHIPPED_MCP_SERVERS: PlainMap = {
  web_search: { type: 'http', url: `https://search.rotaris.invalid/mcp?key=\${${WEB_SEARCH_KEY_VARIABLE}}`, request_timeout: 600, enabled: false },
  browser: { type: 'stdio', command: 'npx', args: ['-y', `${BROWSER_PACKAGE}@${BROWSER_PACKAGE_VERSION}`, '--headless'], enabled: false },
  code_intelligence: { type: 'stdio', command: 'builtin:code-intelligence', args: [...CODE_INTELLIGENCE_PLACEHOLDER_ARGS], enabled: false },
};

/**
 * REQ-MCP-014's table: the servers each built-in persona carries. The `code_intelligence` grant tiers are names from
 * the manifest of REQ-MCP-116 — owed with ADR-0035; until then those personas carry the server with NO `mcp_tools`
 * entry (the whole surface, REQ-MCP-055 case (b)), stated as the interim. A built-in persona absent from the table
 * carries nothing (REQ-MCP-014's closing rule): `intent-classifier`, `gatekeeper`. `project-initializer` is not a
 * built-in role of this build (REQ-ORCH-028's vocabulary), so its row has no persona to attach to yet.
 */
export const BUILT_IN_PERSONA_MCP_SERVERS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  orchestrator: ['web_search', 'code_intelligence'],
  architect: ['web_search', 'code_intelligence'],
  'coding-agent': ['code_intelligence'],
  tester: ['browser', 'code_intelligence'],
  'docs-writer': ['web_search', 'code_intelligence'],
  refactorer: ['code_intelligence'],
  planner: ['web_search', 'code_intelligence'],
  'requirements-engineer': ['code_intelligence'],
  librarian: ['web_search'],
  'codebase-analyst': ['code_intelligence'],
  verifier: ['code_intelligence'],
  'ui-verifier': ['browser', 'code_intelligence'],
  gatekeeper: [],
});
