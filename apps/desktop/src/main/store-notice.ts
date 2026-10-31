import type { CommandOutcome, NoticeAction, NoticeSeverity, ProcessReply } from '@rotaris/contracts';

/**
 * What main says about a workspace's store from the workspace service's answer to `workspace.open`, decided here and nowhere
 * else (`views/04-seams.md` §6). Pure: the answer in, the notice (or the condition to hold for the listing) out, so a test
 * pins every word without an Electron process. Main's `openWorkspaceInner` (`index.ts`) is the only caller. An identifier the
 * open could not read (REQ-SESSION-197), and a workspace path that is not a folder, are held and raised here beside the store's
 * refusals (`WORKSPACE_REFUSALS`).
 */

export interface StoreNotice {
  readonly severity: NoticeSeverity;
  readonly headline: string;
  readonly detail?: string;
  /** REQ-NOTIFY-044's "open settings at a named category": where the condition is resolved (OQ-281). */
  readonly action?: { readonly label: string; readonly action: NoticeAction };
}

/**
 * OQ-281 (ruled 2026-10-14 under R-072): a place holding no store is resolved in Settings › Project — the restore, or the
 * deliberate "Start a new session store…" beside it — so its notice opens Settings at that category (REQ-NOTIFY-044,
 * REQ-SHELL-023's Project). A cut restore whose store could not be put back (OQ-266) carries none: its detail names the
 * rename that resolves it, and neither action there is for it.
 */
export const OPEN_PROJECT_SETTINGS = { label: 'Open Project settings', action: { kind: 'open-settings', category: 'project' } } as const;

/** The condition `session.list` answers with while the open refuses the store (REQ-SESSION-202, REQ-SESSION-043). */
export interface StoreRefusal {
  readonly code: string;
  readonly headline: string;
  readonly detail?: string;
}

type Opened = Extract<ProcessReply, { kind: 'workspace.opened' }>;

/**
 * The refusals that are a lasting condition of the store's place, as against a restore merely under way
 * (`workspace.restore-in-flight`, which the restore's own end resolves): a place holding no store (REQ-SESSION-202, W-31) and
 * a cut restore whose store could not be put back (OQ-266).
 */
export const STORE_REFUSALS: ReadonlySet<string> = new Set(['workspace.store-missing', 'workspace.store-displaced']);

/** REQ-SESSION-202 / W-31: the refusal to hold and raise, in the workspace service's own words; `undefined` for any other answer. */
export function storeRefusalOf(reply: ProcessReply): StoreRefusal | undefined {
  if (reply.kind !== 'refused' || !STORE_REFUSALS.has(reply.code)) return undefined;
  return { code: reply.code, headline: reply.headline, ...(reply.detail === undefined ? {} : { detail: reply.detail }) };
}

/**
 * The refusals that are a condition of the workspace itself rather than of the store's place, so they are not `STORE_REFUSALS`:
 * an identifier file present but unreadable (REQ-SESSION-197), and a workspace path, or its `.rotaris`, that is a file and not a
 * folder (`workspace-service/not-a-folder.ts`; no requirement names it). Each is held and raised beside the store's refusals
 * because the same two things are owed — said at the open as a condition for the person to resolve, and never answered as "no
 * sessions" or "open a workspace", since the window holds a workspace the product cannot open (REQ-SESSION-043). Their notices
 * carry no action: neither of Settings › Project's resolutions (OQ-281) can act on them — the restore and the new store both
 * refuse an unreadable identifier, and neither makes a file a folder — and nothing else in REQ-NOTIFY-044's vocabulary repairs
 * a file. The way on, by hand, is the service's detail (`workspace-service/identifier-refusal.ts`, `not-a-folder.ts`).
 */
export const WORKSPACE_REFUSALS: ReadonlySet<string> = new Set(['workspace.identifier-unreadable', 'workspace.not-a-folder']);

/** The workspace's own refusal to hold and raise, in the workspace service's own words; `undefined` for any other answer. */
export function workspaceRefusalOf(reply: ProcessReply): StoreRefusal | undefined {
  if (reply.kind !== 'refused' || !WORKSPACE_REFUSALS.has(reply.code)) return undefined;
  return { code: reply.code, headline: reply.headline, ...(reply.detail === undefined ? {} : { detail: reply.detail }) };
}

/**
 * REQ-SESSION-202, REQ-SESSION-197: the error notice a held refusal is raised as — what was found, and no reason invented for it
 * (W-31 (2)). Only the place holding no store carries an action (OQ-281); the others are resolved by hand, as their detail says.
 */
export function storeRefusalNotice(held: StoreRefusal): StoreNotice {
  return {
    severity: 'error', headline: held.headline, ...(held.detail === undefined ? {} : { detail: held.detail }),
    ...(held.code === 'workspace.store-missing' ? { action: OPEN_PROJECT_SETTINGS } : {}),
  };
}

