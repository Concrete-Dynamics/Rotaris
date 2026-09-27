import type { PromptFile, PromptsRootsResult } from '@rotaris/contracts';
import { FIXED_SKILL_COMMAND_NAMES } from './skills.js';
import type { SlashCommand, SlashContext, SlashOutcome, SlashRegistry } from './types.js';

/**
 * Part AO — the prompt-file slash commands (REQ-CHAT-160/161): the naming, the registration and the one-pass
 * placeholder expansion, over the files the workspace service answered for the three roots (`contracts/slash.ts`).
 *
 * Everything here is pure so the rules are checkable without a filesystem or a DOM; `registerPromptCommands` takes
 * the registry `buildCatalogue` returns and registers after the built-ins and the palette mirrors, which is what
 * makes REQ-CHAT-160's "the command already holding it keeps it" a plain lookup rather than a special case.
 */

/** REQ-CHAT-160: lowercase, every run outside `[a-z0-9:_-]` → one `-`, leading and trailing `-` stripped. Empty means no command. */
export function normalisePromptStem(stem: string): string {
  return stem.toLowerCase().replace(/[^a-z0-9:_-]+/g, '-').replace(/^-+|-+$/g, '');
}

export const PROMPT_COMMAND_PREFIX = 'prompts:';

/**
 * REQ-CHAT-161 — the argument string split into positionals: runs of whitespace separate, a span in matching single
 * or double quotes is ONE argument with the quotes removed and its inner whitespace kept, an unterminated quote runs
 * to the end. No other escaping is recognised — a backslash is an ordinary character.
 */
export function splitPromptArguments(argument: string): string[] {
  const out: string[] = [];
  let i = 0;
  const s = argument;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i]!)) i += 1;
    if (i >= s.length) break;
    let token = '';
    let sawToken = false;
    while (i < s.length && !/\s/.test(s[i]!)) {
      const c = s[i]!;
      if (c === '"' || c === "'") {
        const close = s.indexOf(c, i + 1);
        // An unterminated quote is treated as though closed at the end of the argument string.
        const end = close === -1 ? s.length : close;
        token += s.slice(i + 1, end);
        sawToken = true;
        i = close === -1 ? s.length : close + 1;
        continue;
      }
      token += c;
      sawToken = true;
      i += 1;
    }
    if (sawToken) out.push(token);
  }
  return out;
}

/** REQ-CHAT-161: the value of the FIRST `NAME=value` pair in the argument string, or undefined. `value` runs to the next whitespace (or the closing quote of a quoted value). */
export function namedPromptArgument(argument: string, name: string): string | undefined {
  for (const token of splitPromptArguments(argument)) {
    const eq = token.indexOf('=');
    if (eq > 0 && token.slice(0, eq) === name) return token.slice(eq + 1);
  }
  return undefined;
}

/**
 * REQ-CHAT-161 — ONE left-to-right pass: `$$` → `$`; `$ARGUMENTS` → the argument string with surrounding whitespace
 * stripped; `$1`..`$9` → the positionals; `$UPPER_NAME` → the first `NAME=value` pair's value. An unsupplied
 * positional or an unmatched name expands to the EMPTY string, so a placeholder never leaves its own text in the
 * prompt. An expanded value is never rescanned: the output is appended to, never re-read.
 */
export function expandPromptBody(body: string, argument: string): string {
  const stripped = argument.trim();
  const positionals = splitPromptArguments(stripped);
  let out = '';
  let i = 0;
  while (i < body.length) {
    const c = body[i]!;
    if (c !== '$') { out += c; i += 1; continue; }
    const next = body[i + 1];
    if (next === '$') { out += '$'; i += 2; continue; }
    // `$1`..`$9` are single digits (the requirement lists exactly nine); `$10` is `$1` followed by a literal `0`.
    if (next !== undefined && next >= '1' && next <= '9') { out += positionals[Number(next) - 1] ?? ''; i += 2; continue; }
    // The maximal `[A-Z0-9_]+` run: exactly `ARGUMENTS` is the argument string; any other run is a `NAME=value` lookup.
    const m = /^[A-Z0-9_]+/.exec(body.slice(i + 1));
    if (m !== null) { out += m[0] === 'ARGUMENTS' ? stripped : (namedPromptArgument(stripped, m[0]) ?? ''); i += 1 + m[0].length; continue; }
    out += '$';
    i += 1;
  }
  return out;
}

