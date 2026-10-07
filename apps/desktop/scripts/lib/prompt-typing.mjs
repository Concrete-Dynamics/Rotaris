// @ts-check
/**
 * How much longer the live run's own kill limit for a launch stands, because the capture seam's wait now counts from the
 * prompt's submission (live-run finding P6 at `a68f121`; `docs/defects/fixed/a-captures-wait-starts-before-its-prompt-is-typed.md`).
 *
 * The capture's bound (`ROTARIS_CAPTURE_WAIT_MS`) counts from the moment the typed prompt is submitted, but the harness's
 * kill limit for the launch (`RUN_WAIT_MS` plus a margin) counts from the spawn. Before this allowance the typing time —
 * about 27 s for the terminal scenario's 5,755 characters at a load near the CPU count, more above it — came out of that
 * margin, so a run that used its whole budget could be killed by the harness before the capture's own timeout line.
 *
 * The allowance is `TYPING_MS_PER_CHAR` per character of `ROTARIS_CAPTURE_PROMPT`: about twice the 4.8 to 5.0 ms per
 * character measured on 2026-10-07 (5,755 characters in 27.4 s in the live run; 4,618 in 23.2 s in a scripted launch at
 * load about 10 on four CPUs). Only a launch that both types a prompt and states a capture bound gets it.
 *
 * Nothing here is product code. It runs only from the live run and its test.
 */

/** The allowance per typed character: about twice what the renderer took per `char` event under load. */
export const TYPING_MS_PER_CHAR = 10;

/**
 * The milliseconds the harness adds to a launch's kill limit for typing its prompt.
 * @param {Record<string, string | undefined>} env the launch's capture environment
 */
export function typingAllowanceMs(env) {
  const prompt = env['ROTARIS_CAPTURE_PROMPT'];
  const bound = Number(env['ROTARIS_CAPTURE_WAIT_MS'] ?? 0);
  if (typeof prompt !== 'string' || !(bound > 0)) return 0;
  return prompt.length * TYPING_MS_PER_CHAR;
}
