import { DisplayChangedSchema, type DisplayPreferenceKey } from '@rotaris/contracts';
/**
 * REQ-CHAT-167 — the reasoning-visibility preference's one writer, and why it is module-level.
 *
 * Three surfaces change `display/showReasoning`: the command palette's "Toggle reasoning bodies", its slash mirror
 * `/toggle-reasoning-bodies` (REQ-CHAT-028 mirrors every palette entry) and the switch in Settings → Display. The
 * palette entry runs against a `CommandContext` that carries no command channel (`commands/registry.ts`), and
 * `packages/ui` never holds the bridge, so the renderer binds the preference once and the palette reads it at the moment
 * it acts — the shape `workspace-host.ts`, `slash/host.ts` and `terminal/host.tsx` already took, for the same reason.
 * A leaf module, so the registry can import it without a cycle through the catalogue.
 *
 * The write is the renderer's `writeDisplayPref`: `prefs.set` to main and then the window's `displayPrefs` store, which
 * every transcript surface reads, so the change takes effect on the rows already on screen (REQ-CHAT-167). Main then
 * announces the stored value to every window (channel 14, `display:changed`) and each folds it into its own store
 * through `displayPreferencePatch`, so the rows of a persona window already open change with it — until 2026-10-14 only
 * the window that wrote did. A row the
 * reader opened or closed by hand keeps that state (REQ-CHAT-059): the preference is only the default the pane folds
 * the reader's overrides over (`TranscriptPane.tsx`), and changing it does not touch the overrides.
 *
 * REQ-CHAT-167's "Toggling MUST report the new state" is the acknowledgement this module raises. Settings → Display
 * reports it on the switch itself, which is drawn from the same store and so reads the new state the moment it lands.
 * A window with nothing bound (an auxiliary window) does nothing, on the terms the other hosts state.
 */
export const REASONING_SHOWN_TITLE = 'Reasoning bodies shown';
export const REASONING_SHOWN_BODY = 'Every reasoning row now shows its text. A row you opened or closed yourself keeps your choice.';
export const REASONING_HIDDEN_TITLE = 'Reasoning bodies hidden';
export const REASONING_HIDDEN_BODY = 'Every reasoning row now shows only its summary line. A row you opened or closed yourself keeps your choice.';
export const REASONING_NOT_CHANGED_TITLE = 'Reasoning bodies were not changed';

export type PreferenceAnswer = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface ReasoningPreferenceHost {
  /** What the window shows now — read at the moment of the toggle, never cached here. */
  current(): boolean;
  /** `prefs.set` of `display/showReasoning`, then the window's display store; the answer says whether both happened. */
  write(value: boolean): Promise<PreferenceAnswer>;
  acknowledge(kind: 'ok' | 'fail', title: string, body?: string): void;
}

let bound: ReasoningPreferenceHost | null = null;
export function bindReasoningPreference(host: ReasoningPreferenceHost | null): void { bound = host; }

/**
 * Flips `display/showReasoning` and reports the state it now holds. Resolves to that state, or to null where nothing
 * changed: no host bound, or a write main refused — which is reported with main's reason, and the store is left alone.
 * Activations run one at a time, each reading the state the one before it left: the store changes only once main has
 * answered, so two activations inside one round trip would otherwise both write the same value
 * (`docs/defects/fixed/two-reasoning-toggles-inside-one-write-both-write-the-same-value.md`).
 */
let toggles: Promise<unknown> = Promise.resolve();
export function toggleReasoningBodies(): Promise<boolean | null> {
  const next = toggles.then(flipReasoningBodies);
  toggles = next.catch(() => null);
  return next;
}

async function flipReasoningBodies(): Promise<boolean | null> {
  const host = bound;
  if (host === null) return null;
  const next = !host.current();
  const answer = await host.write(next);
  if (!answer.ok) { host.acknowledge('fail', REASONING_NOT_CHANGED_TITLE, answer.reason); return null; }
  if (next) host.acknowledge('ok', REASONING_SHOWN_TITLE, REASONING_SHOWN_BODY);
  else host.acknowledge('ok', REASONING_HIDDEN_TITLE, REASONING_HIDDEN_BODY);
  return next;
}

/**
 * Channel 14 (REQ-CHAT-167, REQ-CONFIG-403, with PD-CONFIG-004 for the third switch): what one `display:changed` announcement changes in a window's display store —
 * the one field the stored key names, set to the stored value — or null for a payload that is not one, which the window
 * ignores. Every window folds every announcement, its own write's included, so all of them draw the stored value.
 */
export type DisplayPreferencePatch = Partial<{ showReasoning: boolean; autoCollapseTools: boolean; groupTools: boolean }>;
const DISPLAY_FIELDS: Readonly<Record<DisplayPreferenceKey, keyof DisplayPreferencePatch>> = {
  'display/showReasoning': 'showReasoning',
  'display/autoCollapseTools': 'autoCollapseTools',
  'display/groupToolCalls': 'groupTools',
};
export function displayPreferencePatch(payload: unknown): DisplayPreferencePatch | null {
  const parsed = DisplayChangedSchema.safeParse(payload);
  if (!parsed.success) return null;
  return { [DISPLAY_FIELDS[parsed.data.preference]]: parsed.data.value };
}