/**
 * The renderer's reader of the three roots (`prompts.roots.read`, relayed by main to the workspace service), bound once
 * at start. `packages/ui` never holds the bridge; the renderer binds this and the composer's binder calls it on focus and
 * on a configuration change. Absent (a test, a window without a workspace), no prompt command registers.
 */
let promptRootsReader: (() => Promise<PromptsRootsResult>) | null = null;
/**
 * Defect AO-2 — the reader's LAST answer, kept beside the reader itself rather than in the registrar's state. The
 * catalogue's registry is rebuilt by its memo while a window settles (defect AO-1) and the component that registers
 * the prompt commands is mounted with the toolbar it draws, so a rebuild that found the answer only in that component
 * read the disk again and registered late. Binding a reader is what says the window and its workspace changed, and is
 * therefore what clears this.
 */
let lastRoots: PromptsRootsResult | null = null;
/**
 * Defect AO-3 — the read IN FLIGHT, for the same reason the answer above is kept here. Two effects start a
 * read as a window settles: the registrar's, when nothing is cached yet, and the configuration key's, which
 * always reloads. Neither can see the other, and at start neither has an answer to find, so both read — one
 * launch produced two `prompts.roots.read` round trips in the same millisecond and two more just after,
 * each listing three directories (measured 2026-09-16, `/tmp/rotaris-launch.log`). A read already running is
 * this window's answer, so a second caller joins it rather than starting another; the handle is cleared when
 * it settles, so a later focus or configuration change still reads the disk afresh.
 */
let inFlight: Promise<PromptsRootsResult> | null = null;
export function bindPromptRootsReader(reader: (() => Promise<PromptsRootsResult>) | null): void {
  promptRootsReader = reader;
  lastRoots = null;
  inFlight = null;
}
/** What the reader last answered, for a caller that must register on a new registry without waiting; null until the first answer. */
export function cachedPromptRoots(): PromptsRootsResult | null {
  return lastRoots;
}
export function readPromptRoots(): Promise<PromptsRootsResult> | null {
  if (promptRootsReader === null) return null;
  // Cached HERE, not by the caller: a read still in flight when the registrar is rebuilt is this window's answer all the
  // same, and the rebuilt registrar takes it synchronously instead of reading three directories again.
  if (inFlight !== null) return inFlight;
  const answered = promptRootsReader().then((result) => { lastRoots = result; return result; });
  const p: Promise<PromptsRootsResult> = answered.finally(() => { if (inFlight === p) inFlight = null; });
  inFlight = p;
  return p;
}

/** What a prompt file registers as: the two names (the second only when free), the description, the hint. */
export interface PromptRegistration {
  readonly name: string;
  readonly file: PromptFile;
}

/**
 * REQ-CHAT-160 — the names a set of files yields, in root order then directory order (the service's own order): each
 * file under `prompts:<stem>` and, when still free, under the bare stem; a later file whose normalised stem an earlier
 * one already claimed is skipped for that name (first root wins outright); a stem normalising to empty yields nothing.
 * `taken` is every name the registry already holds — the built-ins, the palette mirrors — which keep theirs.
 */
