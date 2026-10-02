// @ts-check
/**
 * What `pnpm package` says when it ends (ADR-0056's evidence, IC-6; first-release-plan.md §4.4). Kept apart from
 * `package.mjs`, which runs a pipeline the moment it is imported, so that every line it closes on can be tested
 * against the steps that actually ran rather than against the steps that were meant to.
 *
 * Each closing line is a statement about the run, so each is printed only when the run makes it true:
 *
 *  - the verdict, and on a refusal one `error: …` line on stderr (REQ-STARTUP-149: a build command's handled error);
 *  - that a requested counterfactual was NOT exercised, when the package was refused before `electron-builder` ran —
 *    its rules live in the hooks, so a refusal that came first is not the counterfactual's evidence;
 *  - that `out/` now holds a SEAM-FREE build, only when `electron-vite build` ran. It once printed after every run, a
 *    refusal before the build included (docs/defects/fixed/pnpm-package-announced-a-seam-free-build-it-had-not-made.md);
 *  - a development package's announcement, last, where it cannot scroll away (first-release-plan.md §4.4).
 */

/** The step names this module reads the run by. `package.mjs` names its steps with these prefixes. */
export const STEPS = Object.freeze({ build: 'electron-vite build', builder: 'electron-builder' });

/**
 * Whether a step whose name starts with `prefix` was entered — passed or failed — before the package ended.
 * @param {{ steps: { name: string }[] }} report @param {string} prefix
 */
export function reached(report, prefix) {
  return report.steps.some((s) => s.name.startsWith(prefix));
}

/**
 * The lines `pnpm package` closes on, for the terminal: stdout's and stderr's, in order.
 * @param {{
 *   report: { ok: boolean, ms: number, steps: { name: string }[], counterfactual: string | null, assets?: { notices?: string, line?: string } },
 *   why?: string,
 *   reportPath: string,
 * }} options
 * @returns {{ stdout: string[], stderr: string[] }}
 */
export function closingLines({ report, why, reportPath }) {
  const stdout = [`\n[package] ${report.ok ? 'PASSED' : 'REFUSED'}${why ? ` — ${why}` : ''} (${report.ms} ms) → ${reportPath}`];
  const stderr = report.ok ? [] : [`error: pnpm package refused: ${why || `see ${reportPath}`}`];
  if (report.counterfactual && !reached(report, STEPS.builder)) {
    stdout.push(`[package] COUNTERFACTUAL ${report.counterfactual} NOT EXERCISED — the package ended before electron-builder ran, so no rule it constructs was reached and this run is not its evidence.`);
  }
  // This script builds with the verification seams compiled OUT and leaves that build in `out/`. Every `*-proof`
  // script launches `out/main/index.js` and drives those seams, so the next proof run after a package would fail
  // for a reason no one would guess from its output. Say so — and only when that build ran: a package refused before
  // it (the code-intelligence bundle, the manifest check, the notices step) never touched `out/`.
  if (reached(report, STEPS.build)) stdout.push('[package] `out/` now holds a SEAM-FREE build — run `pnpm build` before any proof or `pnpm app:drive`.');
  // A development package says what it is last (first-release-plan.md §4.4).
  if (report.ok && report.assets?.notices === 'absent' && report.assets.line) stdout.push(`[package] ${report.assets.line}`);
  return { stdout, stderr };
}
