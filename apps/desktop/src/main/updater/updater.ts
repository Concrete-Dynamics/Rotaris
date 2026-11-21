import { UPDATE_STATE_NONE, type CommandOutcome, type Notice, type NoticeSeverity, type UpdateState } from '@rotaris/contracts';
import { isStrictlyNewer } from '@rotaris/release-naming';
import { millis, toIsoUtc, type Millis, type TimerHandle, type Timers, type WallClock } from '@rotaris/kernel';
import type { AppLogLevel } from '../app-log.js';
import type { NoticePatch, NoticeStore } from '../notices.js';
import type { Classification } from './classify.js';
import { measuredLabel, messageOf, type DownloadProgress } from './download.js';
import type { ConnectionCost } from './metered.js';
import { FEED_ACCEPT, FEED_ENDPOINT, FEED_TIMEOUT_MS, parseLatestRelease, selectOffer, SUMMARY_FALLBACK, type Offer } from './feed.js';
import { removeHandedOffStaging, runInstall, type HandOffRecordFile, type UpdateNetwork } from './install.js';
import { discardPending, loadPending, settleAtLaunch, yieldToFeed, type LaunchSettlement, type UpdatesArea } from './pending.js';
import type { StrategyFiles, StrategySpawn } from './strategies.js';

/**
 * THE UPDATER — the main-process module ADR-0054 decided and first-release-plan.md §4.6 ruled into the first
 * release (O-10). It holds the one offer, the one notice the offer lives in, and the one operation in flight; every
 * step that touches the network, the disk, a process or the clock arrives through a port, so the whole of it runs in
 * `updater.test.ts` with fakes and a controlled clock.
 *
 * What it does, by requirement:
 *  - REQ-STARTUP-114 / REQ-STARTUP-043: one check per window activation, only after the window is shown (main calls
 *    `activate` from `MainWindows`' post-show hook); one operation — check or install — in flight at a time, a second
 *    refused. REQ-STARTUP-106/150: a build classified not updatable performs no check and issues no request; the one
 *    line it writes is the application log's. REQ-STARTUP-057: a demo window, the same.
 *  - REQ-STARTUP-171/176/178, REQ-STARTUP-115 (PD-STARTUP-008, R-117): a verified download is kept as the pending update
 *    under `<data>/updates/` (`pending.ts`). The first check of a launch, before the network round trip, settles what the
 *    update path left: a pending update the running version has reached is removed with its files, and the portable's or
 *    AppImage's `<name>.old` with it — the replaced artifact has now painted; partials and superseded downloads go
 *    (`settleAtLaunch`). A release the feed names older than the pending one discards it (UD-5, `yieldToFeed`).
 *  - REQ-STARTUP-105/107..110/112: the feed request, the offer rule, the silent failure, the summary (`feed.ts`).
 *  - REQ-STARTUP-116/117/146: the offer notice; `updates/dismissedVersion`, written only when THAT notice is dismissed
 *    and read at every check; the same version stays silent, any newer version notifies again.
 *  - REQ-STARTUP-118/124, REQ-SHELL-118: the download reported into the same notice by identity — `Downloading
 *    Rotaris {version}`, the measured share, the action disabled with its accessible description — repainted only when
 *    the whole number changes.
 *  - REQ-STARTUP-119/120/121: `Update installed` with `Restart now`; `Finish the update` with no action and the single
 *    1200 ms auto-close where the hand-off requires quitting; `Update not installed` with the sentence as detail and
 *    `Try again`, which re-runs the install with the held offer; the restart as a hand-over through the instance record.
 *  - REQ-STARTUP-046 / REQ-SHELL-121: a close waits at most the bound for in-flight update work, then abandons a
 *    download and its partial file.
 *  - REQ-SHELL-119 guard (1) / REQ-SHELL-124 (OQ-311, ruled 2026-10-14 under R-072): `Restart now`, and `Update now` /
 *    `Try again` on the installer flavour, are user-initiated closes. Each asks the unsaved-settings guard of every open
 *    main window (`confirmUnsaved`) at the click, ahead of OQ-86's active-run confirmation, and again immediately before
 *    the installer or the successor starts; a Cancel, or a Save that fails, starts nothing. The portable's in-place apply
 *    and the installer's 1,200 ms auto-close are programmatic and ask nothing.
 *  - REQ-SHELL-119 guard (2) / REQ-NOTIFY-056 (OQ-361, ruled 2026-10-20 under R-072): the same user-initiated closes ask
 *    whether a worktree integration is running anywhere in the instance (`integrationAllows`), after the unsaved-settings
 *    guard and before the run box, at the click and again at the hand-off; one running, or a record that cannot be read,
 *    starts nothing. The portable's apply and the auto-close ask nothing (REQ-NOTIFY-057).
 *  - REQ-STARTUP-169/170, PD-STARTUP-008 revision 3, PD-SHELL-005 revision 3 (R-117, the plan's Stage 2): on a flavour that
 *    replaces its artifact in place (the portable and the AppImage, UD-8) the check starts the download itself — unless the
 *    connection is metered (UD-1), the version is waved off, a pending update of it or a newer one exists (UD-5), or a cancel
 *    or a silent transport failure holds it for this process (UD-2, UD-4); each of those leaves REQ-STARTUP-116's offer. The
 *    download notice is persistent, its Dismiss only hides it (UD-3), and its one action cancels (`cancel`, not an operation of
 *    REQ-STARTUP-114: the transfer ends within 2 s and leaves nothing). Verified, the artifact is replaced at once and the
 *    notice becomes `Update installed` (OQ-553). The installer flavour keeps the click flow until its next-start apply is
 *    built (the plan's Stage 3/PR-3): its offer is still `Update now`.
 *  - OQ-554 (PD-STARTUP-008 item 14, PD-SHELL-005 "When the notice changes"): every later transition changes the update
 *    notice in place while it is the current notice; where it is not, only a failure the record shows is published (replacing
 *    what holds the slot), and the offer a cancel leaves only into an empty slot. Otherwise nothing is published and the
 *    title-bar indicator (PD-SHELL-018) carries the state, which `publishState` emits before the notice changes.
 *  - UD-4, OQ-555: a transport failure of a download the user did not start is silent (the offer in place, else nothing); a
 *    refusal on authenticity or integrity is `Update not installed` with no action, never retried for that release by this
 *    process (REQ-STARTUP-179).
 *  - UD-7: the first check of a launch that finds the pending update applied — this build is the version it installed — puts
 *    one `Updated to Rotaris {version}` acknowledgement in the window that asked.
 *  - REQ-STARTUP-111: nothing here reads a configuration value, a preference other than the dismissed version, or an
 *    environment variable; the endpoint is `feed.ts`'s constant. There is no way in to turn the check off.
 */

