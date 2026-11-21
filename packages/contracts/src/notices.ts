import { z } from 'zod';
import { PRIMARY_VIEWS, type ViewId } from './views.js';

/**
 * ADR-0049 (Part V) — the notice vocabulary as it crosses a boundary: the four severities, the four
 * acknowledgement kinds, the closed action union carrying its parameter, and the one persistent notice.
 *
 * REQ-NOTIFY-023: severity is one of `info`, `success`, `warning`, `error` in ascending order.
 * REQ-NOTIFY-018: an acknowledgement kind is one of `info`, `ok`, `warn`, `fail` in ascending severity,
 * each drawing the glyph of the notice severity in the same position (REQ-NOTIFY-036).
 * REQ-NOTIFY-044 / REQ-SHELL-115: the action vocabulary is closed and each member concerning an object
 * carries that object's identity; the view ids are imported from REQ-SHELL-023's single definition, never
 * restated; the settings categories are REQ-CONFIG-269's and the library tabs REQ-LIBRARY-103's, which the
 * dispatcher checks against the owning domain's list at dispatch (an action naming a value outside it is not
 * dispatched). No member writes into the user's project.
 */
export const NOTICE_SEVERITIES = ['info', 'success', 'warning', 'error'] as const;
export const NoticeSeveritySchema = z.enum(NOTICE_SEVERITIES);
export type NoticeSeverity = z.infer<typeof NoticeSeveritySchema>;

export const ACKNOWLEDGEMENT_KINDS = ['info', 'ok', 'warn', 'fail'] as const;
export const AcknowledgementKindSchema = z.enum(ACKNOWLEDGEMENT_KINDS);
export type AcknowledgementKind = z.infer<typeof AcknowledgementKindSchema>;

/** REQ-NOTIFY-036 / REQ-NOTIFY-018: ONE glyph set for both surfaces, keyed by the notice severity. */
export const SEVERITY_GLYPHS: Readonly<Record<NoticeSeverity, string>> = { info: 'i', success: '✓', warning: '!', error: '×' };
/** REQ-NOTIFY-018: which severity's glyph each acknowledgement kind draws. */
export const ACKNOWLEDGEMENT_SEVERITY: Readonly<Record<AcknowledgementKind, NoticeSeverity>> = { info: 'info', ok: 'success', warn: 'warning', fail: 'error' };
/** REQ-NOTIFY-019: the kind words, announced before the title. */
export const ACKNOWLEDGEMENT_KIND_WORDS: Readonly<Record<AcknowledgementKind, string>> = { info: 'Notice', ok: 'Done', warn: 'Warning', fail: 'Failed' };

/**
 * Stage C — the ONE action a transient acknowledgement may carry, under `PD-WORKSPACE-001`.
 *
 * This is deliberately NOT `NoticeActionSchema`. That union is the persistent banner's vocabulary, and
 * `REQ-SHELL-115` fixes what a banner action may do as a closed list of thirteen operations which does not
 * include starting a session; widening it would have made a product statement the directive never asked for.
 * A separate one-member union keeps that list closed and makes the transient's action unable to grow a
 * vocabulary behind it: a second member is a visible change to this type, not a new string somewhere.
 *
 * `REQ-NOTIFY-013` is the product's single definition of this surface and says in its own closing sentence
 * that a surface needing different behaviour extends it rather than standing a second one beside it — which
 * is why `PD-WORKSPACE-001` names it, and `REQ-NOTIFY-003`, in its dispositions.
 */
export const AcknowledgementActionSchema = z.object({
  kind: z.literal('start-session'),
  label: z.string().min(1),
});
export type AcknowledgementAction = z.infer<typeof AcknowledgementActionSchema>;

/**
 * REQ-LIBRARY-103: the Library's three tab names, a closed set stated there and cited here. REQ-SHELL-115 names the two a
 * notice action may open. The Library view is not drawn yet; the dispatcher validates against this list and has no target.
 */
export const LIBRARY_TABS = ['prompts', 'artifacts', 'proposals'] as const;
export const NOTICE_LIBRARY_TABS = ['artifacts', 'proposals'] as const;
export type NoticeLibraryTab = (typeof NOTICE_LIBRARY_TABS)[number];

const viewIds = PRIMARY_VIEWS.map((v) => v.id) as [ViewId, ...ViewId[]];

