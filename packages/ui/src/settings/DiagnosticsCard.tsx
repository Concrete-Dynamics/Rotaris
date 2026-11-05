import { useState, type KeyboardEvent } from 'react';
import { DIAGNOSTICS_LEVELS, type DiagnosticsCardState, type DiagnosticsLevel } from '@rotaris/contracts';
import { Button as DesignButton, Input as DesignInput, Select as DesignSelect } from '../design-system/index.js';

/**
 * REQ-SHELL-163: Settings › About's diagnostics card, the one place diagnostics capture is reached (REQ-STARTUP-129). Three
 * controls, each keyboard-reachable and named: the capture level ("Diagnostics capture"), offering exactly `off`, `light`
 * and `deep` and showing `off` where nothing is stored; the output folder ("Diagnostics output folder"), the folder in force
 * as selectable text which, activated, opens the platform folder chooser main shows; and the open of this window's run
 * directory, enabled only while this window has one. Since the level offers only the three and the folder comes from the
 * chooser, no invalid selection is reachable and nothing here refuses one. The card says in words that a change reaches
 * windows opened afterwards and leaves this window's capture as it is, and (PD-STARTUP-011) what a run directory's log
 * holds: this application's log for every open window, folder paths and error messages included, and no conversation, model
 * output or file contents. Every window has a folder in force — a window with no workspace, or whose workspace's own folder
 * could not be written when it was built, has the per-user default — so the folder field always shows one, and where the
 * per-user folder was taken in place of the workspace's own the card says so and names the cause (PD-STARTUP-011
 * revision 2).
 *
 * The About page has no design material (`docs/design/README.md` §3.2); the card is drawn with the page's own vocabulary —
 * its section heading, the value text, the secondary hint, the design system's select, field and secondary button.
 */

type Outcome = { ok: true } | { ok: false; reason: string };

export interface DiagnosticsCardProps {
  /** The card's state for this window, or null until main has answered. */
  readonly state: DiagnosticsCardState | null;
  readonly onLevel: (level: DiagnosticsLevel) => Promise<Outcome>;
  readonly onChooseFolder: () => Promise<Outcome>;
  readonly onOpenRunDirectory: () => Promise<Outcome>;
}

/** The words for each level, the value stored being the level itself. */
export const DIAGNOSTICS_LEVEL_LABELS: Readonly<Record<DiagnosticsLevel, string>> = { off: 'Off', light: 'Light', deep: 'Deep' };

/** REQ-SHELL-163: "the card SHALL say so in words". */
export const DIAGNOSTICS_TAKES_EFFECT = 'A change to either choice applies to windows opened from now on. The capture running in this window, if any, carries on as it started.';

/**
 * PD-STARTUP-011's three sentences on what a run directory holds, said in words on the card: whose log, what it includes,
 * and what it never holds (REQ-STARTUP-134).
 */
export const DIAGNOSTICS_LOG_SCOPE = "A run directory holds this application's log for every open window, not only this one.";
export const DIAGNOSTICS_LOG_INCLUDES = 'The log includes folder paths and error messages.';
export const DIAGNOSTICS_LOG_EXCLUDES = 'It holds no conversation, model output or file contents.';

/**
 * PD-STARTUP-011 revision 2: where this window took the per-user folder in place of its workspace's own, the sentence saying
 * so in words with the cause; empty otherwise. Where the per-user folder could not be created either, the capture is
 * inactive and nothing goes there, so the sentence says the per-user folder was tried, and the capture's sentence carries
 * that base's own cause.
 */
export function fallbackSentence(state: DiagnosticsCardState | null): string {
  if (state?.fallback === undefined) return '';
  const where = state.capture.state === 'active' ? "this window's diagnostics go to the per-user folder" : 'this window tried the per-user folder';
  return `This workspace's own folder could not be written (${state.fallback.cause}), so ${where} instead of ${state.fallback.from}.`;
}

/** What this window's own capture is doing, in one sentence. */
export function captureSentence(state: DiagnosticsCardState | null): string {
  if (state === null) return '';
  const { capture } = state;
  if (capture.state === 'off') return 'This window is not capturing diagnostics.';
  if (capture.state === 'active') return `This window captures at ${DIAGNOSTICS_LEVEL_LABELS[capture.level].toLowerCase()} into ${capture.runDirectory}.`;
  return `This window's diagnostics are inactive: ${capture.reason}`;
}

export function DiagnosticsCard({ state, onLevel, onChooseFolder, onOpenRunDirectory }: DiagnosticsCardProps) {
  const [error, setError] = useState<string | null>(null);
  const run = async (act: () => Promise<Outcome>) => {
    const r = await act();
    setError(r.ok ? null : r.reason);
  };
  const activateFolder = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    void run(onChooseFolder);
  };
  const folder = state === null ? '' : state.folder;
  return (
    <section aria-labelledby="about-diagnostics-heading" data-testid="diagnostics-card">
      <h2 className="settings__heading" id="about-diagnostics-heading">Diagnostics</h2>
      <p className="text-secondary settings__hint">Diagnostics write this application's log to a run directory on this machine, one per window. Nothing is sent anywhere.</p>
      <p className="text-secondary settings__hint" data-testid="diagnostics-log-contents">{DIAGNOSTICS_LOG_SCOPE} {DIAGNOSTICS_LOG_INCLUDES} {DIAGNOSTICS_LOG_EXCLUDES}</p>
      <div className="settings__dictation-field">
        <label htmlFor="diagnostics-level">Capture level</label>
        <DesignSelect
          id="diagnostics-level"
          className="input select settings__select"
          aria-label="Diagnostics capture"
          data-testid="diagnostics-level"
          value={state?.level ?? 'off'}
          disabled={state === null}
          onChange={(e) => { void run(() => onLevel(e.currentTarget.value as DiagnosticsLevel)); }}
        >
          {DIAGNOSTICS_LEVELS.map((level) => <option key={level} value={level}>{DIAGNOSTICS_LEVEL_LABELS[level]}</option>)}
        </DesignSelect>
      </div>
      <div className="settings__dictation-field">
        <label htmlFor="diagnostics-folder">Output folder{state !== null && !state.folderChosen ? ' (the default)' : ''}</label>
        {/* Selectable text that opens the chooser when activated: a read-only field, so the path can be selected and copied. */}
        <DesignInput
          id="diagnostics-folder"
          className="input"
          readOnly
          aria-label="Diagnostics output folder"
          aria-description="Opens the folder chooser to change where diagnostics are written."
          data-testid="diagnostics-folder"
          value={folder}
          disabled={state === null}
          onClick={() => { void run(onChooseFolder); }}
          onKeyDown={activateFolder}
        />
      </div>
      {state?.fallback !== undefined && <p className="text-secondary settings__hint" data-testid="diagnostics-fallback">{fallbackSentence(state)}</p>}
      <p className="text-secondary settings__hint" data-testid="diagnostics-takes-effect">{DIAGNOSTICS_TAKES_EFFECT}</p>
      <p className="about__value" data-testid="diagnostics-capture">{captureSentence(state)}</p>
      <DesignButton
        type="button"
        className="btn btn-secondary"
        data-testid="diagnostics-open-run"
        aria-label="Open this window's diagnostics run directory"
        disabled={state?.capture.state !== 'active'}
        onClick={() => { void run(onOpenRunDirectory); }}
      >
        Open run directory
      </DesignButton>
      {error && <p className="composer__error" role="alert" data-testid="diagnostics-error">{error}</p>}
    </section>
  );
}
