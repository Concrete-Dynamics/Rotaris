/**
 * The SEAM CHECK's two lists and its reading of an emitted main section (`scripts/package.mjs`, the step "the packaged
 * bundle carries no scriptable seam"): the packaged probe's names that must survive a build with `ROTARIS_BUILD=package`,
 * and the scriptable ones that must not. A name stands for every variable it is a prefix of (`ROTARIS_CAPTURE_APPROVAL`
 * covers `_APPROVAL_MS`, `ROTARIS_CAPTURE_HOOK_REVIEW` covers `_HOOK_REVIEW_MS`).
 *
 * Moved out of `package.mjs` on 2026-10-14 (fin43) so the lists can be held to the source (`seam-check.test.ts`: every
 * variable main, the run host or the workspace service reads behind `__ROTARIS_SEAMS__` is named here) and the check run
 * on a seam-free `out/main/` without packaging (`node apps/desktop/scripts/lib/seam-check.mjs [out/main]`). Until then
 * the list named none of main's dialog answers, and a packaged build kept them
 * (docs/defects/fixed/a-packaged-build-keeps-capture-seams-that-answer-mains-dialogs.md).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The packaged probe's own: the photograph, the typed prompt, and when to photograph (`main/capture/probe.ts`). */
export const KEPT = ['ROTARIS_CAPTURE_PNG', 'ROTARIS_CAPTURE_PROMPT', 'ROTARIS_CAPTURE_AFTER_MS'];

/**
 * Each can script a window or answer for the person, so none may ship. The injection proof's two (2026-09-27): one writes
 * every scripted model call's system text to a file it names, the other points the machine-wide instruction base at any
 * directory. The scripted client's standing ledger (2026-10-01) is a file the run host writes under the same flag. The
 * approval dialog's scripted answer (2026-10-13) clicks Approve in a permission dialog
 * (docs/defects/fixed/the-approval-dialogs-scripted-answer-survives-a-packaged-build.md). Main's dialog answers, choosers'
 * paths, provider fill, external-link swallow, stale question, subscription delay and hold, theme, scale and network log
 * (2026-10-14) shipped behind the run-time `capturing` test alone until then.
 */
