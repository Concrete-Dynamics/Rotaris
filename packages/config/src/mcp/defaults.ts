import type { PlainMap } from '../merge.js';
import { CODE_INTELLIGENCE_DEFAULT_ARGS, type CodeIntelligenceTier } from './code-intelligence.js';
import { CODE_INTELLIGENCE_TOKEN } from './commands.js';

/**
 * REQ-MCP-010 / REQ-CONFIG-181: exactly three shipped server entries. The third-party identities are this build's,
 * recorded once here (REQ-MCP-010 leaves them to the implementation):
 *   - `web_search`: http, the URL carrying `${ROTARIS_SEARCH_API_KEY}` (substituted per REQ-MCP-088), `request_timeout`
 *     600, `enabled: false`.
 *   - `browser`: stdio `npx -y @playwright/mcp@0.0.80 --headless` — the Playwright MCP server (Apache-2.0), pinned to an
 *     exact MAJOR.MINOR.PATCH (never a range or a tag), headless selected; `enabled: false`. The setup manifest of
 *     REQ-MCP-095 (owed with the onboarding task registry, REQ-MCP-045/098 — see ADR-0035's note) must carry this string
 *     character for character.
 *   - `code_intelligence`: stdio, the reserved token of REQ-MCP-033; its arguments — the launch subcommand, then what
 *     selects stdio transport and the host-integration mode — are read from the binding manifest of REQ-MCP-116
 *     (`code-intelligence.ts`, generated from the bundled runtime by ADR-0035's build step); no project path (REQ-MCP-034
 *     appends it per run). **`enabled: true`** — REQ-CONFIG-181's "the one default enabled by default".
 *     The deviation, kept: this entry shipped `enabled: false` from 2026-09-05 (the owner's decision, Part S: the token
 *     resolved to nothing launchable and an enabled entry would have put a permanent discovery failure into every run)
 *     until ADR-0035 executed on 2026-09-06 (Part T) with the bundle, the branch and this manifest; reverted the same day
 *     the proof showed the server answering through the token (the ADR-0034 note records the deviation, ADR-0035's the
 *     reversion).
 * No other field is set on any of the three (REQ-MCP-010).
 */
export const WEB_SEARCH_KEY_VARIABLE = 'ROTARIS_SEARCH_API_KEY' as const;
export const BROWSER_PACKAGE = '@playwright/mcp' as const;
export const BROWSER_PACKAGE_VERSION = '0.0.80' as const;

export const SHIPPED_MCP_SERVERS: PlainMap = {
  web_search: { type: 'http', url: `https://search.rotaris.invalid/mcp?key=\${${WEB_SEARCH_KEY_VARIABLE}}`, request_timeout: 600, enabled: false },
  browser: { type: 'stdio', command: 'npx', args: ['-y', `${BROWSER_PACKAGE}@${BROWSER_PACKAGE_VERSION}`, '--headless'], enabled: false },
  code_intelligence: { type: 'stdio', command: CODE_INTELLIGENCE_TOKEN, args: [...CODE_INTELLIGENCE_DEFAULT_ARGS], enabled: true },
};

/**
 * REQ-MCP-014's table: the servers each built-in persona carries. A built-in persona absent from the table carries
 * nothing (REQ-MCP-014's closing rule): `intent-classifier`, `gatekeeper`. `project-initializer` is not a built-in role
 * of this build (REQ-ORCH-028's vocabulary), so its row — READ + MEMORY-WRITE + ONBOARDING — has no persona to attach to
 * yet; the ONBOARDING tier is therefore generated, checked and granted to nobody. Stated, not hidden.
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

/** REQ-MCP-014's third column: the tiers whose union is each persona's `code_intelligence` grant (12, 19 or 13 names). */
const READ_MEMORY: readonly CodeIntelligenceTier[] = ['read', 'memoryWrite'];
const READ_EDIT_MEMORY: readonly CodeIntelligenceTier[] = ['read', 'edit', 'memoryWrite'];
export const BUILT_IN_PERSONA_CODE_INTELLIGENCE_TIERS: Readonly<Record<string, readonly CodeIntelligenceTier[]>> = Object.freeze({
  orchestrator: READ_MEMORY,
  architect: READ_MEMORY,
  'coding-agent': READ_EDIT_MEMORY,
  tester: READ_EDIT_MEMORY,
  'docs-writer': READ_MEMORY,
  refactorer: READ_EDIT_MEMORY,
  planner: READ_MEMORY,
  'requirements-engineer': READ_MEMORY,
  'codebase-analyst': READ_MEMORY,
  verifier: READ_MEMORY,
  'ui-verifier': READ_MEMORY,
});