export const NoticeActionSchema = z.discriminatedUnion('kind', [
  /**
   * PD-SHELL-001 revision 3 (OQ-292, ruled 2026-10-14 under R-072): the session AND the workspace it lives in, as the run host
   * recorded that session's root. A press reaches that workspace (`session.focusFromNotice`) and focuses the session there.
   */
  z.object({ kind: z.literal('focus-session'), sessionId: z.string().min(1), workspace: z.string().min(1) }),
  z.object({ kind: z.literal('open-project-init'), workspace: z.string().min(1) }),
  z.object({ kind: z.literal('install-update') }),
  z.object({ kind: z.literal('open-view'), view: z.enum(viewIds) }),
  z.object({ kind: z.literal('open-settings'), category: z.string().min(1) }),
  z.object({ kind: z.literal('open-cloud-account') }),
  z.object({ kind: z.literal('open-library'), tab: z.enum(NOTICE_LIBRARY_TABS) }),
  z.object({ kind: z.literal('restart') }),
  z.object({ kind: z.literal('retry-run') }),
  z.object({ kind: z.literal('revert-proposal-review'), id: z.string().min(1) }),
  z.object({ kind: z.literal('save-settings') }),
  /**
   * Two members REQ-NOTIFY-044 gained on 2026-09-06 under ESC-34, raised by this part and ruled by the owner: the
   * eleven it named reached neither surface two other requirements oblige a notice to offer — REQ-NOTIFY-224's
   * unreviewed-hooks notice "offers an action opening the review" (REQ-HOOKS-106's dialog, not a settings category),
   * and REQ-WORKSPACE-152 (3)'s first-launch notice "carries an action that starts the flow", which that requirement
   * writes deliberately stronger than its clause (2)'s action merely leading to Settings.
   *
   * Each carries its object, as REQ-NOTIFY-044 requires of every member concerning one: the review names the
   * workspace it concerns, because REQ-NOTIFY-224 publishes per workspace and hook set and an unparameterised action
   * would review whichever workspace happened to be open; the setup names a provider only where there is one to name
   * (REQ-WORKSPACE-152 (1)'s re-authenticate entry), the first-launch notice starting at the catalog step.
   */
  z.object({ kind: z.literal('open-hook-review'), workspace: z.string().min(1) }),
  z.object({ kind: z.literal('open-provider-sign-in'), provider: z.string().min(1).optional() }),
  /**
   * PD-STARTUP-008 item 10 and PD-SHELL-005 revision 2 (R-084; R-117): the one member REQ-NOTIFY-044 and REQ-SHELL-115 gain
   * for the background download — cancel the update download that is running. No parameter: main holds the one download
   * (REQ-STARTUP-177), so a window names nothing. The download notice and the title-bar indicator (PD-SHELL-018) dispatch the
   * same member, one identifier and one result from either place (REQ-SHELL-115).
   */
  z.object({ kind: z.literal('cancel-update') }),
  /**
   * PD-SHELL-018 revision 2 (OQ-556, ruled 2026-11-21 under R-072): open the page of an available release, offered only on
   * PD-STARTUP-014's link-only notice. No parameter: main keeps the page beside the offer and checks it at the press, so no
   * address crosses from a renderer. Its behaviour is the plan's Stage 3; until then the dispatcher logs a press and does
   * nothing (seams §6: "a member whose target is not built is logged there and nothing else").
   */
  z.object({ kind: z.literal('open-release-page') }),
]);
export type NoticeAction = z.infer<typeof NoticeActionSchema>;
export type NoticeActionKind = NoticeAction['kind'];

/**
 * REQ-NOTIFY-023: the persistent notice. `message` and `detail` may be empty (REQ-NOTIFY-037 draws only the non-empty
 * rows); `persistent` decides the dismiss control and nothing else (REQ-NOTIFY-040); ONE action, label plus the
 * member it invokes (REQ-SHELL-114); `sessionId` empty means the focused run (REQ-NOTIFY-028).
 *
 * `action.disabled` (2026-09-28, the updater — first-release-plan.md §4.6): REQ-SHELL-118 has the update offer's
 * `Update now` action DISABLED for the length of the download, "so the same download cannot be started twice, and its
 * accessible description SHALL say why it is disabled". The value is that description; its presence is the disabled
 * state. No other notice sets it, and it widens no vocabulary: the action member is the same closed union.
 *
 * `progress` (2026-11-21, R-117; REQ-NOTIFY-043, the notice-banner brief §3.1): the optional measured progress the banner
 * draws as a meter under its text — a whole percent, 0 to 100. Only the update's download face sets it, and only while the
 * feed states the asset's size (REQ-STARTUP-118's `{N} MB` form carries none); it leaves with the notice. It is the
 * notice's payload, not `update:state`'s, so a notice that is not the update's never carries the updater's state.
 */
export const NoticeSchema = z.object({
  id: z.number().int().positive(),
  severity: NoticeSeveritySchema,
  title: z.string(),
  message: z.string(),
  detail: z.string(),
  persistent: z.boolean(),
  action: z.object({ label: z.string().min(1), action: NoticeActionSchema, disabled: z.string().min(1).optional() }).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  sessionId: z.string(),
});
export type Notice = z.infer<typeof NoticeSchema>;
