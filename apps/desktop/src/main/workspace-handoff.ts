import type { Millis } from '@rotaris/kernel';
import type { ProcessReply, RunHostRequest } from '@rotaris/contracts';

/**
 * Main's hand-off of an opened workspace to the run host (W-18: the run host is handed the resolved store path), with the
 * one outcome the request's bound can add to its replies: none came in time (ADR-0002 consequence 11: every request is
 * bounded, and expiry refuses rather than proceeds). Main's `openWorkspaceInner` (`index.ts`) is the only caller.
 *
 * Until 2026-10-20 the request was awaited bare, so a reply missed within the bound rejected through the launch and ended
 * main's start-up as an unhandled rejection (`compression-proof`'s `automatic` launch, 2026-10-16;
 * docs/defects/fixed/a-workspace-opened-timeout-is-an-unhandled-main-rejection.md). A missed reply is now logged as a
 * warning for what it is, and the open goes on as it does for any reply that is not `workspace.ack`: the window keeps the
 * workspace the service opened, and the open's slot (REQ-WORKSPACE-141's initialization resolution, the board's queue,
 * the hook review and the configuration's load) is not scheduled. Whether a missed reply owes more than that (a notice,
 * a second hand-off, a late reply's slot) the specification does not say: OQ-386.
 */

export type WorkspaceOpenedRequest = Extract<RunHostRequest, { kind: 'workspace.opened' }>;

export interface WorkspaceHandOff {
  /** The run host's reply, or `null` when none came within the bound (or the link closed first). */
  readonly reply: ProcessReply | null;
  /** True only for `workspace.ack`: the run host holds the store, and the open's slot may be scheduled. */
  readonly acknowledged: boolean;
}

export interface WorkspaceHandOffDeps {
  readonly request: (request: WorkspaceOpenedRequest, boundMs: Millis) => Promise<ProcessReply>;
  readonly log: (message: string, level: 'warn') => void;
}

export async function handOffOpenedWorkspace(deps: WorkspaceHandOffDeps, request: WorkspaceOpenedRequest, boundMs: Millis): Promise<WorkspaceHandOff> {
  try {
    const reply = await deps.request(request, boundMs);
    return { reply, acknowledged: reply.kind === 'workspace.ack' };
  } catch (cause) {
    deps.log(
      `workspace ${request.workspaceRoot} → ${request.workspaceId}: the run host did not acknowledge workspace.opened (${cause instanceof Error ? cause.message : String(cause)}); `
        + 'the window keeps the workspace, and its open slot (initialization, the board, the hook review, the configuration) is not scheduled (OQ-386)',
      'warn',
    );
    return { reply: null, acknowledged: false };
  }
}
