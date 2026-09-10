import { useSyncExternalStore } from 'react';
import type { RunState } from '../composer.js';

/**
 * Part AO — the host the chat controls act through, and why it is module-level.
 *
 * Three surfaces reach one mechanism: the run header's "Compress context" (`RunHeader.tsx`), the palette's
 * `Compress context` entry (`commands/registry.ts`) and the composer's `/compress` and `/clear`. The run header is
 * rendered by `WorkspaceView` with a prop list this part may not change, the palette entry runs against a
 * `CommandContext` that carries no control channel, and `packages/ui` never holds the bridge. The one component that
 * has everything — the host's `slash.control`, this window's acknowledger, the run state, the row count — is
 * `WorkspaceView`, whose `slot:clear` this part fills (`slash/controls.tsx`), and the control mounted there binds
 * the host below from that closure; the header and the palette read it at the moment they act. It is the shape Part
 * AN's `slashOpeners` took for the same reason, stated here rather than hidden. A leaf module, so the palette's
 * registry can import it without a cycle through the catalogue.
 *
 * **What reports what.** The run host raises what only it knows — the completion count (REQ-CHAT-080), the
 * per-agent failures (REQ-MONITOR-094), the clear's outcome (REQ-CHAT-084) — through main's notice store and this
 * window's stack. The surfaces raise what they know locally: REQ-CHAT-079's start toast and its "Compressing…"
 * relabel, the nothing-to-compress toast on a refusal, REQ-CHAT-082's already-empty toast, REQ-CHAT-083's dialog,
 * and REQ-MONITOR-090/097/271's "No run is active." for a command or keyboard path taken while no run executes.
 */
export const COMPRESSING_TOAST = 'Compressing active agent contexts…';
export const NOTHING_TO_COMPRESS_TOAST = 'No active agent contexts are available to compress.';
export const COMPRESS_LABEL = 'Compress context';
export const COMPRESSING_LABEL = 'Compressing…';
export const COMPRESS_DESCRIPTION = 'Manually compress context for all active agents';
export const CLEAR_LABEL = 'Clear transcript';
export const CLEAR_DESCRIPTION = 'Permanently remove transcript messages from the loaded session';
export const TRANSCRIPT_ALREADY_EMPTY_TOAST = 'Transcript is already empty.';
export const CLEAR_DIALOG_TITLE = 'Clear transcript?';
export const CLEAR_DIALOG_BODY = 'This removes the visible conversation from the loaded session. Agent state, artifacts, and Git changes remain.';
export const CLEAR_DIALOG_IMPACT = 'Transcript messages cannot be restored after the session snapshot is saved.';
export const CLEAR_DIALOG_CONFIRM = 'Clear transcript';

export type ControlAnswer = { readonly ok: true } | { readonly ok: false; readonly reason: string };
export type ChatAcknowledger = (kind: 'ok' | 'fail' | 'info' | 'warn', title: string, body?: string) => void;

export interface ChatControlsHost {
  readonly runState: RunState;
  readonly rowCount: number;
  /** REQ-CHAT-029 / REQ-MONITOR-090's reason while no run executes — the catalogue's own sentence, supplied by the binder so this leaf imports nothing of it. */
  readonly noRunReason: string;
  /** The dispatch of `forceCompression` to the run host, and nothing else. */
  compress(): Promise<ControlAnswer>;
  /** REQ-CHAT-082's whole flow — the already-empty toast, else the confirmation dialog, then the dispatch on confirm. */
  requestClear(): void;
  acknowledge: ChatAcknowledger;
}

const listeners = new Set<() => void>();
let bound: ChatControlsHost | null = null;
export function bindChatControls(host: ChatControlsHost | null): void {
  bound = host;
  for (const l of listeners) l();
}
export function chatControls(): ChatControlsHost | null {
  return bound;
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useChatControls(): ChatControlsHost | null {
  return useSyncExternalStore(subscribe, chatControls, chatControls);
}

/**
 * REQ-CHAT-079/080 and REQ-MONITOR-090/091/093: the idle refusal, the start toast, the dispatch, the refusal toast.
 * The completion toast or the "Context compression incomplete" notice comes from the run host, which holds the count
 * and the failures. Returns the answer so a slash command can report `failed` with the reason (REQ-CHAT-021).
 */
export async function compressNow(host: ChatControlsHost): Promise<ControlAnswer> {
  if (host.runState !== 'running') { host.acknowledge('warn', host.noRunReason); return { ok: false, reason: host.noRunReason }; }
  host.acknowledge('info', COMPRESSING_TOAST);
  const r = await host.compress();
  // REQ-CHAT-079: a refusal from a running run means nothing could be compressed; the helper's own wording, where it differs, rides as the body.
  if (!r.ok) host.acknowledge('warn', NOTHING_TO_COMPRESS_TOAST, r.reason === NOTHING_TO_COMPRESS_TOAST ? undefined : r.reason);
  return r;
}

/** REQ-MONITOR-097 / REQ-MONITOR-271: the palette's `Compress context` — listed always, refused with the reason while no run executes; nothing without a bound host. */
export function compressFromPalette(): void {
  const host = chatControls();
  if (host === null) return;
  void compressNow(host);
}