/** REQ-STARTUP-116's title and action label. */
export const offerTitle = (version: string): string => `Rotaris ${version} is available`;
export const UPDATE_NOW = 'Update now';
/** REQ-STARTUP-118's title and message (PD-SHELL-005). */
export const downloadingTitle = (version: string): string => `Downloading Rotaris ${version}`;
export const downloadingMessage = (measured: string): string => `${measured} — verifying against the published checksum when it finishes.`;
/** REQ-STARTUP-119's two titles and the restart action's label; REQ-STARTUP-121 offers it on `Update installed` alone. */
export const INSTALLED_TITLE = 'Update installed';
export const RESTART_NOW = 'Restart now';
export const FINISH_TITLE = 'Finish the update';
/** REQ-STARTUP-119: the installer hand-off's single auto-close delay. */
export const INSTALLER_AUTO_CLOSE_MS = 1_200;
/** REQ-STARTUP-120's title, message and action label. */
export const NOT_INSTALLED_TITLE = 'Update not installed';
export const NOT_INSTALLED_MESSAGE = 'Rotaris is unchanged. You can try again or download the release manually.';
export const TRY_AGAIN = 'Try again';
/** PD-STARTUP-008 item 15 (OQ-555): an authenticity or integrity refusal's message — REQ-STARTUP-120's without "try again or". */
export const REFUSED_MESSAGE = 'Rotaris is unchanged. You can download the release manually.';
/** PD-SHELL-005 revision 2's cancel, labelled by the notice-banner brief §6 row 2. */
export const CANCEL_DOWNLOAD = 'Cancel download';
/** PD-STARTUP-008 item 13 (OQ-553): the in-place ready notice's message, under REQ-STARTUP-119's `Update installed`. */
export const installedInPlaceMessage = (version: string): string => `Rotaris ${version} has been downloaded, verified and installed. It runs the next time Rotaris starts, or now with Restart now.`;
/** UD-7 (PD-SHELL-018 "The acknowledgement"): the one transient the first window of an updated version shows. */
export const updatedToTitle = (version: string): string => `Updated to Rotaris ${version}`;
/** REQ-STARTUP-170: a cancel ends the transfer within this bound of its activation. */
export const CANCEL_BOUND_MS = 2_000;
/** UD-8: the flavours whose target is replaced while the application runs, and so the ones whose download starts by itself. */
export const IN_PLACE_FLAVOURS: readonly string[] = Object.freeze(['portable', 'appimage']);

export type UpdaterNotices = Pick<NoticeStore, 'report' | 'update' | 'current' | 'acknowledge'>;

export interface UpdaterDeps {
  /** Decided once per process (REQ-STARTUP-106): stable across launches, no user input. */
  readonly classification: Classification;
  /** REQ-STARTUP-007's running version, `dev` when the metadata declares none. */
  readonly runningVersion: string;
  readonly network: UpdateNetwork;
  /** REQ-STARTUP-171: `<data>/updates`, where the download is streamed and the pending update kept; main's alone. */
  readonly updates: UpdatesArea;
  readonly files: StrategyFiles;
  readonly spawn: StrategySpawn;
  /** REQ-STARTUP-178: the installer hand-off record an earlier build wrote, honoured so its directory is removed. */
  readonly handOffRecord: HandOffRecordFile;
  /** The key set to verify against; production passes nothing and gets the compiled-in set (`keys.ts`). */
  readonly keys?: readonly string[];
  /** `updates/dismissedVersion` — REQ-STARTUP-146's key, main's alone. */
  readonly dismissedVersion: { read(): string | undefined; write(version: string): Promise<void> };
  readonly notices: UpdaterNotices;
  /**
   * UD-1 (REQ-STARTUP-169): whether the platform reports the connection as metered, asked once per check that finds a
   * release to download. `unknown`, and an answer that cannot be had, are not metered.
   */
  readonly connectionCost: () => Promise<ConnectionCost>;
  /**
   * PD-SHELL-018 (channel 17, `update:state`): the phase the title-bar indicator draws, emitted on every transition —
   * before the notice changes for it, so the two never disagree in a painted frame (OQ-554) — and on every repaint of
   * `{measured}`. Main sends it to every main window.
   */
  readonly publishState: (state: UpdateState) => void;
  readonly log: (level: AppLogLevel, message: string) => void;
  readonly timers: Timers;
  /** The pending record's `verifiedAt` (REQ-STARTUP-171). */
  readonly wall: WallClock;
  /**
   * REQ-STARTUP-121: start the updated installation from `target` as the successor and resolve once the instance record
   * has passed to it; reject when it cannot be started. No timeout of its own (ADR-0055): a successor that never
   * signals leaves this instance holding the record with its window open.
   */
  readonly startSuccessor: (target: string) => Promise<void>;
  /** Close every window; the quit follows through main's ordinary path. */
  readonly closeWindows: () => void;
  /**
   * REQ-STARTUP-046's "a run is active", instance-wide since every window closes (OQ-86): the run host's count, `null`
   * when it cannot be read — which the updater treats as a run being active.
   */
  readonly activeRuns: () => Promise<number | null>;
  /**
   * REQ-STARTUP-046's active-run confirmation (OQ-86, ruled 2026-10-06 by R-071): resolves true when the user chose to
   * close anyway, false when they returned to the window. The updater asks it only when a run is active (or the count
   * cannot be read): at the click of `Restart now`, and of `Update now` / `Try again` on the installer flavour (the hand-off
   * that closes the windows, REQ-STARTUP-119), and again at the hand-off — immediately before the installer or the
   * successor is started — for a run the click's answer did not cover (`mustAskAtHandOff`). A confirmation that cannot be
   * asked is read as the returning answer.
   */
  readonly confirmClose: (ask: CloseAsk) => Promise<boolean>;
  /**
   * REQ-SHELL-119 guard (1), REQ-SHELL-124 (OQ-311, ruled 2026-10-14 under R-072): ask REQ-SHELL-124's Save/Discard/Cancel of
   * every open main window, one window at a time; resolves true when every window allowed (clean, saved or discarded),
   * false at the first Cancel or failed Save. Asked at the click of `Restart now`, and of `Update now` / `Try again` on the
   * installer flavour, BEFORE OQ-86's active-run confirmation (REQ-SHELL-119's order), and again at the hand-off,
   * immediately before the installer or the successor starts. A guard that cannot be asked declines. Never asked by the
   * portable's in-place apply, which closes nothing, nor by the installer's auto-close, which is programmatic.
   */
  readonly confirmUnsaved: (ask: UnsavedAsk) => Promise<boolean>;
  /**
   * REQ-SHELL-119 guard (2) / REQ-NOTIFY-056 (OQ-361, ruled 2026-10-20 under R-072): resolves true when main records no
   * worktree integration running anywhere in the instance — instance-wide, since every window closes — and false when one
   * runs (main has shown "Integration in progress") or the record cannot be read. Asked at the click of `Restart now`, and of
   * `Update now` / `Try again` on the installer flavour, AFTER `confirmUnsaved` and BEFORE OQ-86's run box, and again at the
   * hand-off in the same place. A dependency that throws declines. Never asked by the portable's in-place apply nor by the
   * installer's auto-close (REQ-NOTIFY-057).
   */
  readonly integrationAllows: (ask: IntegrationAsk) => Promise<boolean>;
}

/** One asking of the unsaved-settings guard (OQ-311): which action, and whether it is the click's or the hand-off's. */
export interface UnsavedAsk {
  readonly action: 'install' | 'restart';
  readonly moment: 'click' | 'hand-off';
}

/** One asking of REQ-SHELL-119's guard (2) at an update's close (OQ-361): which action, and which moment. */
export interface IntegrationAsk {
  readonly action: 'install' | 'restart';
  readonly moment: 'click' | 'hand-off';
}

/** One asking of OQ-86's confirmation: which action, the count read just before it, and whether it is the click's. */
export interface CloseAsk {
  readonly action: 'install' | 'restart';
  readonly activeRuns: number | null;
  readonly moment: 'click' | 'hand-off';
}

/** What the click's confirmation covered: nothing asked (no run was active), or the runs it was asked about. */
export type ClickAnswer = { readonly asked: false } | { readonly asked: true; readonly activeRuns: number | null };

/**
 * OQ-86 (ruled 2026-10-06 by R-071, "so a run is never ended without warning"): whether the hand-off — immediately before
 * the installer or the successor is started — must ask again, given the click's answer, the count read now, and whether a
 * download ran in between. The count carries no identity, so after a download (minutes, during which the window accepts
 * input) any run active now may have begun after the answer and is asked about again; with nothing in between but the
 * click's own message box (`Restart now`), the answer covers the runs it was asked about, and only a run past that count,
 * or one where the click asked nothing, is asked about. A count that cannot be read is a run active.
 */
