import type { CommandOutcome, RendererBridge } from '@rotaris/contracts';

/**
 * A NOTICE ACTION'S REFUSAL, SAID WHERE IT WAS PRESSED — REQ-NOTIFY-254 ("No failure is reported by silence. Every refusal
 * carries a reason worded by the layer that determined it") with REQ-NOTIFY-003 (a refusal is published as a persistent
 * notice, so it stays readable).
 *
 * A notice action that main answers — `open-hook-review` sends `hooks.review {workspace}` — can be refused there: "Open a
 * workspace before reviewing its hooks", "This workspace declares no hooks", "The review dialog could not be opened". Main
 * words the reason; this publishes it, unchanged, as the persistent `warning` notice the retry action's refusal already takes
 * ("Nothing was retried"), its headline the title and its detail the copyable detail (REQ-NOTIFY-005). Until 2026-10-14 the
 * renderer's arm wrote it to the console alone, and the person who pressed the action saw nothing
 * (docs/defects/fixed/a-refused-hook-review-notice-action-is-reported-only-to-the-renderer-console.md).
 *
 * A refused REACH that built no window has already been reported: `MainWindows.#addWindow` raises REQ-SHELL-019's "Could not
 * open the selected project: {reason}" before it answers `workspace.buildFailed` or `workspace.openFailed`, and the reach after
 * a holder's open passes those on. Publishing it a second time would replace that report with its own copy, so those two codes
 * are only logged.
 *
 * The refusal is also logged at `info`: the capture seam relays a renderer's `warning` and `error` lines as renderer errors,
 * and a refusal said on screen is the product working, not a fault of the window.
 */
export const REPORTED_BEFORE_ANSWER: ReadonlySet<string> = new Set(['workspace.buildFailed', 'workspace.openFailed']);

export async function reportNoticeActionRefusal(
  bridge: Pick<RendererBridge, 'command'>,
  action: string,
  pending: Promise<CommandOutcome>,
  log: (line: string) => void = (line) => { console.info(line); },
): Promise<void> {
  let outcome: CommandOutcome;
  /*
   * `bridge.command` rejects when main's handler throws or the channel is gone (`ipcRenderer.invoke`, ADR-0019): that is a
   * refusal too, said in the words the session actions give it (`session-actions.ts`, `send`).
   */
  try { outcome = await pending; }
  catch (cause) { outcome = { ok: false, code: 'command.unreachable', headline: 'The application did not answer', detail: cause instanceof Error ? cause.message : String(cause) }; }
  if (outcome.ok) return;
  log(`notice action "${action}" was refused: ${outcome.headline} (${outcome.code})`);
  if (REPORTED_BEFORE_ANSWER.has(outcome.code)) return;
  try {
    await bridge.command({ kind: 'notice.report', severity: 'warning', title: outcome.headline, ...(outcome.detail === undefined || outcome.detail === '' ? {} : { detail: outcome.detail }), persistent: true });
  } catch (cause) {
    // The one place left to say it: the channel that would carry the notice is the one that failed.
    console.warn(`notice action "${action}" was refused (${outcome.headline}) and the refusal could not be published: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}
