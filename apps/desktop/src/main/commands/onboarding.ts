import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type OnboardingView } from '@rotaris/contracts';
import { samePath } from '@rotaris/platform';
import { type CommandContext, type CommandHandlers } from './context.js';

/**
 * THE FIRST-LAUNCH SETUP (PD-WORKSPACE-010) — what the setup surface reads, its project step, and its end. The provider
 * step is `provider.signIn`, the model step `config.save`, the mode `config.setField` and the first prompt
 * `session.start`: the setup adds no second path to any of them. Main holds whether the setup is owed
 * (`../onboarding.ts`); a renderer cannot store that it ended except by asking here.
 */
export function onboardingCommands(
  ctx: Pick<CommandContext, 'log' | 'mainWindows' | 'firstLaunchSetup' | 'preferences' | 'providerChoices' | 'providerRows' | 'raiseNoProviderNotice'>,
): Pick<CommandHandlers, 'onboarding.read' | 'onboarding.chooseProject' | 'onboarding.finish'> {
  const { mainWindows, firstLaunchSetup: onboarding, preferences, providerChoices, providerRows, raiseNoProviderNotice } = ctx;
  return {
    'onboarding.read': (_req, { w }) => {
      const path = w.workspace === '(no workspace)' ? null : w.workspace;
      const remembered = preferences.read('workspace/lastOpened');
      const view: OnboardingView = {
        owed: onboarding.owed(),
        project: {
          chosen: path !== null && typeof remembered === 'string' && samePath(remembered, path),
          path,
          currentIsRepository: path !== null && existsSync(join(path, '.git')),
        },
        providers: {
          authenticated: providerRows().filter((row) => row.authenticated).map((row) => ({ id: row.id, displayName: row.displayName, modelCount: row.modelCount })),
          choices: providerChoices(),
        },
      };
      return { ok: true, value: view };
    },
    'onboarding.chooseProject': (req, { senderId }) => mainWindows.chooseForSetup(senderId, { useCurrent: req.useCurrent === true }),
    'onboarding.finish': async (req) => {
      const ended = await onboarding.finish(req.outcome);
      // REQ-WORKSPACE-152 (3) was held back while the setup stood in its place; a setup left with no provider owes it now.
      if (ended) raiseNoProviderNotice();
      return { ok: true, value: { ended } };
    },
  };
}