export function mustAskAtHandOff(click: ClickAnswer, now: number | null, downloadedSince: boolean): boolean {
  if (now === 0) return false;
  if (downloadedSince || !click.asked) return true;
  if (click.activeRuns === null || now === null) return false;
  return now > click.activeRuns;
}

/**
 * REQ-STARTUP-046's confirmation at an update action's click (OQ-86): its text conveys exactly the three things the
 * requirement names — a run is still executing, closing ends it, and the alternative is to return and let it finish —
 * and the returning answer is the first, the default and Escape's.
 */
export const RETURN_TO_WINDOW = 'Return to the window';
export const updateCloseMessage = (activeRuns: number | null): string => (activeRuns !== null && activeRuns > 1 ? `${activeRuns} runs are still executing.` : 'A run is still executing.');
export const updateCloseDetail = (action: 'install' | 'restart', moment: 'click' | 'hand-off' = 'click'): string =>
  action === 'install' && moment === 'hand-off'
    ? 'The update is downloaded and verified. Installing it closes every Rotaris window, which ends the run. Return to the window to let it finish; the update stays offered.'
    : `${action === 'install' ? 'Installing the update' : 'Restarting into the update'} closes every Rotaris window, which ends the run. Return to the window to let it finish, and ${action === 'install' ? 'update' : 'restart'} afterwards.`;
export const closeAnywayLabel = (action: 'install' | 'restart'): string => (action === 'install' ? 'Close and install the update' : 'Close and restart');

/**
 * The message box main shows for one `CloseAsk` (OQ-86): two answers, the returning one first, the default, and what
 * Escape and the box's close control give (`cancelId`, REQ-SHELL-055). Shaped as Electron's `MessageBoxOptions`; the
 * answer `1` is "close anyway".
 */
export function updateCloseBox(ask: CloseAsk): { type: 'warning'; title: string; message: string; detail: string; buttons: string[]; defaultId: 0; cancelId: 0; noLink: true } {
  return {
    type: 'warning', title: 'A run is still executing', message: updateCloseMessage(ask.activeRuns), detail: updateCloseDetail(ask.action, ask.moment),
    buttons: [RETURN_TO_WINDOW, closeAnywayLabel(ask.action)], defaultId: 0, cancelId: 0, noLink: true,
  };
}

/** OQ-86: what the click covered when it asked nothing — the portable's apply, or no run active. */
const NOTHING_ASKED: ClickAnswer = { asked: false };

/** OQ-86's ruling: the user returned to the window from the active-run confirmation; nothing was started. */
export const UPDATE_DECLINED = { ok: true, value: { cancelled: true, reason: 'a run is active and the user returned to the window (REQ-STARTUP-046)' } } as const satisfies CommandOutcome;

/**
 * OQ-311's ruling (2026-10-14, R-072): a main window's unsaved-settings guard answered Cancel, or its Save failed, at the
 * click or at the hand-off; nothing was started and the notice is as it was (at the installer's hand-off, the verified
 * download is discarded and the offer comes back in the same notice, the declined path OQ-86 built).
 */
export const UPDATE_DECLINED_UNSAVED = { ok: true, value: { cancelled: true, reason: 'a window\'s unsaved settings were neither saved nor discarded, so nothing was started (REQ-SHELL-124, OQ-311)' } } as const satisfies CommandOutcome;

/**
 * OQ-361's ruling (2026-10-20, R-072): REQ-SHELL-119 guard (2) and REQ-NOTIFY-056 at the click or at the hand-off — main
 * records a worktree integration running, or could not read its record; nothing was started and the notice is as it was
 * (at the installer's hand-off, the verified download is discarded and the offer comes back in the same notice).
 */
export const UPDATE_DECLINED_INTEGRATION = { ok: true, value: { cancelled: true, reason: 'a worktree integration is running, or its state could not be read, so nothing was started (REQ-SHELL-119 guard (2), REQ-NOTIFY-056, OQ-361)' } } as const satisfies CommandOutcome;

/** What the hand-off's guards answered: `null` to go on, or the declined outcome of the guard that stopped it. */
type HandOffDecline = typeof UPDATE_DECLINED | typeof UPDATE_DECLINED_UNSAVED | typeof UPDATE_DECLINED_INTEGRATION;

/**
 * `downloaded`: the check started the download itself and it ended verified and applied in place; `download-ended`: it
 * started and ended otherwise (a cancel, a failure shown or silent); `withheld`: a release this process refused on
 * authenticity or integrity, never retried by it (REQ-STARTUP-179); `pending-waits`: a pending update of that version or a
 * newer one exists, so nothing is downloaded (REQ-STARTUP-169).
 */
export type ActivationOutcome = 'not-updatable' | 'demo' | 'refused' | 'failed' | 'none' | 'dismissed' | 'already-offered' | 'already-applied' | 'offered' | 'downloaded' | 'download-ended' | 'withheld' | 'pending-waits';

export type UpdaterState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'offered'; readonly offer: Offer; readonly noticeId: number | null }
  /** REQ-STARTUP-169/170: a download runs — the transfer and the verification. `userStarted`: by `Update now` or `Try again`. */
  | { readonly kind: 'downloading'; readonly offer: Offer; readonly noticeId: number | null; readonly measured: string; readonly userStarted: boolean }
  | { readonly kind: 'failed'; readonly offer: Offer; readonly noticeId: number | null }
  | { readonly kind: 'applied'; readonly offer: Offer; readonly noticeId: number | null }
  | { readonly kind: 'handed-off'; readonly offer: Offer; readonly noticeId: number | null };

export interface Updater {
  /** REQ-STARTUP-114: once per window activation, after the window is visible. */
  activate(input: { readonly windowId: number; readonly demo?: boolean }): Promise<ActivationOutcome>;
  /** `Update now` and `Try again` (REQ-STARTUP-116, REQ-STARTUP-120): REQ-STARTUP-122's sequence with the held offer. */
  install(): Promise<CommandOutcome>;
  /** `Restart now` (REQ-STARTUP-121): the hand-over to the updated installation. */
  restart(): Promise<CommandOutcome>;
  /**
   * REQ-STARTUP-170, PD-STARTUP-008 item 1 and UD-2: cancel the running download — never refused while one runs, never an
   * operation of REQ-STARTUP-114. Resolves once the transfer has ended, or after REQ-STARTUP-170's 2 s bound.
   */
  cancel(): Promise<CommandOutcome>;
  /** REQ-STARTUP-116/117: called by main BEFORE a notice is cleared; records the version only when that notice is the offer (UD-3). */
  noticeDismissed(noticeId: number): Promise<void>;
  /** Channel 17's payload as it stands, for `update.state` (a window that mounts later). */
  updateState(): UpdateState;
  /** REQ-STARTUP-046 / REQ-SHELL-121: wait at most `bound` for in-flight work, then abandon a download and its partial file. */
  quiesce(bound: Millis): Promise<void>;
  inFlight(): boolean;
  state(): UpdaterState;
}

/** The whole face of the notice at one moment; `action: null` is no action, `progress: null` no meter. */
export interface Face {
  readonly severity: NoticeSeverity;
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly persistent: boolean;
  readonly action: Notice['action'] | null;
  readonly progress: number | null;
}

/** REQ-NOTIFY-043: the meter's whole percent, only where the feed states the size (REQ-STARTUP-118's `{N} MB` form has none). */
export const progressOf = (p: DownloadProgress): number | null => (p.claimedTotal > 0 ? Math.min(100, Math.floor((p.bytesSoFar * 100) / p.claimedTotal)) : null);

/**
 * The update notice's faces, by the notice-banner brief §6 (R-117). Exported for the driver's verification-only face seam
 * (`face-seam.ts`), which publishes exactly these, never a copy of their words.
 */
