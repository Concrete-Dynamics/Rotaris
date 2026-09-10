import { z } from 'zod';

/**
 * Part AO — the prompt-file commands' contract (REQ-CHAT-160/161), the plan's seam "C" as written: what a renderer
 * asks for (`prompts.roots.read`), what one file is (`PromptFile`), and what the read answers (`PromptsRootsResult`).
 *
 * The three roots are searched in exactly REQ-CHAT-160's order — `<workspace>/.agents/prompts/`, then
 * `~/.agents/prompts/`, then the `prompts/` directory of the user-global configuration directory — and the first
 * root to yield a normalised name wins outright. The READ happens in the workspace service (the process that reads
 * the user's files, ADR-0002); the NAMING, the collision rule and the expansion are the renderer's, in
 * `ui/src/slash/prompts.ts`, so a file's body crosses the boundary once and is expanded where it is invoked. The
 * request carries no workspace: main names the open one, as it does for every workspace-scoped command.
 */
export const PROMPT_ROOTS = ['workspace', 'home', 'config'] as const;
export type PromptRoot = (typeof PROMPT_ROOTS)[number];

export const PromptFileSchema = z.object({
  root: z.enum(PROMPT_ROOTS),
  path: z.string().min(1),
  /** The file's stem as it is on disk, before REQ-CHAT-160's normalisation (the renderer normalises, so a name's derivation is testable without a filesystem). */
  stem: z.string(),
  /** Frontmatter `description` / `argument-hint`, when the file carries them. */
  description: z.string().optional(),
  argumentHint: z.string().optional(),
  /** The body below the frontmatter (the whole file when there is none), UNEXPANDED; REQ-CHAT-161 expands it at invocation and the unexpanded text never reaches a model. */
  body: z.string(),
});
export type PromptFile = z.infer<typeof PromptFileSchema>;

/** REQ-CHAT-160: a file skipped with its logged reason — malformed frontmatter, unreadable — never preventing another from registering. */
export const PromptsRootsResultSchema = z.object({
  files: z.array(PromptFileSchema),
  skipped: z.array(z.object({ path: z.string(), reason: z.string() })),
});
export type PromptsRootsResult = z.infer<typeof PromptsRootsResultSchema>;

/** The seam's command shape, as the plan writes it. */
export type PromptsCommand = { readonly name: 'prompts.roots.read'; readonly workspace: string };

/** Renderer → main: the one command, spread into `CommandRequestSchema` under Part AO's banner. */
export const PROMPTS_COMMAND_SCHEMAS = [
  z.object({ kind: z.literal('prompts.roots.read') }),
] as const;