export function promptRegistrations(files: readonly PromptFile[], taken: (name: string) => boolean): { registrations: PromptRegistration[]; skipped: { path: string; reason: string }[] } {
  const registrations: PromptRegistration[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const claimed = new Set<string>();
  const free = (name: string) => !claimed.has(name) && !taken(name);
  for (const file of files) {
    const stem = normalisePromptStem(file.stem);
    if (stem === '') { skipped.push({ path: file.path, reason: 'the file name normalises to an empty command name' }); continue; }
    const prefixed = `${PROMPT_COMMAND_PREFIX}${stem}`;
    if (!free(prefixed)) { skipped.push({ path: file.path, reason: `/${prefixed} is already held (${claimed.has(prefixed) ? 'an earlier root yielded the same name' : 'another command holds it'})` }); continue; }
    registrations.push({ name: prefixed, file });
    claimed.add(prefixed);
    if (free(stem)) { registrations.push({ name: stem, file }); claimed.add(stem); }
  }
  return { registrations, skipped };
}

/** REQ-CHAT-160: the entry's description — the frontmatter's, else the file's place. */
export function promptDescription(file: PromptFile): string {
  return file.description ?? `Prompt file ${file.stem}.md (${file.root})`;
}

function promptCommand(name: string, file: PromptFile): SlashCommand {
  return {
    name, kind: 'prompt', description: promptDescription(file), ...(file.argumentHint === undefined ? {} : { argumentHint: file.argumentHint }),
    availability: () => ({ ok: true }),
    // REQ-CHAT-161: expanded exactly once here, then delivered as typed text would be — queued while a run is active
    // (REQ-CHAT-035), otherwise a start or a continue (REQ-CHAT-011); `submitAsPrompt` is that route. The
    // unexpanded body never leaves this function.
    run: async (argument: string, ctx: SlashContext): Promise<SlashOutcome> => {
      const text = expandPromptBody(file.body, argument);
      if (text.trim() === '') return { kind: 'failed', message: `Prompt file ${file.stem}.md expanded to nothing.` };
      try { await ctx.submitAsPrompt(text); return { kind: 'executed' }; }
      catch (cause) { return { kind: 'failed', message: cause instanceof Error ? cause.message : String(cause) }; }
    },
  };
}

/**
 * Register every prompt file on the catalogue's registry. Names a built-in or a mirror already holds are kept by their
 * holder (REQ-CHAT-160); names a previous registration of THIS function claimed are replaced (a rebuild after the roots
 * changed, REQ-CHAT-028 — REQ-CHAT-022's replace-in-place keeps the order). Returns what was registered and what was
 * skipped with its reason, for the log.
 */
export function registerPromptCommands(registry: SlashRegistry, result: PromptsRootsResult, previouslyRegistered: ReadonlySet<string> = new Set()): { names: string[]; skipped: { path: string; reason: string }[] } {
  // Defect AO-2: a name held by a `kind: 'prompt'` command is one of OURS — this module is the only registrar of that
  // kind — so a re-read REPLACES it in place (REQ-CHAT-022) instead of skipping it as somebody else's. That is what lets
  // `buildCatalogue` register the cached answer as it builds a registry and this registrar re-apply a fresh answer to the
  // same registry, without either mistaking the other's work for a holder it must respect. A built-in or a palette mirror
  // keeps its name, which is REQ-CHAT-160's rule and unchanged.
  //
  // `/skill` and `/skills` (REQ-CHAT-162) are held whether or not their effects have registered yet, exactly as the skill
  // registrar holds them. They register by effect, AFTER `buildCatalogue` has put the cached prompt files on the registry
  // and after this registrar's mount has recorded the bare stems as its own, so a `skills.md` took `/skills` there and a
  // re-read, trusting its record, took it back from the listing the fixed command had put over it —
  // docs/defects/fixed/a-prompt-file-named-skills-takes-the-skills-command.md.
  const { registrations, skipped } = promptRegistrations(result.files, (name) => {
    if (FIXED_SKILL_COMMAND_NAMES.has(name)) return true;
    const held = registry.lookup(name);
    return held !== undefined && held.kind !== 'prompt' && !previouslyRegistered.has(name);
  });
  for (const r of registrations) registry.register(promptCommand(r.name, r.file));
  return { names: registrations.map((r) => r.name), skipped: [...result.skipped, ...skipped] };
}
