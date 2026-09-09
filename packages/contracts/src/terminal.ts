// Part AM — seam per plan; AL owns this file. The declarations below are the plan's seam "T" as the manager ruled it on
// 2026-09-09 (`kind`, not `name`, because the command union is `z.discriminatedUnion('kind', …)`), so that Part AM's grid
// and window compile in their own worktree; the manager keeps AL's copy at the merge.
import type { EncodedKey } from './terminal-keys.js';

export interface TerminalStreamMeta {
  readonly streamId: string; readonly sessionId: string; readonly agentId?: string;
  readonly kind: 'agent' | 'background';        // background = `bg:<id>` (REQ-TOOLS-127)
  readonly displayName: string;                 // persona name, or "Background session <id elided to 12>", or "Terminal"
  readonly command?: string; readonly running: boolean; readonly exitCode?: number; readonly truncated: boolean;
  readonly cols: number; readonly rows: number; readonly acceptsInput: boolean; readonly canKill: boolean;
}
// TerminalFrameSchema (channels.ts, rewritten in place by AL): { v, sessionId, streamId, seq, kind: 'delta' | 'screen' | 'meta', payload: string, meta?: TerminalStreamMeta, closing?: true /* OQ-5 reading: literal replacement */ }
export type TerminalRefusal = 'ended' | 'unknown-stream' | 'no-kill-capability' | 'streaming-disabled';
export type TerminalCommand =
  | { readonly kind: 'terminal.streams'; readonly sessionId: string }                                              // → TerminalStreamMeta[]
  | { readonly kind: 'terminal.sendKeys'; readonly streamId: string; readonly keys: readonly EncodedKey[] }        // → Result<void, TerminalRefusal>
  | { readonly kind: 'terminal.resize'; readonly streamId: string; readonly cols: number; readonly rows: number }  // emulated screen always; PTY when possible
  | { readonly kind: 'terminal.interrupt'; readonly streamId: string }
  | { readonly kind: 'terminal.endInput'; readonly streamId: string }
  | { readonly kind: 'terminal.kill'; readonly streamId: string }
  | { readonly kind: 'terminal.audit'; readonly streamId: string; readonly entry: { readonly kind: 'line' | 'control' | 'took-control' | 'released-control' | 'kill'; readonly text?: string } };  // REQ-SHELL-107; redacted in the run host