/** One of main's held refusals (`storeRefusals`, `index.ts`), by canonical root: the condition, and the id of the notice it was raised as. */
export interface HeldOpenRefusal {
  readonly held: StoreRefusal;
  readonly noticeId: Promise<number | null>;
}

/**
 * What main's `openWorkspaceInner` (`index.ts`) does with an open the workspace service refused: a store refusal or a workspace
 * refusal is held for the root — so the listing and every workspace-scoped refusal in that window state it (`answerUnderHeldRefusal`)
 * — and raised as its error notice through `report`, which answers the notice's id. Any other refusal holds and raises nothing.
 * Answers the notice raised, or `undefined`.
 *
 * A workspace refusal is raised once while it is held: a further open of that root refused for the same reason updates the
 * words held and keeps the notice already raised, rather than putting the same notice up again over one the person dismissed.
 * The successful open that clears the hold (`index.ts`) lets a later refusal raise again. A store refusal is raised at every
 * refused open, as it was before this condition was held (`store-resolution-proof` measures that path).
 *
 * A hold this replaces — any other condition for the root, or the same store refusal raised again — has its notice withdrawn
 * through `dismiss` as the new one is raised: the map keeps one notice id per root, so a notice it no longer holds could never
 * be withdrawn by the open that later succeeds, and would stand beside a working workspace saying what is no longer found.
 */
export function holdOpenRefusal(
  root: string, reply: ProcessReply, held: Map<string, HeldOpenRefusal>,
  report: (notice: StoreNotice) => Promise<number | null>, dismiss: (noticeId: number) => unknown,
): StoreNotice | undefined {
  const workspace = workspaceRefusalOf(reply);
  const refusal = storeRefusalOf(reply) ?? workspace;
  if (refusal === undefined) return undefined;
  const prior = held.get(root);
  if (workspace !== undefined && prior?.held.code === workspace.code) {
    held.set(root, { held: workspace, noticeId: prior.noticeId });
    return undefined;
  }
  if (prior !== undefined) void prior.noticeId.then((id) => (id === null ? undefined : dismiss(id))).catch(() => undefined);
  const notice = storeRefusalNotice(refusal);
  held.set(root, { held: refusal, noticeId: report(notice) });
  return notice;
}

/**
 * OQ-266 (ruled 2026-10-13 under R-072): the one info notice for a restore cut between its renames that this open reversed —
 * the stamp it began at, the sessions put back (or none here before), nothing from the backup applied, restore again from
 * Settings to apply it, and where the prepared copy is kept — only when the open found it there (`staging` is `null` when it
 * did not, a copy deleted by hand after the cut), so the sentence is never false.
 */
export function cutRestoreNotice(cut: NonNullable<Opened['cutRestore']>): StoreNotice {
  const before = cut.hadStore ? 'The sessions this workspace had here were put back' : 'This workspace had no sessions here before it';
  const kept = cut.staging === null ? '' : ` The prepared copy is kept at ${cut.staging}.`;
  return {
    severity: 'info',
    headline: `The restore begun at ${cut.stamp} did not finish`,
    detail: `${before}, and nothing from the backup was applied. Restore again from Settings to apply it.${kept}`,
  };
}

/**
 * The codes a command gate answers when the window holds no workspace identifier: `workspace.none`, and the checkpoints'
 * own `checkpoint.no-workspace` ("Checkpoints are unavailable without a workspace.", `commands/checkpoints.ts`).
 */
const NO_WORKSPACE_CODES: ReadonlySet<string> = new Set(['workspace.none', 'checkpoint.no-workspace']);

/**
 * OQ-281 (ruled 2026-10-14 under R-072), REQ-SESSION-202 / REQ-SESSION-089: every workspace-scoped refusal in a window whose
 * store the open refused states the held condition. The command gates answer `workspace.none` (the checkpoints'
 * `checkpoint.no-workspace`) from the window's missing workspace identifier — "Open a workspace first", false in a window that
 * holds one — so `runCommand` (`index.ts`) passes every answer through this before it leaves main: such a refusal in a window
 * with no identifier, while a refusal is held for its workspace, becomes that refusal in the workspace service's own words.
 * Anything else passes unchanged.
 * (`docs/defects/fixed/a-refused-store-is-reported-as-no-workspace-by-every-command-but-the-listing.md`.)
 */
export function answerUnderHeldRefusal(outcome: CommandOutcome, w: { readonly workspaceId: string | undefined }, held: StoreRefusal | undefined): CommandOutcome {
  if (outcome.ok || !NO_WORKSPACE_CODES.has(outcome.code) || w.workspaceId !== undefined || held === undefined) return outcome;
  return { ok: false, code: held.code, headline: held.headline, ...(held.detail === undefined ? {} : { detail: held.detail }) };
}