export const UPDATE_FACES = Object.freeze({
  /** Row 1: the offer — metered (UD-1), after a cancel (UD-2), after a silent transport failure (OQ-552), the installer's click flow. */
  offer: (offer: Pick<Offer, 'version' | 'summary'>): Face => ({
    severity: 'info', title: offerTitle(offer.version), message: offer.summary !== '' ? offer.summary : SUMMARY_FALLBACK, detail: '', persistent: true,
    action: { label: UPDATE_NOW, action: { kind: 'install-update' } }, progress: null,
  }),
  /** Row 2: downloading — persistent, its Dismiss only hiding it (UD-3, OQ-552), its one action the cancel (PD-SHELL-005 rev. 2). */
  downloading: (version: string, measured: string, progress: number | null): Face => ({
    severity: 'info', title: downloadingTitle(version), message: downloadingMessage(measured), detail: '', persistent: true,
    action: { label: CANCEL_DOWNLOAD, action: { kind: 'cancel-update' } }, progress,
  }),
  /** Row 3′: ready, replaced in place (UD-8, OQ-553). */
  installedInPlace: (version: string): Face => ({
    severity: 'success', title: INSTALLED_TITLE, message: installedInPlaceMessage(version), detail: '', persistent: true,
    action: { label: RESTART_NOW, action: { kind: 'restart' } }, progress: null,
  }),
  /** The installer's click-flow hand-off (REQ-STARTUP-119), kept until its next-start apply is built. */
  handedOff: (message: string): Face => ({ severity: 'success', title: FINISH_TITLE, message, detail: '', persistent: true, action: null, progress: null }),
  /** Row 4: a failure the user can retry — a download the user started, `Restart now`, a disk or apply failure (REQ-STARTUP-120). */
  failure: (sentence: string): Face => ({
    severity: 'error', title: NOT_INSTALLED_TITLE, message: NOT_INSTALLED_MESSAGE, detail: sentence, persistent: true,
    action: { label: TRY_AGAIN, action: { kind: 'install-update' } }, progress: null,
  }),
  /** Row 4′: a refusal on authenticity or integrity — no action, never retried for that release by this process (OQ-555). */
  refused: (sentence: string): Face => ({ severity: 'error', title: NOT_INSTALLED_TITLE, message: REFUSED_MESSAGE, detail: sentence, persistent: true, action: null, progress: null }),
});

/**
 * OQ-554's three ways a transition reaches the banner: `in-place` changes the update notice only while it is current and
 * publishes nothing otherwise; `publish` replaces whatever holds the slot (a first publication, a failure the record shows);
 * `into-empty-slot` publishes only where no notice holds the slot (the offer a cancel leaves).
 */
export type Publication = 'in-place' | 'publish' | 'into-empty-slot';

/** The feed's body read whole; a body past 1 MiB is not a release payload. */
async function readText(body: AsyncIterable<Uint8Array>): Promise<string> {
  const parts: Uint8Array[] = [];
  let total = 0;
  for await (const piece of body) {
    total += piece.byteLength;
    if (total > 1_048_576) throw new Error('the body exceeds 1 MiB');
    parts.push(piece);
  }
  return Buffer.concat(parts, total).toString('utf8');
}

