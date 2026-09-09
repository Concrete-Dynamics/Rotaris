// Part AM — seam per plan; AL owns this file. The declarations below are the plan's seam "T" verbatim so that Part AM's
// grid and window compile in their own worktree; the manager keeps AL's copy at the merge.
import type { EncodedKey } from './terminal-keys.js';

export interface TerminalStreamMeta {
  readonly streamId: string; readonly sessionId: string; readonly agentId?: string;
  readonly kind: 'agent' | 'background';        // background = `bg:<id>` (REQ-TOOLS-127)
  readonly displayName: string;                 // persona name, or "Background session <id elided to 12>", or "Terminal"
  readonly command?: string; readonly running: boolean; readonly exitCode?: number; readonly truncated: boolean;
  readonly cols: number; readonly rows: number; readonly acceptsInput: boolean; readonly canKill: boolean;
}
// TerminalFrameSchema (channels.ts, extended in place): { streamId, seq, kind: 'delta' | 'screen' | 'meta', payload: string, meta?: TerminalStreamMeta, closing?: true /* OQ-5 reading: literal replacement */ }
export type TerminalRefusal = 'ended' | 'unknown-stream' | 'no-kill-capability' | 'streaming-disabled';
export type TerminalCommand =
  | { readonly name: 'terminal.streams'; readonly sessionId: string }                                              // → TerminalStreamMeta[]
  | { readonly name: 'terminal.sendKeys'; readonly streamId: string; readonly keys: readonly EncodedKey[] }        // → Result<void, TerminalRefusal>
  | { readonly name: 'terminal.resize'; readonly streamId: string; readonly cols: number; readonly rows: number }  // emulated screen always; PTY when possible
  | { readonly name: 'terminal.interrupt'; readonly streamId: string }
  | { readonly name: 'terminal.endInput'; readonly streamId: string }
  | { readonly name: 'terminal.kill'; readonly streamId: string }
  | { readonly name: 'terminal.audit'; readonly streamId: string; readonly entry: { readonly kind: 'line' | 'control' | 'took-control' | 'released-control' | 'kill'; readonly text?: string } };  // REQ-SHELL-107; redacted in the run host