export const FORBIDDEN = [
  'scripted-standing.json', 'ROTARIS_CAPTURE_CLICKS', 'ROTARIS_CAPTURE_DOUBLE_CLICKS', 'ROTARIS_CAPTURE_TYPE', 'ROTARIS_CAPTURE_CHORDS',
  'ROTARIS_CAPTURE_EVAL_AT', 'ROTARIS_CAPTURE_CONFIG_PAIR_AT', 'ROTARIS_CAPTURE_OS_INPUT', 'ROTARIS_CAPTURE_SELECT', 'ROTARIS_CAPTURE_NOTICES',
  'ROTARIS_CAPTURE_DRAG_AT', 'ROTARIS_CAPTURE_PERSONA_STEER', 'ROTARIS_CAPTURE_PERSONA_CLICKS', 'ROTARIS_THEME_PROOF_DIR', 'ROTARIS_DRIVER',
  'ROTARIS_CAPTURE_MODEL_REQUESTS', 'ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE', 'ROTARIS_CAPTURE_SKILLS_MACHINE', 'ROTARIS_CAPTURE_APPROVAL',
  'ROTARIS_CAPTURE_DIALOG_PNG', 'ROTARIS_CAPTURE_GRIP_DRAG', 'ROTARIS_CAPTURE_THROW_ON_ABORT',
  // fin43: main's own seams, each read behind `__ROTARIS_SEAMS__` since 2026-10-14.
  'ROTARIS_CAPTURE_HOOK_REVIEW', 'ROTARIS_CAPTURE_REVIEW_PNG', 'ROTARIS_CAPTURE_PAUSE_ANSWER', 'ROTARIS_CAPTURE_ANSWERS',
  'ROTARIS_CAPTURE_BACKUP_TO', 'ROTARIS_CAPTURE_RESTORE_FROM', 'ROTARIS_CAPTURE_SAVE_PATH', 'ROTARIS_CAPTURE_DIRECTORY',
  'ROTARIS_CAPTURE_SKILL_FILE', 'ROTARIS_CAPTURE_PROJECT_FOLDER', 'ROTARIS_CAPTURE_PROVIDER_FILL', 'ROTARIS_CAPTURE_PROVIDER_EMPTY_OK',
  'ROTARIS_CAPTURE_OPEN_EXTERNAL', 'ROTARIS_CAPTURE_QUESTION_STALE', 'ROTARIS_CAPTURE_SUBSCRIBE_DELAY_MS', 'ROTARIS_CAPTURE_SUBSCRIBE_HOLD_MS',
  'ROTARIS_CAPTURE_THEME', 'ROTARIS_CAPTURE_SCALE', 'ROTARIS_CAPTURE_NET', 'ROTARIS_CAPTURE_RESUME',
  // fin43's review: main's two seams not named `ROTARIS_CAPTURE_*`, the rows proof's renderer role and the initialization
  // proof's registered task.
  'ROTARIS_ROWS_PROOF', 'ROTARIS_INIT_TEST_TASK',
  // fin44: the packaged probe's neighbours it does not use (`package.mjs` sets its three alone) — the wait, whose `js:` form
  // evaluates an expression in the renderer as `_EVAL_AT` does, the last view, the probes and the prompt's delay — and the
  // children's two home seams, which redirected a shipped build's skill and instruction discovery. Each is read behind
  // `__ROTARIS_SEAMS__` since 2026-10-14 (docs/defects/fixed/a-packaged-build-still-answers-capture-variables-beyond-the-probes-three.md).
  // `ROTARIS_CAPTURE_PROMPT_MS` is named whole: `ROTARIS_CAPTURE_PROMPT` is the probe's own and stays.
  'ROTARIS_CAPTURE_WAIT', 'ROTARIS_CAPTURE_END_VIEW', 'ROTARIS_CAPTURE_PROBE', 'ROTARIS_CAPTURE_PROMPT_MS',
  'ROTARIS_CAPTURE_SKILLS_HOME', 'ROTARIS_CAPTURE_INSTRUCTIONS_HOME',
  // fin45: the scripted model client's variables — the dialect switch, which answered every model of every run with the
  // stand-in and asked for no credential, and the scripts, which chose the tool calls it made and their arguments. Each is read
  // behind `__ROTARIS_SEAMS__` since 2026-10-14, and a packaged build's scripted provider takes a fixed script
  // (docs/defects/fixed/a-packaged-build-still-answers-the-scripted-model-clients-variables.md). `ROTARIS_SCRIPT` covers its
  // `_SCRIPT_*_ARGS` and `_SCRIPT_QUESTIONS` family.
  'ROTARIS_MODEL_DIALECT', 'ROTARIS_SCRIPT', 'ROTARIS_CHILD_SCRIPT', 'ROTARIS_LOOP_SCRIPT', 'ROTARIS_INTENT_SCRIPT',
  'ROTARIS_COMPRESSOR_SCRIPT', 'ROTARIS_IMPROVEMENT_SCRIPT',
  // Domain 22 (PD-TRACE-001, 2026-10-30): the adoption interpretation's own script, which chooses the answer the
  // adoption assistant composes its layout from. Read behind `__ROTARIS_SEAMS__`; a packaged build must not answer it.
  'ROTARIS_ADOPTION_SCRIPT',
  // fin46 (OQ-312, ruled 2026-10-14 under R-072): the scripted client itself, by the log line only it writes. A packaged build
  // answers no `provider: scripted` entry, so the client is compiled out with the seams and its module is not emitted
  // (docs/defects/fixed/a-packaged-build-answers-a-scripted-provider-entry-with-the-scripted-client.md).
  'scripted model call:',
];

/**
 * Reads every emitted `.js` file under `mainOut` — not `index.js` alone: a chunk is exactly the shape a seam could come back
 * in. Answers the probe's names `index.js` lost, the forbidden names found (with the file), and the sizes.
 * @param {string} mainOut
 */
export function seamCheck(mainOut) {
  const emitted = readdirSync(mainOut, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => join(e.parentPath, e.name));
  const bundle = readFileSync(join(mainOut, 'index.js'), 'utf8');
  const missing = KEPT.filter((name) => !bundle.includes(name));
  const present = [];
  for (const file of emitted) {
    const text = readFileSync(file, 'utf8');
    for (const name of FORBIDDEN) if (text.includes(name)) present.push(`${name} (${relative(mainOut, file)})`);
  }
  return { missing, present, files: emitted.length, bytes: bundle.length };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mainOut = resolve(process.argv[2] ?? join(fileURLToPath(new URL('../..', import.meta.url)), 'out', 'main'));
  const r = seamCheck(mainOut);
  console.log(JSON.stringify({ mainOut, ...r }, null, 2));
  console.log(r.missing.length === 0 && r.present.length === 0 ? 'seam check: PASS' : 'seam check: FAIL');
  process.exitCode = r.missing.length === 0 && r.present.length === 0 ? 0 : 1;
}