export function createUpdater(deps: UpdaterDeps): Updater {
  const classification = deps.classification;
  let state: UpdaterState = { kind: 'idle' };
  let busy: Promise<void> | null = null;
  let abort: AbortController | null = null;
  /** REQ-STARTUP-115: the launch-time cleanup has run in this process. */
  let cleanedThisLaunch = false;
  /** REQ-STARTUP-119: the hand-off's auto-close is armed once and never re-armed. */
  let autoClose: TimerHandle | null = null;
  /**
   * UD-2 and UD-4 (PD-STARTUP-008): versions no download starts for on its own again in this process — cancelled, or whose
   * background download failed on its transport. The next launch downloads them again; nothing is recorded.
   */
  const held = new Set<string>();
  /** REQ-STARTUP-179, OQ-555: versions refused on authenticity or integrity, never retried for that release by this process. */
  const refusedReleases = new Set<string>();
  /** REQ-STARTUP-170: the running download's end, and whether a cancel asked for it. */
  let downloadEnded: Promise<void> | null = null;
  let cancelAsked = false;

  /** Channel 17's payload for the state as it stands (PD-SHELL-018). */
  const stateOf = (): UpdateState => {
    if (state.kind === 'downloading') return { phase: 'downloading', version: state.offer.version, measured: state.measured, noticeId: state.noticeId };
    if (state.kind === 'applied') return { phase: 'ready', version: state.offer.version, inPlace: true, noticeId: state.noticeId };
    return state.kind === 'idle' ? UPDATE_STATE_NONE : { phase: 'none', noticeId: state.noticeId };
  };
  /** Set the state and emit it — before the notice changes for the same transition (OQ-554, the title-bar brief §3.1). */
  const enter = (next: UpdaterState): void => {
    state = next;
    deps.publishState(stateOf());
  };

  /** REQ-STARTUP-114: the one operation in flight. */
  const guard = <T>(work: () => Promise<T>): Promise<T> => {
    const promise = work();
    const settled = promise.then(() => undefined, () => undefined);
    busy = settled;
    void settled.then(() => { if (busy === settled) busy = null; abort = null; });
    return promise;
  };

  /**
   * REQ-SHELL-118: in place while the update notice is still current. Where it is not, OQ-554's rule decides (`Publication`):
   * a fresh publication, one only into an empty slot, or nothing. Answers the identifier the update notice now has — the
   * one handed in when nothing was published, so the retained identifier (REQ-NOTIFY-217) survives a transition that showed
   * nothing.
   */
  const show = async (noticeId: number | null, face: Face, publication: Publication): Promise<number | null> => {
    const patch: NoticePatch = { severity: face.severity, title: face.title, message: face.message, detail: face.detail, persistent: face.persistent, action: face.action, progress: face.progress };
    if (noticeId !== null && await deps.notices.update(noticeId, patch)) return noticeId;
    if (publication === 'in-place') return noticeId;
    if (publication === 'into-empty-slot' && deps.notices.current() !== null) return noticeId;
    const published = await deps.notices.report({
      severity: face.severity, title: face.title, message: face.message, detail: face.detail, persistent: face.persistent,
      ...(face.action === null ? {} : { action: face.action }),
      ...(face.progress === null ? {} : { progress: face.progress }),
    });
    return published.id;
  };

  const silently = (reason: string): 'failed' => {
    // REQ-STARTUP-110 / PD-MONITOR-002: every check failure is one internal line at `info`, and no user-facing path.
    deps.log('info', `update check failed silently: ${reason} (REQ-STARTUP-110)`);
    return 'failed';
  };

  /** One `info` line per thing the launch-time step did; nothing when it found nothing (PD-MONITOR-002). */
  const logSettlement = (settled: LaunchSettlement): void => {
    if (settled.readAsAbsent !== null) deps.log('info', `update check: the pending update record read as none (${settled.readAsAbsent}); it and its files were removed (REQ-STARTUP-171)`);
    if (settled.discarded !== null) {
      const { version, why, outcome } = settled.discarded;
      const reason = why === 'applied' ? `Rotaris ${deps.runningVersion} runs, so it was applied` : why === 'other-installation' ? 'it was downloaded for another installation flavour or platform' : 'its apply attempts are spent (UD-9)';
      deps.log('info', `update check: the pending update ${version} was ${outcome === 'removed' ? 'removed' : 'left in part for a later launch'} — ${reason} (REQ-STARTUP-178)`);
    }
    if (settled.backup !== 'nothing') deps.log('info', `update check: the previous update's backup beside the artifact was ${settled.backup === 'removed' ? 'removed' : 'left for a later launch'} (REQ-STARTUP-115, REQ-STARTUP-176)`);
    if (settled.incoming !== 'nothing') deps.log('info', `update check: an interrupted replacement's file beside the artifact was ${settled.incoming === 'removed' ? 'removed' : 'left for a later launch'} (REQ-STARTUP-178)`);
    if (settled.swept.length > 0) deps.log('info', `update check: removed what no pending update names under the updates directory: ${settled.swept.join(', ')} (REQ-STARTUP-178)`);
    if (settled.pending !== null) deps.log('info', `update check: a pending update ${settled.pending.version} (${settled.pending.state}) is kept (REQ-STARTUP-171)`);
  };

  const check = async (windowId: number, updatable: Extract<Classification, { updatable: true }>): Promise<ActivationOutcome> => {
    // REQ-STARTUP-176/178 and REQ-STARTUP-115 are LAUNCH-time: once per process, before the first round trip, after the
    // first main window was shown. Run again at a later window's check it would find this process's own replacement —
    // its `<name>.old`, its pending files — which belong to the launch that runs the replaced artifact.
    if (!cleanedThisLaunch) {
      cleanedThisLaunch = true;
      const settled = await settleAtLaunch(deps.updates, deps.files, updatable, deps.runningVersion);
      logSettlement(settled);
      // UD-7 (PD-SHELL-018 "The acknowledgement"): this launch runs the version the pending update installed — the first main
      // window of the updated version, which this first check of the launch belongs to, says so once, transiently.
      if (settled.discarded?.why === 'applied') {
        deps.notices.acknowledge('ok', updatedToTitle(deps.runningVersion));
        deps.log('info', `update check: this launch runs the updated Rotaris ${deps.runningVersion}; window ${windowId} shows the acknowledgement once (UD-7)`);
      }
      // An earlier build's installer hand-off record, honoured on the same terms (REQ-STARTUP-178).
      const handedOff = await removeHandedOffStaging(deps.handOffRecord, deps.updates, deps.runningVersion);
      if (handedOff !== 'nothing') {
        const what = handedOff === 'removed' ? 'removed' : handedOff === 'kept' ? 'left for a later launch' : handedOff === 'not-yet' ? 'kept: the version it installs is not running yet' : 'not readable, and the record was cleared';
        deps.log('info', `update check: an earlier build's installer hand-off staging directory was ${what} (REQ-STARTUP-178)`);
      }
    }
    abort = new AbortController();
    deps.log('info', `update check: window ${windowId}, ${updatable.flavour} flavour, GET ${FEED_ENDPOINT} (REQ-STARTUP-105)`);
    let body: string;
    try {
      const response = await deps.network.get(FEED_ENDPOINT, { accept: FEED_ACCEPT, timeoutMs: FEED_TIMEOUT_MS, signal: abort.signal });
      if (response.status !== 200) return silently(`HTTP ${response.status}`);
      body = await readText(response.body);
    } catch (cause) {
      return silently(messageOf(cause));
    }
    const parsed = parseLatestRelease(body);
    if (!parsed.ok) return silently(parsed.reason);
    // UD-5: a release the feed names older than the pending update — withdrawn — discards it. A newer one is downloaded
    // and replaces it once verified (`runInstall`).
    let pending = (await loadPending(deps.updates)).record;
    if (pending !== null && yieldToFeed(pending, parsed.release.version) === 'withdrawn') {
      const outcome = await discardPending(deps.updates, pending.version);
      deps.log('info', `update check: the pending update ${pending.version} is newer than the latest release ${parsed.release.version}, which the feed now names; it was ${outcome === 'removed' ? 'discarded' : 'discarded in part, the rest left for a later launch'} (UD-5, REQ-STARTUP-178)`);
      pending = null;
    }
    const offer = selectOffer(parsed.release, deps.runningVersion, updatable.flavour);
    if (offer === null) {
      deps.log('info', `update check: nothing to offer (latest ${parsed.release.version}, running ${deps.runningVersion}, ${updatable.flavour} flavour; REQ-STARTUP-107)`);
      return 'none';
    }
    if (deps.dismissedVersion.read() === offer.version) {
      deps.log('info', `update check: Rotaris ${offer.version} was waved off earlier; the offer is silently ignored (REQ-STARTUP-116)`);
      return 'dismissed';
    }
    if ((state.kind === 'applied' || state.kind === 'handed-off') && !isStrictlyNewer(offer.version, state.offer.version)) {
      // The running version is still the old one until the restart, so the feed offers again what is already
      // installed. `Update installed` keeps `Restart now` and `Finish the update` stays as it is (REQ-STARTUP-119,
      // REQ-STARTUP-121); re-offering would drop the restart and let a second apply overwrite the backup of the
      // version the user is running.
      deps.log('info', `update check: Rotaris ${state.offer.version} is already ${state.kind === 'applied' ? 'installed and waits for Restart now' : 'handed off'}; Rotaris ${offer.version} is not offered again (REQ-STARTUP-119)`);
      return 'already-applied';
    }
    if ((state.kind === 'offered' || state.kind === 'failed') && state.offer.version === offer.version && deps.notices.current()?.id === state.noticeId) {
      deps.log('info', `update check: Rotaris ${offer.version} is already offered on notice #${state.noticeId}`);
      return 'already-offered';
    }
    if (refusedReleases.has(offer.version)) {
      deps.log('info', `update check: Rotaris ${offer.version} was refused on authenticity or integrity earlier in this process; it is not offered or downloaded again until the next launch (REQ-STARTUP-179)`);
      return 'withheld';
    }
    // REQ-STARTUP-169: no pending update of that version or a newer one — the yield of UD-5 having discarded an older-named one.
    if (pending !== null && !isStrictlyNewer(offer.version, pending.version)) {
      deps.log('info', `update check: a pending update ${pending.version} (${pending.state}) is kept and Rotaris ${offer.version} is not downloaded (REQ-STARTUP-169, UD-5)`);
      return 'pending-waits';
    }
    const why = await automaticDownloadWithheld(offer, updatable);
    if (why !== null) {
      const noticeId = await show(null, UPDATE_FACES.offer(offer), 'publish');
      enter({ kind: 'offered', offer, noticeId });
      deps.log('info', `update check: Rotaris ${offer.version} is available (${offer.asset.name}); ${why}; offered with Update now on notice #${noticeId} (REQ-STARTUP-116)`);
      return 'offered';
    }
    deps.log('info', `update check: Rotaris ${offer.version} is available (${offer.asset.name}); downloading it with no click (REQ-STARTUP-169)`);
    const outcome = await doInstall(offer, null, updatable, NOTHING_ASKED, false);
    return outcome.ok && (outcome.value as { outcome?: string } | undefined)?.outcome === 'replaced' ? 'downloaded' : 'download-ended';
  };

  /**
   * REQ-STARTUP-169's conditions beyond the waved-off version and the pending update, each answered with the reason the
   * offer is shown instead, or null to download: the flavour replaces in place (UD-8; the installer keeps the click flow
   * until its next-start apply exists), no cancel or silent failure holds the version (UD-2, UD-4), and the connection is
   * not metered (UD-1 — `unknown`, or no answer, is not).
   */
  const automaticDownloadWithheld = async (offer: Offer, updatable: Extract<Classification, { updatable: true }>): Promise<string | null> => {
    if (!IN_PLACE_FLAVOURS.includes(updatable.flavour)) return `the ${updatable.flavour} flavour keeps the click flow until its next-start apply is built (PD-STARTUP-008; the plan's Stage 3)`;
    if (held.has(offer.version)) return 'its download was cancelled, or failed on its transport, earlier in this process, so it does not start on its own again until the next launch (UD-2, UD-4)';
    const cost = await deps.connectionCost().catch((cause: unknown) => {
      deps.log('info', `update check: the connection's cost could not be read (${messageOf(cause)}); it is treated as not metered (UD-1)`);
      return 'unknown' as const;
    });
    if (cost === 'metered') return 'the platform reports the connection as metered, so the download does not start on its own (UD-1)';
    return null;
  };

  /**
   * REQ-STARTUP-122's sequence with the held offer: the download — started by the check itself (REQ-STARTUP-169) or by
   * `Update now` / `Try again` (`userStarted`) — then, verified, the apply of the flavour. Every transition goes through
   * `enter` (channel 17 first) and `show` under OQ-554's rule.
   */
  const doInstall = async (offer: Offer, startingNoticeId: number | null, updatable: Extract<Classification, { updatable: true }>, click: ClickAnswer, userStarted: boolean): Promise<CommandOutcome> => {
    abort = new AbortController();
    cancelAsked = false;
    let finish: () => void = () => undefined;
    downloadEnded = new Promise<void>((resolve) => { finish = resolve; });
    try {
      return await downloadAndApply(offer, startingNoticeId, updatable, click, userStarted);
    } finally {
      downloadEnded = null;
      finish();
    }
  };

  const downloadAndApply = async (offer: Offer, startingNoticeId: number | null, updatable: Extract<Classification, { updatable: true }>, click: ClickAnswer, userStarted: boolean): Promise<CommandOutcome> => {
    const signal = abort!.signal;
    const first: DownloadProgress = { bytesSoFar: 0, claimedTotal: offer.asset.size };
    let measured = measuredLabel(first);
    // The download's first face is a publication — the check found the release, or the user asked for it (§4.1's first row).
    enter({ kind: 'downloading', offer, noticeId: startingNoticeId, measured, userStarted });
    let noticeId = await show(startingNoticeId, UPDATE_FACES.downloading(offer.version, measured, progressOf(first)), 'publish');
    enter({ kind: 'downloading', offer, noticeId, measured, userStarted });
    let repaint: Promise<unknown> = Promise.resolve();
    const onProgress = (p: DownloadProgress): void => {
      const next = measuredLabel(p);
      if (next === measured) return;
      measured = next;
      // Repainted only when the whole number changes, into the same notice by identity and only while it is current
      // (REQ-STARTUP-118, REQ-SHELL-118, OQ-554): the indicator's figure first, then the notice's.
      if (state.kind === 'downloading') enter({ ...state, measured: next });
      const id = noticeId;
      if (id !== null) repaint = repaint.then(() => deps.notices.update(id, { message: downloadingMessage(next), progress: progressOf(p) }));
    };
    deps.log('info', `update install: Rotaris ${offer.version} (${offer.asset.name}) — REQ-STARTUP-122's sequence begins${userStarted ? '' : ' on its own (REQ-STARTUP-169)'}`);
    let declinedBy: HandOffDecline = UPDATE_DECLINED;
    const result = await runInstall(offer, {
      flavour: updatable.flavour, target: updatable.target, network: deps.network, updates: deps.updates, files: deps.files, spawn: deps.spawn,
      onProgress, signal, ...(deps.keys === undefined ? {} : { keys: deps.keys }),
      runningVersion: deps.runningVersion, now: () => toIsoUtc(deps.wall.instant()),
      // OQ-86: the installer's hand-off closes the windows, and the download ran for as long as it took — a run begun
      // meanwhile is asked about here, immediately before the installer is started. OQ-311: so is a window's unsaved
      // settings, first, since a window may have become dirty while the download ran; OQ-361: then guard (2), since an
      // integration may have been admitted meanwhile.
      ...(updatable.flavour === 'installer'
        ? { beforeApply: async () => { const declined = await confirmAtHandOff('install', click, true); if (declined !== null) declinedBy = declined; return declined === null; } }
        : {}),
    });
    await repaint;
    if (!result.ok && result.stage === 'declined') {
      // Declining keeps the update offered: the offer's face comes back in the same notice, and nothing was started.
      enter({ kind: 'offered', offer, noticeId });
      noticeId = await show(noticeId, UPDATE_FACES.offer(offer), 'into-empty-slot');
      if (noticeId !== null) enter({ kind: 'offered', offer, noticeId });
      return declinedBy;
    }
    if (!result.ok && result.kind === 'abandoned') {
      if (cancelAsked) {
        // REQ-STARTUP-170, UD-2: not a failure. The notice becomes the offer — in place, else into an empty slot, else not
        // at all (OQ-554 (c)) — and the version is held for this process; nothing is recorded.
        held.add(offer.version);
        enter({ kind: 'offered', offer, noticeId });
        const shown = await show(noticeId, UPDATE_FACES.offer(offer), 'into-empty-slot');
        if (shown !== null) enter({ kind: 'offered', offer, noticeId: shown });
        deps.log('info', `update download: Rotaris ${offer.version} cancelled; every byte it wrote was removed and nothing was recorded; ${shown !== null && deps.notices.current()?.id === shown ? `the offer stands on notice #${shown}` : 'another notice holds the banner, so the offer is not shown'}, and no download of it starts on its own again in this process (REQ-STARTUP-170, UD-2, OQ-554)`);
        return { ok: true, value: { outcome: 'cancelled' } };
      }
      // The quit's bound ended it (REQ-STARTUP-175, REQ-SHELL-121): nothing to show, the next launch downloads again.
      enter({ kind: 'idle' });
      deps.log('info', `update download: Rotaris ${offer.version} abandoned — ${result.sentence}; the next launch downloads it again (REQ-STARTUP-175)`);
      return { ok: false, code: 'update.download', headline: 'The update download was abandoned', detail: result.sentence };
    }
    if (!result.ok && result.kind === 'transport' && !userStarted) {
      // UD-4 (OQ-552 (3)): a transport failure of a download the user did not start is not shown. While the update notice
      // is current it becomes the offer in place; otherwise nothing is published. Either way the indicator leaves, the
      // version is held for this process, and the next launch downloads it again.
      held.add(offer.version);
      enter({ kind: 'offered', offer, noticeId });
      await show(noticeId, UPDATE_FACES.offer(offer), 'in-place');
      deps.log('warn', `update download: Rotaris ${offer.version} failed on its transport — ${result.sentence}; not shown (UD-4); the next launch downloads it again`);
      return { ok: false, code: `update.${result.stage}`, headline: NOT_INSTALLED_TITLE, detail: result.sentence };
    }
    if (!result.ok) {
      // A failure the record shows publishes, replacing whatever holds the slot (OQ-554 (b)). A refusal on authenticity or
      // integrity carries no action and is never retried for that release by this process (REQ-STARTUP-179, OQ-555).
      const refusal = result.kind === 'refusal';
      if (refusal) refusedReleases.add(offer.version);
      deps.log('warn', `update install: ${result.stage} step failed — ${result.sentence} (REQ-STARTUP-120${refusal ? ', REQ-STARTUP-179: not retried for this release by this process' : ''})`);
      enter({ kind: 'failed', offer, noticeId });
      noticeId = await show(noticeId, refusal ? UPDATE_FACES.refused(result.sentence) : UPDATE_FACES.failure(result.sentence), 'publish');
      enter({ kind: 'failed', offer, noticeId });
      return { ok: false, code: `update.${result.stage}`, headline: NOT_INSTALLED_TITLE, detail: result.sentence };
    }
    if (result.applied.outcome === 'replaced') {
      // UD-8, OQ-553: replaced in place on verification — the ready state, in place only (OQ-554); where the update notice is
      // not current the indicator alone carries it, with `Restart now`.
      enter({ kind: 'applied', offer, noticeId });
      noticeId = await show(noticeId, UPDATE_FACES.installedInPlace(offer.version), 'in-place');
      enter({ kind: 'applied', offer, noticeId });
      deps.log('info', `update install: Rotaris ${offer.version} replaced ${updatable.target}; the pending update is ${result.pending.state} and its backup kept until the replaced artifact paints; Restart now is offered${deps.notices.current()?.id === noticeId ? ` on notice #${noticeId}` : ' by the title-bar indicator alone, the update notice not being current'} (REQ-STARTUP-119, REQ-STARTUP-176, OQ-553, OQ-554)`);
      return { ok: true, value: { outcome: 'replaced' } };
    }
    enter({ kind: 'handed-off', offer, noticeId });
    noticeId = await show(noticeId, UPDATE_FACES.handedOff(result.applied.message), 'publish');
    enter({ kind: 'handed-off', offer, noticeId });
    deps.log('info', `update install: handed off to ${result.applied.quitRequired ? 'the installer; the window closes after the single 1200 ms delay' : 'the platform'}; it runs from the pending update, ${result.pending.state}, which the updated build's first launch removes (REQ-STARTUP-119, REQ-STARTUP-178)`);
    if (result.applied.quitRequired && autoClose === null) {
      // OQ-311, OQ-361: all three guards (unsaved settings, guard (2)'s integration, the run box) were asked immediately
      // before the installer started; the auto-close is programmatic and asks nothing (REQ-NOTIFY-057).
      autoClose = deps.timers.after(millis(INSTALLER_AUTO_CLOSE_MS), () => { deps.closeWindows(); });
    }
    return { ok: true, value: { outcome: 'handed-off', quitRequired: result.applied.quitRequired } };
  };

  const doRestart = async (offer: Offer, noticeId: number | null, target: string, click: ClickAnswer): Promise<CommandOutcome> => {
    // OQ-311, OQ-361 then OQ-86, immediately before the successor starts: every window's unsaved settings are asked again,
    // then whether an integration runs, and the count re-read; a run past what the click's answer covered is asked about.
    const declined = await confirmAtHandOff('restart', click, false);
    if (declined !== null) return declined;
    deps.log('info', `update restart: starting the updated Rotaris at ${target} as the successor (REQ-STARTUP-121)`);
    try {
      await deps.startSuccessor(target);
    } catch (cause) {
      // REQ-STARTUP-121: when the successor cannot be started, nothing closes, and the failure surfaces through the
      // `Update not installed` notice of REQ-STARTUP-120.
      const sentence = `could not start the updated Rotaris at ${target}: ${messageOf(cause)}`;
      deps.log('error', `update restart: ${sentence}; this instance keeps the record and its window (REQ-STARTUP-121)`);
      // REQ-STARTUP-179: a failed `Restart now` is always visible — it publishes, replacing what holds the slot (OQ-554 (b)).
      enter({ kind: 'failed', offer, noticeId });
      const id = await show(noticeId, UPDATE_FACES.failure(sentence), 'publish');
      enter({ kind: 'failed', offer, noticeId: id });
      return { ok: false, code: 'update.restart', headline: NOT_INSTALLED_TITLE, detail: sentence };
    }
    deps.log('info', 'update restart: the record passed to the successor; this instance closes its windows and exits (REQ-STARTUP-121)');
    deps.closeWindows();
    return { ok: true, value: { outcome: 'handed-over' } };
  };

  /** OQ-86: the run host's count, `null` (a run active, for the asking) when it cannot be read. */
  const readActiveRuns = async (action: 'install' | 'restart'): Promise<number | null> =>
    deps.activeRuns().catch((cause: unknown) => {
      deps.log('warn', `update ${action}: the active-run count could not be read (${messageOf(cause)}); the confirmation is asked (REQ-STARTUP-046)`);
      return null;
    });

  /** OQ-86: REQ-STARTUP-046's confirmation itself; a failure to ask declines. */
  const ask = async (closeAsk: CloseAsk): Promise<boolean> => {
    const { action, moment } = closeAsk;
    const proceed = await deps.confirmClose(closeAsk).catch((cause: unknown) => {
      deps.log('warn', `update ${action}: the active-run confirmation could not be asked (${messageOf(cause)}); nothing is started (REQ-STARTUP-046)`);
      return false;
    });
    if (!proceed) deps.log('info', `update ${action}: a run is active and the user returned to the window at the ${moment}; nothing is started and the update stays offered (REQ-STARTUP-046, OQ-86)`);
    return proceed;
  };

  /**
   * OQ-311, at the click and again at the hand-off, always before OQ-86's run box (REQ-SHELL-119's order): true when every
   * main window allowed. A guard that cannot be asked declines, as the run box's `ask` does.
   */
  const askUnsaved = async (action: 'install' | 'restart', moment: 'click' | 'hand-off'): Promise<boolean> => {
    const proceed = await deps.confirmUnsaved({ action, moment }).catch((cause: unknown) => {
      deps.log('warn', `update ${action}: the unsaved-settings guard could not be asked at the ${moment} (${messageOf(cause)}); nothing is started (REQ-SHELL-124, OQ-311)`);
      return false;
    });
    if (!proceed) deps.log('info', `update ${action}: a window's unsaved settings were not saved or discarded at the ${moment}; nothing is started and the notice stays as it was (REQ-SHELL-124, OQ-311)`);
    return proceed;
  };

  /**
   * OQ-361, at the click and again at the hand-off, after the unsaved-settings guard and before OQ-86's run box: true when
   * no worktree integration runs in the instance. A dependency that throws declines, as `askUnsaved` does.
   */
  const askIntegration = async (action: 'install' | 'restart', moment: 'click' | 'hand-off'): Promise<boolean> => {
    let proceed: boolean;
    try {
      proceed = await deps.integrationAllows({ action, moment });
    } catch (cause) {
      deps.log('warn', `update ${action}: guard (2) could not be asked at the ${moment} (${messageOf(cause)}); nothing is started (REQ-SHELL-119 (2), REQ-NOTIFY-056, OQ-361)`);
      return false;
    }
    if (!proceed) deps.log('info', `update ${action}: a worktree integration is running at the ${moment}; nothing is started and the notice stays as it was (REQ-SHELL-119 (2), REQ-NOTIFY-056, OQ-361)`);
    return proceed;
  };

  /** OQ-86, at the click: no run active asks nothing; otherwise the answer, or `null` when the user returned. */
  const confirmAtClick = async (action: 'install' | 'restart'): Promise<ClickAnswer | null> => {
    const activeRuns = await readActiveRuns(action);
    if (activeRuns === 0) return { asked: false };
    return await ask({ action, activeRuns, moment: 'click' }) ? { asked: true, activeRuns } : null;
  };

  /**
   * Immediately before the installer or the successor starts: OQ-311's unsaved-settings guard first, then OQ-361's guard
   * (2), then OQ-86's run count re-read. `null` to go on, or the declined outcome of the guard that stopped it.
   */
  const confirmAtHandOff = async (action: 'install' | 'restart', click: ClickAnswer, downloadedSince: boolean): Promise<HandOffDecline | null> => {
    if (!await askUnsaved(action, 'hand-off')) return UPDATE_DECLINED_UNSAVED;
    if (!await askIntegration(action, 'hand-off')) return UPDATE_DECLINED_INTEGRATION;
    const activeRuns = await readActiveRuns(action);
    if (!mustAskAtHandOff(click, activeRuns, downloadedSince)) return null;
    deps.log('info', `update ${action}: ${activeRuns === null ? 'the run count is unknown' : `${activeRuns} run${activeRuns === 1 ? ' is' : 's are'} active`} at the hand-off, which the click's answer did not cover; the confirmation is asked again (REQ-STARTUP-046, OQ-86)`);
    return await ask({ action, activeRuns, moment: 'hand-off' }) ? null : UPDATE_DECLINED;
  };

  const busyRefusal = (): CommandOutcome => ({ ok: false, code: 'update.busy', headline: 'An update operation is already in flight', detail: 'Only one update check or install runs at a time (REQ-STARTUP-114).' });

  return {
    async activate({ windowId, demo }) {
      if (demo) {
        deps.log('info', `update check: window ${windowId} is a demo window; no request is made (REQ-STARTUP-057, REQ-STARTUP-114)`);
        return 'demo';
      }
      if (!classification.updatable) {
        deps.log('info', `update check: this build is not updatable — ${classification.reason}; no request is made (REQ-STARTUP-106)`);
        return 'not-updatable';
      }
      if (busy !== null) {
        deps.log('info', `update check: window ${windowId} refused — another update operation is in flight (REQ-STARTUP-114)`);
        return 'refused';
      }
      const updatable = classification;
      return guard(() => check(windowId, updatable));
    },
    async install() {
      const refused = (): CommandOutcome | null => {
        if (!classification.updatable) return { ok: false, code: 'update.notUpdatable', headline: 'This build cannot update itself', detail: classification.reason };
        if (busy !== null) return busyRefusal();
        if (state.kind !== 'offered' && state.kind !== 'failed') return { ok: false, code: 'update.none', headline: 'No update is offered', detail: 'Nothing is held to install; the next check offers a newer release when there is one.' };
        if (refusedReleases.has(state.offer.version)) return { ok: false, code: 'update.refused', headline: 'This release was refused', detail: `Rotaris ${state.offer.version} failed its authenticity or integrity check, and is not retried by this process (REQ-STARTUP-179).` };
        return null;
      };
      const before = refused();
      if (before !== null) return before;
      if (!classification.updatable) return { ok: false, code: 'update.notUpdatable', headline: 'This build cannot update itself' };
      const updatable = classification;
      // The confirmation is part of the one operation in flight (REQ-STARTUP-114), so a second click while its box is
      // open is refused rather than asking twice.
      return guard(async () => {
        // OQ-86 (REQ-STARTUP-046), OQ-311 (REQ-SHELL-124) and OQ-361 (REQ-SHELL-119 guard (2), REQ-NOTIFY-056): only the
        // installer's hand-off closes the windows (REQ-STARTUP-119), so only it asks — the unsaved-settings guard of every
        // window, then whether an integration runs, then the run box — at the click, before anything is downloaded, and
        // again before the installer starts (`beforeApply`); the portable's in-place apply closes nothing and asks nothing.
        if (updatable.flavour === 'installer' && !await askUnsaved('install', 'click')) return UPDATE_DECLINED_UNSAVED;
        if (updatable.flavour === 'installer' && !await askIntegration('install', 'click')) return UPDATE_DECLINED_INTEGRATION;
        const click = updatable.flavour === 'installer' ? await confirmAtClick('install') : NOTHING_ASKED;
        if (click === null) return UPDATE_DECLINED;
        if (state.kind !== 'offered' && state.kind !== 'failed') return { ok: false, code: 'update.none', headline: 'No update is offered' };
        const { offer, noticeId } = state;
        return doInstall(offer, noticeId, updatable, click, true);
      });
    },
    async restart() {
      const refused = (): CommandOutcome | null => {
        if (busy !== null) return busyRefusal();
        if (state.kind !== 'applied' || !classification.updatable) return { ok: false, code: 'update.notApplied', headline: 'No installed update to restart into', detail: 'Restart now is offered on the Update installed notice alone (REQ-STARTUP-121).' };
        return null;
      };
      const before = refused();
      if (before !== null) return before;
      if (!classification.updatable) return { ok: false, code: 'update.notApplied', headline: 'No installed update to restart into' };
      const { target } = classification;
      return guard(async () => {
        // OQ-311 (REQ-SHELL-119 guard (1), REQ-SHELL-124), OQ-361 (guard (2), REQ-NOTIFY-056) then OQ-86 (REQ-STARTUP-046,
        // REQ-STARTUP-121): the restart always closes the windows, so it asks first, at the click — every window's unsaved
        // settings, then whether an integration runs, then the run box — and `doRestart` asks all three again immediately
        // before the successor starts.
        if (!await askUnsaved('restart', 'click')) return UPDATE_DECLINED_UNSAVED;
        if (!await askIntegration('restart', 'click')) return UPDATE_DECLINED_INTEGRATION;
        const click = await confirmAtClick('restart');
        if (click === null) return UPDATE_DECLINED;
        if (state.kind !== 'applied') return { ok: false, code: 'update.notApplied', headline: 'No installed update to restart into' };
        const { offer, noticeId } = state;
        return doRestart(offer, noticeId, target, click);
      });
    },
    async cancel() {
      if (state.kind !== 'downloading' || downloadEnded === null) {
        deps.log('info', 'update cancel: no update download is running; nothing to cancel (REQ-STARTUP-170)');
        return { ok: true, value: { cancelled: false, reason: 'no update download is running' } };
      }
      const { version } = state.offer;
      const ended = downloadEnded;
      if (!cancelAsked) {
        cancelAsked = true;
        deps.log('info', `update cancel: the download of Rotaris ${version} is ended at the user's request (REQ-STARTUP-170, UD-2)`);
        abort?.abort();
      }
      // REQ-STARTUP-170: the transfer ends within 2 s of the activation; the answer waits for it, never longer than that.
      const handle: { current: TimerHandle | null } = { current: null };
      const elapsed = new Promise<'elapsed'>((resolve) => { handle.current = deps.timers.after(millis(CANCEL_BOUND_MS), () => resolve('elapsed')); });
      const outcome = await Promise.race([ended.then(() => 'ended' as const), elapsed]);
      handle.current?.cancel();
      if (outcome === 'elapsed') deps.log('warn', `update cancel: the download of Rotaris ${version} had not ended ${CANCEL_BOUND_MS} ms after the cancel (REQ-STARTUP-170)`);
      return { ok: true, value: { cancelled: true, ended: outcome === 'ended' } };
    },
    async noticeDismissed(noticeId) {
      if (state.kind === 'idle' || state.noticeId !== noticeId || deps.notices.current()?.id !== noticeId) return;
      if (state.kind !== 'offered') {
        // UD-3 (OQ-552): dismissing the download notice, the ready notice or a failure only hides it — the download runs on,
        // the pending update stays and its apply follows, and no version is recorded. The indicator carries the state.
        deps.log('info', `update notice #${noticeId} dismissed in its ${state.kind} face: hidden only, nothing recorded (UD-3)`);
        return;
      }
      const { version } = state.offer;
      try {
        await deps.dismissedVersion.write(version);
        deps.log('info', `update offer dismissed: Rotaris ${version} is remembered as waved off (REQ-STARTUP-117)`);
      } catch (cause) {
        deps.log('warn', `update offer dismissed, but the waved-off version ${version} could not be remembered: ${messageOf(cause)}`);
      }
      enter({ kind: 'idle' });
    },
    async quiesce(bound) {
      if (busy === null) return;
      const handle: { current: TimerHandle | null } = { current: null };
      const elapsed = new Promise<'elapsed'>((resolve) => { handle.current = deps.timers.after(bound, () => resolve('elapsed')); });
      const outcome = await Promise.race([busy.then(() => 'done' as const), elapsed]);
      handle.current?.cancel();
      if (outcome === 'elapsed' && busy !== null) {
        deps.log('warn', `quit: the update operation in flight did not finish within ${bound} ms; a download in flight is abandoned and its partial file discarded (REQ-STARTUP-046, REQ-SHELL-121)`);
        abort?.abort();
      }
    },
    inFlight: () => busy !== null,
    state: () => state,
    updateState: () => stateOf(),
  };
}
