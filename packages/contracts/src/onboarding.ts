import { z } from 'zod';
import { ProviderChoiceSchema } from './providers.js';

/**
 * PD-WORKSPACE-010 — the first-launch setup. How its two ends are told apart: `completed` is the setup carried through to
 * the first prompt, `skipped` is the setup left by its own Skip control. Both are final for the installation.
 */
export const ONBOARDING_OUTCOMES = ['completed', 'skipped'] as const;
export type OnboardingOutcome = (typeof ONBOARDING_OUTCOMES)[number];

/**
 * What the setup surface reads from main before it draws and after each step (`onboarding.read`). It carries facts only,
 * so the surface derives its step from them and a window built in the middle of the setup resumes where the facts stand:
 * choosing a project replaces the window (REQ-SHELL-017), and the replacement reads `project.chosen` true.
 */
export const OnboardingViewSchema = z.object({
  /** True while the setup is owed to this installation: a first launch began it and nothing has ended it. */
  owed: z.boolean(),
  project: z.object({
    /** The window's workspace is a folder the user chose, remembered as the last opened. */
    chosen: z.boolean(),
    /** The window's workspace folder, or null where none is open. */
    path: z.string().nullable(),
    /** The folder the application was started in holds a Git repository, so it may be offered as the project. */
    currentIsRepository: z.boolean(),
  }),
  providers: z.object({
    authenticated: z.array(z.object({ id: z.string(), displayName: z.string(), modelCount: z.number().int().nonnegative() })),
    /** REQ-WORKSPACE-135's catalogue, in REQ-PROVIDER-001's order: the same list the authentication window offers. */
    choices: z.array(ProviderChoiceSchema),
  }),
});
export type OnboardingView = z.infer<typeof OnboardingViewSchema>;
