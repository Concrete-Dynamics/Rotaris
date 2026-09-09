import type { ControlOp } from '@rotaris/contracts';
import type { Result } from '@rotaris/kernel';
import type { RunState } from '../composer.js';

/**
 * Part AN — the composer's slash-command catalogue: the seam between the composer (which parses, clears, runs and
 * reports, REQ-CHAT-018..023), the catalogue (which registers the commands, REQ-CHAT-028..033 and REQ-CHAT-159) and
 * the parts that add commands through the same registry later: prompt-file commands (REQ-CHAT-160/161, Part AO)
 * and, once skill discovery exists, skill commands (REQ-CHAT-034/162). The shapes here are the plan's seam "C",
 * as written; a change to them is raised in a handoff, never made here.
 */

/** REQ-CHAT-025: the closed set of kind badges. */
export type SlashKind = 'action' | 'skill' | 'prompt';
/** REQ-CHAT-025 / REQ-CHAT-029..031: listed but unavailable, with the command's own stated reason. */
export type Availability = { readonly ok: true } | { readonly ok: false; readonly reason: string };
/** REQ-CHAT-020: exactly one of five outcomes; every one but `not-a-command` counts as handled. */
export type SlashOutcome =
  | { readonly kind: 'executed' }
  | { readonly kind: 'not-a-command' }
  | { readonly kind: 'unknown'; readonly name: string }
  | { readonly kind: 'unavailable'; readonly reason: string }
  | { readonly kind: 'failed'; readonly message: string };

/** What a command may read and do. Built by the composer from its own props; faked by the tests. */
export interface SlashContext {
  readonly runState: RunState;
  readonly rowCount: number;
  readonly hasGit: boolean;
  readonly models: readonly string[];
  readonly personas: readonly string[];
  readonly themes: readonly string[];
  readonly providers: readonly string[];
  setModel(name: string): Promise<void>;
  setPersona(name: string): Promise<void>;
  setTheme(name: string): Promise<void>;
  logout(provider: string): Promise<void>;
  control(op: ControlOp): Promise<Result<unknown, string>>;
  open(dialog: 'start-session' | 'sessions' | 'worktree' | 'stash' | 'search'): void;
  stash(): void;
  notify(text: string): void;
  /** REQ-CHAT-161's delivery: the expanded body goes exactly where typed text would have gone. */
  submitAsPrompt(text: string): Promise<void>;
}

export interface SlashCommand {
  readonly name: string;
  readonly description: string;
  readonly argumentHint?: string;
  readonly kind: SlashKind;
  availability(ctx: SlashContext): Availability;
  run(argument: string, ctx: SlashContext): Promise<SlashOutcome>;
}

/** REQ-CHAT-022's semantics: `registry.ts`. */
export interface SlashRegistry {
  register(command: SlashCommand): void;
  lookup(name: string): SlashCommand | undefined;
  filter(text: string): readonly SlashCommand[];
  list(): readonly SlashCommand[];
}

/** REQ-CHAT-018's parser: `parse.ts`; re-exported here because the seam names it beside the types. */
export { parseSlash } from './parse.js';
export type SlashParse = { readonly kind: 'command'; readonly name: string; readonly argument: string } | { readonly kind: 'prompt' };
