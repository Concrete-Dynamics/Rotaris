/**
 * The onboarding proof — PD-WORKSPACE-010's first-launch setup in the built app, free, with no provider.
 *
 * Every other proof holds the setup off (`ROTARIS_CAPTURE_ONBOARDING=off`, `proofIsolationEnv`), because a scratch
 * profile is a first launch every time. This one names `on` and measures what the others cannot see:
 *
 *   1. first-launch — a fresh profile and no project. The window opens on the setup at its project step, the shell
 *                     beneath is inert, the deferred chooser is not scheduled and the no-provider notice is not
 *                     published (clause 4). The step's own press opens the chooser (answered by
 *                     `ROTARIS_CAPTURE_PROJECT_FOLDER`); the window is replaced, the folder remembered, and the
 *                     replacement opens on the model step with the catalogue as one radio group.
 *   2. resumed      — the same profile launched again. The remembered project opens and the setup is still owed, at the
 *                     model step (clause 1). Skip setup clears it: the shell takes focus again, the state is `done`, and
 *                     the no-provider notice is published then.
 *   3. ended        — a third launch of that profile shows no setup.
 *   4. held-off     — a fresh profile under the seam every other proof names: no setup, and the deferred chooser offered.
 *
 * The sign-in, the slots, the mode and the first prompt are the product's own paths, measured by `slice-proof`,
 * `config-proof` and `composer-proof`; the setup's use of them is held by `packages/ui/src/first-run.test.ts` and was
 * driven by hand against a self-hosted endpoint at the directive's first execution.
 *
 * Evidence under `.proof/onboarding-proof/`: one log and one PNG per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDesktop, evidenceDirectory } from './lib/harness.mjs';
import { startApp, stopApp, stopOverrunMessage, until } from './lib/driver.mjs';

const output = evidenceDirectory('onboarding-proof');
rmSync(output, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
mkdirSync(output, { recursive: true });
if (!process.argv.includes('--skip-build')) buildDesktop(output);

/** @typedef {{ child: any, driver: any, endpointFile: string, logFile: string, local: string, preferences: string }} Started */
/** @type {{ checks: { name: string, ok: boolean, detail: string | undefined }[] }} */
const results = { checks: [] };
let failed = 0;
/** @param {string} name @param {boolean} ok @param {string} [detail] */
const check = (name, ok, detail) => {
  results.checks.push({ name, ok, detail });
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const project = join(output, 'atlas-billing');
mkdirSync(join(project, '.git'), { recursive: true });
writeFileSync(join(project, 'README.md'), '# onboarding proof project\n');

const SETUP = `document.querySelector('.first-run') !== null`;
const STEP = `document.querySelector('.first-run')?.dataset.step ?? null`;
const INERT = `document.querySelector('.app-shell')?.hasAttribute('inert') ?? null`;
/** @param {Started} started @returns {Record<string, unknown>} */
const prefs = (started) => { const f = join(started.preferences, 'preferences.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}; };
/** @param {Started} started */
const logOf = (started) => (existsSync(started.logFile) ? readFileSync(started.logFile, 'utf8') : '');

/** @param {string} name @param {string} root @param {Record<string, string>} extra */
async function launch(name, root, extra) {
  const started = await startApp({ root, extra, timeoutMs: 90_000 });
  const d = started.driver;
  await d.waitFor('.app-shell', { timeoutMs: 30_000 });
  return { name, started, d };
}
/** @param {{ name: string, started: Started }} run */
async function end({ name, started }) {
  const stopped = await stopApp(started, { screenshot: join(output, `${name}.png`) });
  const log = logOf(started);
  writeFileSync(join(output, `${name}.log`), log);
  if (stopped.overran) throw new Error(stopOverrunMessage(name, stopped, log));
  return log;
}

const profile = join(output, 'profile');
const ON = { ROTARIS_CAPTURE_ONBOARDING: 'on', ROTARIS_CAPTURE_PROJECT_FOLDER: project };

// 1. first-launch
{
  const run = await launch('first-launch', profile, ON);
  const { d, started } = run;
  try {
    check('a first launch opens on the setup, at its project step', await d.eval(SETUP) === true && await d.eval(STEP) === 'project', `step ${await d.eval(STEP)}`);
    check('the shell beneath takes no focus while the setup stands', await d.eval(INERT) === true);
    check('the setup is a modal surface with its Skip control', await d.eval(`document.querySelector('.first-run[role=dialog][aria-modal=true] [data-action=skip-setup]') !== null`) === true);
    const read = await d.command({ kind: 'onboarding.read' });
    check('main reads the setup as owed and no project as chosen', read.ok && read.value.owed === true && read.value.project.chosen === false, JSON.stringify(read.value?.project));
    // The 650 ms of REQ-SHELL-011 and the 800 ms of the notice slot have both passed before the log is read.
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    const early = logOf(started);
    check('the deferred chooser is not scheduled (clause 4)', /is not scheduled: the setup asks for the project/.test(early) && !/offering the first-launch project chooser/.test(early));
    check('the no-provider notice is held back (clause 4)', /held back while the first-launch setup is owed/.test(early) && !/notice: No model provider is authenticated yet/.test(early));
    check('the state is stored as started before anything is chosen', prefs(started)['onboarding/state'] === 'started', JSON.stringify(prefs(started)['onboarding/state']));

    await d.click('[data-action=choose-folder]');
    const step = await until(() => d.eval(STEP).catch(() => null), (s) => s === 'model', { timeoutMs: 30_000, what: 'the replacement window opening on the model step' }).then(() => 'model', (e) => String(e));
    check('choosing a folder replaces the window, and the replacement opens on the model step', step === 'model', step);
    const stored = prefs(started);
    check('the chosen folder is remembered', typeof stored['workspace/lastOpened'] === 'string' && stored['workspace/lastOpened'].endsWith('atlas-billing'), String(stored['workspace/lastOpened']));
    const radios = await d.eval(`[...document.querySelectorAll('.first-run [role=radiogroup] [role=radio]')].map((r) => ({ id: r.dataset.choice, disabled: r.disabled, checked: r.getAttribute('aria-checked') }))`);
    check('the model step lists the catalogue as one radio group with one choice checked', Array.isArray(radios) && radios.length >= 3 && radios.filter((/** @type {any} */ r) => r.checked === 'true').length === 1, JSON.stringify(radios));
    check('a provider whose sign-in this build lacks is listed and unavailable', radios.some((/** @type {any} */ r) => r.id === 'copilot' && r.disabled) && radios.some((/** @type {any} */ r) => r.id === 'openai-compatible' && !r.disabled));
    const fits = await d.eval(`(() => { const a = document.querySelector('.first-run'); return a.scrollWidth <= a.clientWidth && document.documentElement.scrollWidth <= innerWidth; })()`);
    check('the surface does not scroll sideways', fits === true);
  } finally { await end(run); }
}

// 2. resumed
{
  const run = await launch('resumed', profile, ON);
  const { d, started } = run;
  try {
    const step = await until(() => d.eval(STEP), (s) => s !== null, { timeoutMs: 20_000, what: 'the setup on the relaunch' }).catch(() => null);
    check('a relaunch of a setup that was begun opens the remembered project and resumes at the model step (clause 1)', step === 'model', `step ${step}`);
    await d.click('[data-action=skip-setup]');
    const gone = await until(() => d.eval(SETUP), (shown) => shown === false, { timeoutMs: 10_000, what: 'the setup clearing' }).then(() => true, () => false);
    check('Skip setup clears the surface', gone);
    check('the shell takes focus again', await d.eval(INERT) === false);
    const state = await until(() => Promise.resolve(prefs(started)['onboarding/state']), (s) => s === 'done', { timeoutMs: 10_000, what: 'the stored state' }).catch(() => prefs(started)['onboarding/state']);
    check('the state is stored as done', state === 'done', String(state));
    const notice = await d.waitFor('.notice-slot', { timeoutMs: 10_000 }).then(() => until(() => d.eval(`document.querySelector('.notice-slot')?.textContent ?? ''`), (t) => /No model provider is authenticated yet/.test(t), { timeoutMs: 10_000, what: 'the no-provider notice' })).then(() => true, () => false);
    check('the no-provider notice is published once the setup ended with none (clause 4)', notice);
  } finally { await end(run); }
}

// 3. ended
{
  const run = await launch('ended', profile, ON);
  try {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    check('a launch after the setup ended shows none', await run.d.eval(SETUP) === false);
  } finally { await end(run); }
}

// 4. held-off
{
  const run = await launch('held-off', join(output, 'held-off-profile'), { ROTARIS_CAPTURE_PROJECT_FOLDER: '(cancel)' });
  try {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    check('a proof launch holds the setup off', await run.d.eval(SETUP) === false);
    check('and is offered the deferred chooser as before', /offering the first-launch project chooser/.test(logOf(run.started)));
  } finally { await end(run); }
}

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(`\n${results.checks.length - failed} of ${results.checks.length} checks passed; evidence in ${output}`);
if (failed > 0) process.exit(1);
