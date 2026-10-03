// @ts-check
/**
 * `artifacts-proof`'s publish launch (scenario 1, REQ-LIBRARY-136): the Library is shown EMPTY, the run publishes, the
 * view is left and returned to, and the row appears on the next refresh with no restart.
 *
 * Until 2026-10-03 the first half was four appointments: Ctrl+6 at 1200 ms, the Artifacts tab pressed at 1400 ms, the
 * empty state and the rows probed at 1600 ms, Ctrl+2 at 2000 ms. The reading had to land in the 400 to 600 ms between
 * the press and the leave, during a startup the launch does not control (initialization starts the code-intelligence
 * setup in a second Electron process just before). In the acceptance round's run 1 the renderer answered the press's
 * lookup 1.5 s late; it had processed the queued key events first, so the press looked for the tab in the Workspace
 * view, both probes read `[]`, and the proof failed on "the empty state was not shown before the run published"
 * (`docs/defects/fixed/artifacts-proofs-publish-launch-reads-the-empty-library-in-a-window-a-startup-stall-closes.md`).
 *
 * The schedule now follows the Library instead of guessing at it:
 *  - Ctrl+6 is still the first appointment, at 1200 ms;
 *  - the Artifacts tab is pressed when it is drawn (`@from~ms`, looking from the view switch on), and
 *  - the reading is taken when the Artifacts tab has LOADED its read and drawn either its empty state or a row, in ONE
 *    probe, so "no row" and "the empty state" are one instant's reading rather than two;
 *  - nothing leaves the Library before the reading's deadline: the separate Ctrl+2 is gone, and the leave is the
 *    prompt seam's own Ctrl+2 (`installPromptSeam`), which now comes after that deadline, and the run that publishes
 *    starts only from that submit;
 *  - the return (Ctrl+6 at 14000 ms) is an appointment again, and its tab press waits for the tab the same way.
 * The window a startup stall must exceed to make the launch red grew from about 0.4 s to 4.6 s, and a red that does
 * come says which step never matched rather than reading a view nobody meant to read.
 *
 * Nothing here is product code. It runs only from the proof and its test.
 */

/** The Library's Artifacts tab control (the Library opens on its first tab, REQ-LIBRARY-103's order). */
export const ARTIFACTS_TAB = '[data-testid="library-tab"][data-tab="artifacts"]';

/** The Artifacts tab once its read has answered (`data-loaded`, `packages/ui/src/library/ArtifactsTab.tsx`). */
export const LOADED_ARTIFACTS = '[data-testid="library-artifacts"][data-loaded="yes"]';

/** The one reading before the publish: the loaded tab's empty state or any of its rows, whichever is drawn. */
export const BEFORE_PUBLISH = `${LOADED_ARTIFACTS} :is([data-testid="library-artifacts-empty"], tr[data-artifact-id])`;

const VIEW_MS = 1200;
const READ_DEADLINE_MS = 5800;
const PROMPT_MS = 6000;
const RETURN_MS = 14000;
const RETURN_DEADLINE_MS = 15800;

/** The label the probe-at seam logs the reading under: the requested form, `~` included. */
export const BEFORE_PUBLISH_AT = `~${READ_DEADLINE_MS}`;

/** The capture variables of the launch's schedule; the proof adds the prompt's text, the script and the end probes. */
export const PUBLISH_SCHEDULE = Object.freeze({
  ROTARIS_CAPTURE_VIEWS: [`6@${VIEW_MS}`, `6@${RETURN_MS}`].join(';;'),
  ROTARIS_CAPTURE_CLICKS: [`${ARTIFACTS_TAB}@${VIEW_MS}~${READ_DEADLINE_MS}`, `${ARTIFACTS_TAB}@${RETURN_MS}~${RETURN_DEADLINE_MS}`].join(';;'),
  ROTARIS_CAPTURE_PROBE_AT: `${BEFORE_PUBLISH}@${VIEW_MS}~${READ_DEADLINE_MS}`,
  ROTARIS_CAPTURE_PROMPT_MS: String(PROMPT_MS),
  ROTARIS_CAPTURE_AFTER_MS: '16000',
});

/**
 * Why the reading before the publish does not show the empty Library, or `null` when it does.
 * @param {string} log the launch's log
 * @returns {string | null}
 */
export function emptyBeforePublish(log) {
  const text = log.replace(/\r\n/g, '\n');
  const marker = `capture: probe-at ${BEFORE_PUBLISH_AT} ${BEFORE_PUBLISH} → `;
  const line = text.split('\n').find((l) => l.includes(marker));
  if (line === undefined) return 'the reading before the run published was never taken';
  /** @type {{ data?: Record<string, string> }[]} */
  const found = JSON.parse(line.slice(line.indexOf(marker) + marker.length));
  const rows = found.filter((f) => f.data?.['data-artifact-id'] !== undefined).length;
  const empty = found.filter((f) => f.data?.['data-testid'] === 'library-artifacts-empty').length;
  if (rows > 0) return `the Library showed ${rows} row(s) before the run published`;
  if (empty !== 1) {
    const missed = text.includes(`capture: ${BEFORE_PUBLISH} never matched within ${READ_DEADLINE_MS} ms`);
    return `the empty state was not shown before the run published${missed ? ` (the loaded Artifacts tab was not drawn within ${READ_DEADLINE_MS} ms)` : ''}`;
  }
  return null;
}
