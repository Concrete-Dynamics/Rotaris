import type { CommandOutcome, Notice, NoticeSeverity } from '@rotaris/contracts';
import { isStrictlyNewer } from '@rotaris/release-naming';
import { millis, type Millis, type TimerHandle, type Timers } from '@rotaris/kernel';
import type { AppLogLevel } from '../app-log.js';
import type { NoticePatch, NoticeStore } from '../notices.js';
import type { Classification } from './classify.js';
import { measuredLabel, messageOf, type DownloadProgress } from './download.js';
import { FEED_ACCEPT, FEED_ENDPOINT, FEED_TIMEOUT_MS, parseLatestRelease, selectOffer, SUMMARY_FALLBACK, type Offer } from './feed.js';
import { runInstall, type StagingArea, type UpdateNetwork } from './install.js';
import { cleanupPortableBackup, type StrategyFiles, type StrategySpawn } from './strategies.js';

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
 *  - REQ-STARTUP-115: the portable's leftover `<name>.old` is deleted before the network round trip.
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
 *  - REQ-STARTUP-111: nothing here reads a configuration value, a preference other than the dismissed version, or an
 *    environment variable; the endpoint is `feed.ts`'s constant. There is no way in to turn the check off.
 */

/** REQ-STARTUP-116's title and action label. */
export const offerTitle = (version: string): string => `Rotaris ${version} is available`;
export const UPDATE_NOW = 'Update now';
/** REQ-STARTUP-118's title and message; REQ-SHELL-118's accessible description while the action is disabled. */
export const downloadingTitle = (version: string): string => `Downloading Rotaris ${version}`;
export const downloadingMessage = (measured: string): string => `${measured} — verifying against the published checksum when it finishes.`;
export const DOWNLOAD_IN_PROGRESS = 'The download is in progress; the same download cannot be started twice.';
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

export type UpdaterNotices = Pick<NoticeStore, 'report' | 'update' | 'current'>;

export interface UpdaterDeps {
  /** Decided once per process (REQ-STARTUP-106): stable across launches, no user input. */
  readonly classification: Classification;
  /** REQ-STARTUP-007's running version, `dev` when the metadata declares none. */
  readonly runningVersion: string;
  readonly network: UpdateNetwork;
  readonly staging: StagingArea;
  readonly files: StrategyFiles;
  readonly spawn: StrategySpawn;
  /** The key set to verify against; production passes nothing and gets the compiled-in set (`keys.ts`). */
  readonly keys?: readonly string[];
  /** `updates/dismissedVersion` — REQ-STARTUP-146's key, main's alone. */
  readonly dismissedVersion: { read(): string | undefined; write(version: string): Promise<void> };
  readonly notices: UpdaterNotices;
  readonly log: (level: AppLogLevel, message: string) => void;
  readonly timers: Timers;
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

export type ActivationOutcome = 'not-updatable' | 'demo' | 'refused' | 'failed' | 'none' | 'dismissed' | 'already-offered' | 'already-applied' | 'offered';

export type UpdaterState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'offered'; readonly offer: Offer; readonly noticeId: number }
  | { readonly kind: 'failed'; readonly offer: Offer; readonly noticeId: number }
  | { readonly kind: 'applied'; readonly offer: Offer; readonly noticeId: number }
  | { readonly kind: 'handed-off'; readonly offer: Offer; readonly noticeId: number };

export interface Updater {
  /** REQ-STARTUP-114: once per window activation, after the window is visible. */
  activate(input: { readonly windowId: number; readonly demo?: boolean }): Promise<ActivationOutcome>;
  /** `Update now` and `Try again` (REQ-STARTUP-116, REQ-STARTUP-120): REQ-STARTUP-122's sequence with the held offer. */
  install(): Promise<CommandOutcome>;
  /** `Restart now` (REQ-STARTUP-121): the hand-over to the updated installation. */
  restart(): Promise<CommandOutcome>;
  /** REQ-STARTUP-116/117: called by main BEFORE a notice is cleared; records the version only when that notice is the offer. */
  noticeDismissed(noticeId: number): Promise<void>;
  /** REQ-STARTUP-046 / REQ-SHELL-121: wait at most `bound` for in-flight work, then abandon a download and its partial file. */
  quiesce(bound: Millis): Promise<void>;
  inFlight(): boolean;
  state(): UpdaterState;
}

