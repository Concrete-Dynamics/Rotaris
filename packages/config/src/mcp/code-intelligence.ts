import { join } from 'node:path';
import { compareCodePoints } from '@rotaris/kernel';
import { CODE_INTELLIGENCE_MANIFEST } from './code-intelligence-manifest.generated.js';
import type { ResolvedCommand } from './commands.js';
import type { McpServerEntry } from './entry.js';

/**
 * ADR-0035 (Part T, 2026-09-06): the typed reading of the generated binding manifest (REQ-MCP-116). Every consumer of a
 * runtime identifier — the shipped default entry (REQ-MCP-010/011), the workspace binding (034), the derived setup
 * invocation (036), the setup steps and the contains-code test (099), the binding probe (071), the project-memories
 * block (102) and the built-in grants (014/015) — reads it THROUGH this module; the test
 * `code-intelligence.test.ts` greps the tree for a literal tool name anywhere else.
 */
export { CODE_INTELLIGENCE_MANIFEST };

/** REQ-CONFIG-181's name for the shipped entry; REQ-MCP-071 probes "a connected server carrying the built-in code-intelligence name". */
export const CODE_INTELLIGENCE_SERVER_NAME = 'code_intelligence' as const;

export type CodeIntelligenceTier = keyof typeof CODE_INTELLIGENCE_MANIFEST.tiers;
export const CODE_INTELLIGENCE_TIERS = ['read', 'edit', 'memoryWrite', 'onboard'] as const satisfies readonly CodeIntelligenceTier[];

/** The names of one tier, in code-point order. */
export function tierNames(tier: CodeIntelligenceTier): string[] {
  return [...Object.values(CODE_INTELLIGENCE_MANIFEST.tiers[tier]) as string[]].sort(compareCodePoints);
}

/** REQ-MCP-014: a persona's `code_intelligence` grant is exactly the union of its tiers (12, 19 or 13 names). */
export function grantForTiers(tiers: readonly CodeIntelligenceTier[]): string[] {
  return [...new Set(tiers.flatMap((t) => tierNames(t)))].sort(compareCodePoints);
}

/** REQ-MCP-015: the three names no built-in grant may hold. */
export function neverGrantNames(): string[] {
  return [...Object.values(CODE_INTELLIGENCE_MANIFEST.neverGrant) as string[]].sort(compareCodePoints);
}

/** REQ-MCP-034/036: the launch subcommand and the two project-selection options, as command resolution binds on them. */
export const CODE_INTELLIGENCE_BINDING = Object.freeze({
  launchSubcommand: CODE_INTELLIGENCE_MANIFEST.launchSubcommand,
  projectPathOption: CODE_INTELLIGENCE_MANIFEST.projectPathOption,
  projectFromCwdOption: CODE_INTELLIGENCE_MANIFEST.projectFromCwdOption,
});

/** REQ-MCP-010: the shipped entry's arguments — the launch subcommand, then what selects stdio transport and the host-integration mode; no project path. */
export const CODE_INTELLIGENCE_DEFAULT_ARGS: readonly string[] = Object.freeze([CODE_INTELLIGENCE_MANIFEST.launchSubcommand, ...CODE_INTELLIGENCE_MANIFEST.transportArgs, ...CODE_INTELLIGENCE_MANIFEST.modeArgs]);

/** REQ-MCP-071: the memory-listing tool the binding probe calls; REQ-MCP-102: the pair whose grant admits the memories block. */
export const CODE_INTELLIGENCE_MEMORY_LISTING_TOOL: string = CODE_INTELLIGENCE_MANIFEST.tiers.read.memoryListing;
export const CODE_INTELLIGENCE_MEMORY_GATE: readonly [string, string] = [CODE_INTELLIGENCE_MANIFEST.tiers.read.memoryListing, CODE_INTELLIGENCE_MANIFEST.tiers.read.memoryReading];

/**
 * REQ-MCP-102's project-memories block: ONE text, the same characters in the same order in every prompt that carries
 * it; its four required points and nothing that varies by persona, server or run. Placed under the code-intelligence
 * server's entry by `renderMcpSection`. Names no tool: the agent holds the memory tools it was granted.
 */
export const PROJECT_MEMORIES_BLOCK = [
  '  Project memories: before you start exploring the codebase, list the project memories that already exist and read the ones that bear on your task.',
  '  Write durable findings that are not obvious from the code back into the project memories through the memory-writing tools you hold.',
  '  Keep agent-instruction files out of the memories, and keep anything that is true only of the current run out of them.',
].join('\n');

/** REQ-MCP-102: does this server's granted surface (reported names) hold both gating tools? */
export function memoriesBlockApplies(reportedNames: Iterable<string>): boolean {
  const names = new Set(reportedNames);
  return CODE_INTELLIGENCE_MEMORY_GATE.every((n) => names.has(n));
}

/**
 * PD-MCP-001 (OQ-115, ruled by the owner under R-071): the description the product wrote for one of the bundled runtime's
 * tools, by the name the runtime reports, or null when the product wrote none and the runtime's own stands. The manifest
 * carries the text by capability (`productDescriptions`); the tool stays where REQ-MCP-015 puts it.
 */
const PRODUCT_DESCRIPTIONS: ReadonlyMap<string, string> = new Map(
  Object.entries(CODE_INTELLIGENCE_MANIFEST.productDescriptions).flatMap(([capability, text]) =>
    Object.values(CODE_INTELLIGENCE_MANIFEST.tiers).flatMap((tier) => (Object.prototype.hasOwnProperty.call(tier, capability) ? [[(tier as Record<string, string>)[capability] as string, text] as const] : []))),
);
export function codeIntelligenceProductDescription(reported: string): string | null {
  return PRODUCT_DESCRIPTIONS.get(reported) ?? null;
}

