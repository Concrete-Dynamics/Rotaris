import type { OnboardingOutcome } from '@rotaris/contracts';

/** The stored state of the first-launch setup: never begun, begun and not ended, or ended (`onboarding/state`). */
export type OnboardingState = 'started' | 'done' | undefined;

export interface OnboardingDependencies {
  readonly readState: () => OnboardingState;
  readonly writeState: (state: 'started' | 'done') => Promise<void>;
  readonly log: (message: string) => void;
}

/**
 * PD-WORKSPACE-010 — whether the first-launch setup is owed, decided once per launch and held by main.
 *
 * It is owed when a launch found no project to open (the same reading that used to schedule REQ-SHELL-011's deferred
 * chooser) and the setup was never ended, and it stays owed across launches until it is carried through or skipped: a
 * person who chose a project and quit meets the setup again at the step the facts stand at. A launch that names its
 * project, or an installation that already remembers one, never begins it, so nobody who used the product before this
 * directive is shown a setup.
 */
export interface Onboarding {
  /** Called once, before the first window is built, with whether the launch found no project to open. Answers `owed`. */
  begin(launchFoundNoProject: boolean): boolean;
  owed(): boolean;
  /** Ends the setup for the installation. Answers false, and changes nothing, when it was not owed. */
  finish(outcome: OnboardingOutcome): Promise<boolean>;
}

export function createOnboarding({ readState, writeState, log }: OnboardingDependencies): Onboarding {
  let owed = false;
  return {
    begin(launchFoundNoProject) {
      const state = readState();
      owed = state === 'started' || (state === undefined && launchFoundNoProject);
      if (owed && state === undefined) {
        // Stored before the window shows: a setup interrupted by a crash or a quit is still owed at the next launch.
        void writeState('started').catch((cause: unknown) => log(`onboarding: the started state could not be stored (${String(cause)}); the setup is shown for this launch only`));
      }
      log(`onboarding: ${owed ? 'the first-launch setup is owed' : 'no setup is owed'} (stored state ${state ?? 'absent'}, launch ${launchFoundNoProject ? 'found no project' : 'has a project'}; PD-WORKSPACE-010)`);
      return owed;
    },
    owed: () => owed,
    async finish(outcome) {
      if (!owed) return false;
      owed = false;
      await writeState('done');
      log(`onboarding: the first-launch setup ended, ${outcome} (PD-WORKSPACE-010)`);
      return true;
    },
  };
}