/** The whole face of the notice at one moment; `action: null` is no action. */
interface Face {
  readonly severity: NoticeSeverity;
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly persistent: boolean;
  readonly action: Notice['action'] | null;
}

const offerFace = (offer: Offer): Face => ({
  severity: 'info', title: offerTitle(offer.version), message: offer.summary !== '' ? offer.summary : SUMMARY_FALLBACK, detail: '', persistent: true,
  action: { label: UPDATE_NOW, action: { kind: 'install-update' } },
});
const downloadingFace = (version: string, measured: string): Face => ({
  severity: 'info', title: downloadingTitle(version), message: downloadingMessage(measured), detail: '', persistent: false,
  action: { label: UPDATE_NOW, action: { kind: 'install-update' }, disabled: DOWNLOAD_IN_PROGRESS },
});
const installedFace = (message: string): Face => ({
  severity: 'success', title: INSTALLED_TITLE, message, detail: '', persistent: true,
  action: { label: RESTART_NOW, action: { kind: 'restart' } },
});
const handedOffFace = (message: string): Face => ({ severity: 'success', title: FINISH_TITLE, message, detail: '', persistent: true, action: null });
const failureFace = (sentence: string): Face => ({
  severity: 'error', title: NOT_INSTALLED_TITLE, message: NOT_INSTALLED_MESSAGE, detail: sentence, persistent: true,
  action: { label: TRY_AGAIN, action: { kind: 'install-update' } },
});

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

  /** REQ-STARTUP-114: the one operation in flight. */
  const guard = <T>(work: () => Promise<T>): Promise<T> => {
    const promise = work();
    const settled = promise.then(() => undefined, () => undefined);
    busy = settled;
    void settled.then(() => { if (busy === settled) busy = null; abort = null; });
    return promise;
  };

  /** REQ-SHELL-118: in place while the notice is still current; a fresh publication when something replaced it. */
  const show = async (noticeId: number | null, face: Face): Promise<number> => {
    const patch: NoticePatch = { severity: face.severity, title: face.title, message: face.message, detail: face.detail, persistent: face.persistent, action: face.action };
    if (noticeId !== null && await deps.notices.update(noticeId, patch)) return noticeId;
    const published = await deps.notices.report({
      severity: face.severity, title: face.title, message: face.message, detail: face.detail, persistent: face.persistent,
      ...(face.action === null ? {} : { action: face.action }),
    });
    return published.id;
  };

  const silently = (reason: string): 'failed' => {
    // REQ-STARTUP-110 / PD-MONITOR-002: every check failure is one internal line at `info`, and no user-facing path.
    deps.log('info', `update check failed silently: ${reason} (REQ-STARTUP-110)`);
    return 'failed';
  };

  const check = async (windowId: number, updatable: Extract<Classification, { updatable: true }>): Promise<ActivationOutcome> => {
    // REQ-STARTUP-115's cleanup is LAUNCH-time: once per process, before the first round trip. Run again at a later
    // window's check it would delete the backup this process's own apply made moments earlier, which is not "left by
    // a previous update" — the previous update is the one a later launch finds.
    const cleaned = cleanedThisLaunch ? 'nothing' : await cleanupPortableBackup(updatable.flavour, updatable.target, deps.files);
    cleanedThisLaunch = true;
    if (cleaned !== 'nothing') deps.log('info', `update check: the previous update's backup beside the artifact was ${cleaned === 'removed' ? 'removed' : 'left for a later launch'} (REQ-STARTUP-115)`);
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
    const noticeId = await show(null, offerFace(offer));
    state = { kind: 'offered', offer, noticeId };
    deps.log('info', `update check: Rotaris ${offer.version} is available (${offer.asset.name}); offered on notice #${noticeId} (REQ-STARTUP-116)`);
    return 'offered';
  };

  const doInstall = async (offer: Offer, startingNoticeId: number, updatable: Extract<Classification, { updatable: true }>, click: ClickAnswer): Promise<CommandOutcome> => {
    abort = new AbortController();
    let measured = measuredLabel({ bytesSoFar: 0, claimedTotal: offer.asset.size });
    let noticeId = await show(startingNoticeId, downloadingFace(offer.version, measured));
    let repaint: Promise<unknown> = Promise.resolve();
    const onProgress = (p: DownloadProgress): void => {
      const next = measuredLabel(p);
      if (next === measured) return;
      measured = next;
      // Repainted only when the whole number changes, into the same notice by identity (REQ-STARTUP-118, REQ-SHELL-118).
      repaint = repaint.then(() => deps.notices.update(noticeId, { message: downloadingMessage(next) }));
    };
    deps.log('info', `update install: Rotaris ${offer.version} (${offer.asset.name}) — REQ-STARTUP-122's sequence begins`);
    const result = await runInstall(offer, {
      flavour: updatable.flavour, target: updatable.target, network: deps.network, staging: deps.staging, files: deps.files, spawn: deps.spawn,
      onProgress, signal: abort.signal, ...(deps.keys === undefined ? {} : { keys: deps.keys }),
      // OQ-86: the installer's hand-off closes the windows, and the download ran for as long as it took — a run begun
      // meanwhile is asked about here, immediately before the installer is started.
      ...(updatable.flavour === 'installer' ? { beforeApply: () => confirmAtHandOff('install', click, true) } : {}),
    });
    await repaint;
    if (!result.ok && result.stage === 'declined') {
      // Declining keeps the update offered: the offer's face comes back in the same notice, and nothing was started.
      noticeId = await show(noticeId, offerFace(offer));
      state = { kind: 'offered', offer, noticeId };
      return UPDATE_DECLINED;
    }
    if (!result.ok) {
      deps.log('warn', `update install: ${result.stage} step failed — ${result.sentence} (REQ-STARTUP-120)`);
      noticeId = await show(noticeId, failureFace(result.sentence));
      state = { kind: 'failed', offer, noticeId };
      return { ok: false, code: `update.${result.stage}`, headline: NOT_INSTALLED_TITLE, detail: result.sentence };
    }
    if (result.applied.outcome === 'replaced') {
      noticeId = await show(noticeId, installedFace(result.applied.message));
      state = { kind: 'applied', offer, noticeId };
      deps.log('info', `update install: Rotaris ${offer.version} replaced ${updatable.target}; Restart now is offered (REQ-STARTUP-119)`);
      return { ok: true, value: { outcome: 'replaced' } };
    }
    noticeId = await show(noticeId, handedOffFace(result.applied.message));
    state = { kind: 'handed-off', offer, noticeId };
    deps.log('info', `update install: handed off to ${result.applied.quitRequired ? 'the installer; the window closes after the single 1200 ms delay' : 'the platform'} (REQ-STARTUP-119)`);
    if (result.applied.quitRequired && autoClose === null) {
      autoClose = deps.timers.after(millis(INSTALLER_AUTO_CLOSE_MS), () => { deps.closeWindows(); });
    }
    return { ok: true, value: { outcome: 'handed-off', quitRequired: result.applied.quitRequired } };
  };

  const doRestart = async (offer: Offer, noticeId: number, target: string, click: ClickAnswer): Promise<CommandOutcome> => {
    // OQ-86: re-read immediately before the successor starts; a run past what the click's answer covered is asked about.
    if (!await confirmAtHandOff('restart', click, false)) return UPDATE_DECLINED;
    deps.log('info', `update restart: starting the updated Rotaris at ${target} as the successor (REQ-STARTUP-121)`);
    try {
      await deps.startSuccessor(target);
    } catch (cause) {
      // REQ-STARTUP-121: when the successor cannot be started, nothing closes, and the failure surfaces through the
      // `Update not installed` notice of REQ-STARTUP-120.
      const sentence = `could not start the updated Rotaris at ${target}: ${messageOf(cause)}`;
      deps.log('error', `update restart: ${sentence}; this instance keeps the record and its window (REQ-STARTUP-121)`);
      const id = await show(noticeId, failureFace(sentence));
      state = { kind: 'failed', offer, noticeId: id };
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

  /** OQ-86, at the click: no run active asks nothing; otherwise the answer, or `null` when the user returned. */
  const confirmAtClick = async (action: 'install' | 'restart'): Promise<ClickAnswer | null> => {
    const activeRuns = await readActiveRuns(action);
    if (activeRuns === 0) return { asked: false };
    return await ask({ action, activeRuns, moment: 'click' }) ? { asked: true, activeRuns } : null;
  };

  /** OQ-86, immediately before the installer or the successor starts: true to go on. */
  const confirmAtHandOff = async (action: 'install' | 'restart', click: ClickAnswer, downloadedSince: boolean): Promise<boolean> => {
    const activeRuns = await readActiveRuns(action);
    if (!mustAskAtHandOff(click, activeRuns, downloadedSince)) return true;
    deps.log('info', `update ${action}: ${activeRuns === null ? 'the run count is unknown' : `${activeRuns} run${activeRuns === 1 ? ' is' : 's are'} active`} at the hand-off, which the click's answer did not cover; the confirmation is asked again (REQ-STARTUP-046, OQ-86)`);
    return ask({ action, activeRuns, moment: 'hand-off' });
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
        return null;
      };
      const before = refused();
      if (before !== null) return before;
      if (!classification.updatable) return { ok: false, code: 'update.notUpdatable', headline: 'This build cannot update itself' };
      const updatable = classification;
      // The confirmation is part of the one operation in flight (REQ-STARTUP-114), so a second click while its box is
      // open is refused rather than asking twice.
      return guard(async () => {
        // OQ-86 (REQ-STARTUP-046): only the installer's hand-off closes the windows (REQ-STARTUP-119), so only it asks —
        // at the click, before anything is downloaded, and again before the installer starts (`beforeApply`); the
        // portable's in-place apply closes nothing.
        const click = updatable.flavour === 'installer' ? await confirmAtClick('install') : NOTHING_ASKED;
        if (click === null) return UPDATE_DECLINED;
        if (state.kind !== 'offered' && state.kind !== 'failed') return { ok: false, code: 'update.none', headline: 'No update is offered' };
        const { offer, noticeId } = state;
        return doInstall(offer, noticeId, updatable, click);
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
        // OQ-86 (REQ-STARTUP-046, REQ-STARTUP-121): the restart always closes the windows, so it asks first, at the
        // click, and `doRestart` re-reads the count immediately before the successor starts.
        const click = await confirmAtClick('restart');
        if (click === null) return UPDATE_DECLINED;
        if (state.kind !== 'applied') return { ok: false, code: 'update.notApplied', headline: 'No installed update to restart into' };
        const { offer, noticeId } = state;
        return doRestart(offer, noticeId, target, click);
      });
    },
    async noticeDismissed(noticeId) {
      if (state.kind !== 'offered' && state.kind !== 'failed') return;
      if (state.noticeId !== noticeId || deps.notices.current()?.id !== noticeId) return;
      const { version } = state.offer;
      try {
        await deps.dismissedVersion.write(version);
        deps.log('info', `update offer dismissed: Rotaris ${version} is remembered as waved off (REQ-STARTUP-117)`);
      } catch (cause) {
        deps.log('warn', `update offer dismissed, but the waved-off version ${version} could not be remembered: ${messageOf(cause)}`);
      }
      state = { kind: 'idle' };
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
  };
}