export type SetupInvocation = { readonly ok: true; readonly command: string; readonly args: readonly string[] } | { readonly ok: false; readonly reason: string };

/**
 * REQ-MCP-036: the invocation the setup of REQ-MCP-099 drives — the entry's RESOLVED command and exactly the prefix of
 * its resolved arguments before the first launch subcommand; transport, mode and project-selection arguments never
 * appear. A remote entry, an empty command or arguments holding no launch subcommand derive nothing: the non-retryable
 * "not a local launch" failure, and no substitute command.
 */
export function deriveSetupInvocation(entry: Pick<McpServerEntry, 'type' | 'command' | 'args'>, resolved: ResolvedCommand | null): SetupInvocation {
  if (entry.type !== 'stdio') return { ok: false, reason: `the code-intelligence entry is not a local launch: it is a remote ${entry.type} server, so no setup command can be derived from it (REQ-MCP-036); no substitute command is used` };
  const command = resolved?.command ?? entry.command ?? '';
  if (command.trim() === '') return { ok: false, reason: 'the code-intelligence entry is not a local launch: its command is empty, so no setup command can be derived from it (REQ-MCP-036); no substitute command is used' };
  const args = resolved?.args ?? entry.args;
  const at = args.indexOf(CODE_INTELLIGENCE_MANIFEST.launchSubcommand);
  if (at === -1) return { ok: false, reason: `the code-intelligence entry is not a local launch of the bundled runtime: its arguments hold no server-launch subcommand, so no setup command can be derived from it (REQ-MCP-036); no substitute command is used` };
  return { ok: true, command, args: args.slice(0, at) };
}

export interface SetupStepSpec {
  readonly id: 'create' | 'index' | 'memory';
  readonly label: string;
  /** The subcommand words; the project path follows as the last argument. */
  readonly subcommand: readonly string[];
  readonly budgetMs: number;
  /** REQ-MCP-099: skipped with `skipped-no-code` when the workspace contains no code. */
  readonly needsCode: boolean;
}

/** REQ-MCP-099: the three steps in order, their budgets 300 / 1800 / 120 s, and which two the contains-code answer gates. */
export const CODE_INTELLIGENCE_SETUP_STEPS: readonly SetupStepSpec[] = Object.freeze([
  { id: 'create', label: 'Create the project', subcommand: CODE_INTELLIGENCE_MANIFEST.setup.create, budgetMs: 300_000, needsCode: false },
  { id: 'index', label: 'Index the project', subcommand: CODE_INTELLIGENCE_MANIFEST.setup.index, budgetMs: 1_800_000, needsCode: true },
  { id: 'memory', label: 'Initialise the project memories', subcommand: CODE_INTELLIGENCE_MANIFEST.setup.memory, budgetMs: 120_000, needsCode: true },
]);

/** REQ-MCP-099: the marker whose presence skips creation, relative to the workspace root, in path segments. */
export const CODE_INTELLIGENCE_MARKER_SEGMENTS: readonly string[] = Object.freeze(CODE_INTELLIGENCE_MANIFEST.markerFile.split('/'));

/** REQ-MCP-099: a regular file with one of these extensions makes the workspace contain code. Matched on the name's trailing extension. */
export const CODE_INTELLIGENCE_EXTENSIONS: ReadonlySet<string> = new Set(CODE_INTELLIGENCE_MANIFEST.extensions);
export function hasIndexableExtension(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return false;
  // The runtime's matchers are case-sensitive for most languages; a few (C/C++, Fortran, Ada) match case-insensitively.
  const ext = fileName.slice(dot);
  return CODE_INTELLIGENCE_EXTENSIONS.has(ext) || CODE_INTELLIGENCE_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * ESC-32 / IC-7 (2026-09-06) — REQ-STARTUP-058's second list, REQ-STARTUP-159, REQ-MCP-118: the language servers the runtime
 * provisions at the first use of a language, declared with name, exact version, source and licence, and where the runtime
 * stores them under its home. Read from the manifest, which the generator checked against the runtime's own defaults; the
 * disclosure on the MCP category shows exactly this and restates nothing.
 */
export const CODE_INTELLIGENCE_LANGUAGE_SERVERS = CODE_INTELLIGENCE_MANIFEST.languageServers;
export const CODE_INTELLIGENCE_LANGUAGE_SERVER_STORE: string = CODE_INTELLIGENCE_MANIFEST.languageServerStore;

/**
 * REQ-STARTUP-145: the runtime's per-user home is one directory under the product's own data directory — its configuration,
 * its cross-project memories, the language servers it provisions. `main/sentinel.ts` restates the segment by design (it
 * imports nothing of this package so nothing can initialise before the branch); `code-intelligence.test.ts` pins the two
 * spellings together.
 */
export const CODE_INTELLIGENCE_HOME_SEGMENT = 'code-intelligence' as const;
export function codeIntelligenceRuntimeHome(dataDir: string): string {
  return join(dataDir, CODE_INTELLIGENCE_HOME_SEGMENT);
}
/** The directory the disclosure names: the store under the home (REQ-MCP-118). */
export function codeIntelligenceLanguageServerStore(dataDir: string): string {
  return join(codeIntelligenceRuntimeHome(dataDir), ...CODE_INTELLIGENCE_LANGUAGE_SERVER_STORE.split('/'));
}
