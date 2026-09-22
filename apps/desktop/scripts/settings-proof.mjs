/**
 * The Settings proof (Part AG): the four categories that were the placeholder — Display (REQ-CONFIG-403,
 * REQ-CONFIG-472), Instructions and Tools (REQ-CONFIG-276/277, REQ-TOOLS-165) and About (REQ-CONFIG-398,
 * REQ-SHELL-138..143) — plus the save bar every category now shows (REQ-CONFIG-270) and the corrected
 * `display:` keys of REQ-CONFIG-172. Scripted client, scratch profile, six launches:
 *
 *   1. no-workspace — Electron started with no workspace: About carries the version, an em dash for Build and
 *                     REQ-SHELL-142's caption; the Tools inventory is fully populated (REQ-CONFIG-277 populates
 *                     it unconditionally); Instructions is empty and names the file to create.
 *   2. instructions — the same workspace with `AGENTS.md` and `AGENTS.override.md` on disk: two rows, in the
 *                     requirement's order, source `workspace`, described by absolute path; the first row's switch
 *                     is turned off and saved, and the `instructions.overrides` policy lands in the file
 *                     (PD-WORKSPACE-002). The home-relative bases resolve into a scratch home, so the operator's
 *                     own files never reach the inventory.
 *   3. display      — the Display category: the four caps moved, the save bar going dirty and back to saved, the
 *                     file written under REQ-CONFIG-172's key names with unlimited as `0`, and the two desktop
 *                     preferences written the moment they move.
 *   4. reopen       — the same profile again: the four controls come back on the saved values, the form is clean,
 *                     and the two preferences survived.
 *   5. live-apply   — a scripted run leaves a tool row on screen; changing a display control and leaving Settings
 *                     raises REQ-CONFIG-286's guard, and Save puts the new value on the row already drawn.
 *   6. falsified    — a file written with Part Z's key names governs nothing: the controls show the requirement's
 *                     defaults instead (REQ-CONFIG-172).
 *
 * The legal links and the licence bundle are exercised through the capture seam's scripted opener
 * (`ROTARIS_CAPTURE_OPEN_EXTERNAL`), which reports success or the platform refusal without launching a browser.
 *
 * Evidence under `.proof/settings-proof/`: one PNG and one log per launch, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cleanEnvironment, proofIsolationEnv } from './lib/harness.mjs';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const app = join(repo, 'apps', 'desktop');
const electron = process.platform === 'win32' ? join(repo, 'node_modules', 'electron', 'dist', 'electron.exe') : join(repo, 'node_modules', 'electron', 'dist', 'electron');
const output = resolve(repo, '.proof', 'settings-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

if (!process.argv.includes('--skip-build')) {
  const built = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm --filter @rotaris/desktop build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 })
    : spawnSync('pnpm', ['--filter', '@rotaris/desktop', 'build'], { cwd: repo, encoding: 'utf8', timeout: 180_000 });
  writeFileSync(join(output, 'build.log'), `${built.stdout ?? ''}\n${built.stderr ?? ''}`);
  if (built.status !== 0) throw new Error(`desktop build exited ${built.status ?? built.signal ?? 'unknown'}`);
}
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

const PROBES = [
  '.app-shell', '.save-bar__status', '[data-testid="about-row"]', '[data-testid="legal-link"]',
  '[data-testid="legal-error"]', '[data-testid="licenses-caption"]', '[data-testid="licenses-error"]',
  '[data-testid="inventory-row"]', '[data-testid="inventory-empty"]', '[data-testid="instruction-toggle"]',
  '[data-testid="tool-result-lines"]', '[data-testid="tool-input-lines"]',
  '[data-testid="show-tool-results"]', '[data-testid="show-tool-inputs"]',
  '[data-testid="auto-collapse-tools"]', '[data-testid="group-tools"]',
  '.settings__body',
];

function launch(name, workspace, local, preferences, extra, timeoutMs = 120_000) {
  const png = join(output, `${name}.png`);
  const args = [join(app, 'out', 'main', 'index.js')];
  if (workspace !== null) args.push(workspace);
  const result = spawnSync(electron, args, {
    cwd: app, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    env: {
      ...cleanEnvironment(), ...proofIsolationEnv({ local, preferences }),
      ROTARIS_MODEL_DIALECT: 'scripted', ROTARIS_CAPTURE_PNG: png, ROTARIS_CAPTURE_PROBE: PROBES.join(';;'), ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      // PD-WORKSPACE-002: the scratch home for instruction-file discovery, so this proof exercises the
      // home-relative bases without reading the operator's own files (the skills proof's seam pattern).
      ROTARIS_CAPTURE_INSTRUCTIONS_HOME: home,
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.status !== 0) throw new Error(`${name} exited ${result.status ?? result.signal ?? 'unknown'}`);
  if (!existsSync(png)) throw new Error(`${name} produced no screenshot`);
  const probes = {};
  for (const line of log.split('\n')) {
    const m = /capture: probe (.+?) → (\[.*\])\s*$/.exec(line);
    if (m) { try { probes[m[1]] = JSON.parse(m[2]); } catch { probes[m[1]] = []; } }
  }
  return { png, log, probes };
}
const rows = (probes, selector) => probes[selector] ?? [];
const first = (probes, selector) => (probes[selector] ?? [])[0] ?? null;
const text = (probes, selector) => rows(probes, selector).map((p) => p.text);

const root = join(output, 'profile');
const workspace = join(root, 'workspace');
const local = join(root, 'local');
const preferences = join(root, 'preferences');
const home = join(root, 'home');
mkdirSync(workspace, { recursive: true });
mkdirSync(local, { recursive: true });
mkdirSync(home, { recursive: true });
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
const configFile = join(workspace, '.rotaris', 'agents.yaml');
writeFileSync(configFile, [
  '# scratch configuration written by the proof script',
  'models:',
  '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'display:',
  '  # a key the settings screen does not offer: REQ-CONFIG-256 leaves it exactly as the file states it',
  '  show_thinking: true',
  '',
].join('\n'));
// The file the scripted `read` step reads (launch 5), long enough that a cap has something to cut short.
writeFileSync(join(workspace, 'README.md'), ['# Settings proof workspace', ...Array.from({ length: 30 }, (_, i) => `line ${i + 1}`), ''].join('\n'));
const results = {};

/** Open Settings (Ctrl+7) on a named category, and give the view time to paint. */
const openCategory = (label, atMs = 900) => ({ ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_VIEW_MS: String(atMs), ROTARIS_CAPTURE_SETTINGS: label });

// ── 1. No workspace: About, Tools and the empty Instructions ────────────────────────────────────────────────
const noWorkspace = launch('no-workspace', null, local, preferences, {
  ...openCategory('About'),
  ROTARIS_CAPTURE_OPEN_EXTERNAL: 'record',
  // Click the first legal link and the licence bundle: one reports success, the other the absent bundle.
  ROTARIS_CAPTURE_CLICKS: '[data-testid="legal-link"]>>Privacy Policy@2200;;[data-testid="licenses-open"]@2600',
  ROTARIS_CAPTURE_AFTER_MS: '3600',
});
const aboutRows = Object.fromEntries(rows(noWorkspace.probes, '[data-testid="about-row"]').map((r) => [r.data['data-name'], r.data['data-value']]));
if (!/^v\d/.test(aboutRows.Version ?? '')) throw new Error(`the Version row did not carry a version: ${JSON.stringify(aboutRows)}`);
// REQ-SHELL-140: no build asset ships, so the row is the em dash rather than an invented identifier.
if (aboutRows.Build !== '—') throw new Error(`the Build row was "${aboutRows.Build}", not the em dash`);
if (aboutRows.Publisher !== 'Concrete Dynamics UG (haftungsbeschränkt)') throw new Error(`the publisher row was "${aboutRows.Publisher}"`);
if (aboutRows['Security contact'] !== 'security@concrete-dynamics.com') throw new Error(`the security contact row was "${aboutRows['Security contact']}"`);
if (!['Standalone build', 'Package installation'].includes(aboutRows.Installation)) throw new Error(`the Installation row was "${aboutRows.Installation}"`);
const legal = rows(noWorkspace.probes, '[data-testid="legal-link"]').map((r) => [r.text, r.data['data-url']]);
const expectedLegal = [
  ['Privacy Policy', 'https://rotaris.ai/privacy'], ['EULA', 'https://rotaris.ai/eula'], ['Terms / AGB', 'https://rotaris.ai/terms'],
  ['Acceptable Use Policy', 'https://rotaris.ai/acceptable-use'], ['Withdrawal / Widerrufsbelehrung', 'https://rotaris.ai/widerruf'],
];
if (JSON.stringify(legal) !== JSON.stringify(expectedLegal)) throw new Error(`the legal documents were ${JSON.stringify(legal)}`);
if (!noWorkspace.log.includes('capture: open-external https://rotaris.ai/privacy')) throw new Error('the Privacy Policy link did not reach the system browser');
if (text(noWorkspace.probes, '[data-testid="legal-error"]').length !== 0) throw new Error('a successful open left an error caption on screen');
// REQ-SHELL-142: no bundle ships, so the caption says so and the click is refused with the same sentence.
const caption = text(noWorkspace.probes, '[data-testid="licenses-caption"]')[0] ?? '';
if (caption !== 'This build does not carry a third-party license bundle.') throw new Error(`the licensing caption was "${caption}"`);
if (text(noWorkspace.probes, '[data-testid="licenses-error"]')[0] !== 'Could not open the third-party license bundle.') throw new Error('clicking the bundle control reported no refusal');
results.about = { rows: aboutRows, legal: legal.length, opened: 'https://rotaris.ai/privacy', caption };

// The Tools inventory, and the empty Instructions, in the same launch profile (no workspace at all).
const tools = launch('tools', null, local, preferences, { ...openCategory('Tools'), ROTARIS_CAPTURE_AFTER_MS: '2600' });
const toolRows = rows(tools.probes, '[data-testid="inventory-row"]');
// REQ-CONFIG-277: populated unconditionally — with no workspace open at all.
if (toolRows.length !== 19) throw new Error(`the Tools inventory listed ${toolRows.length} rows, not the nineteen public names`);
const toolNames = toolRows.map((r) => r.data['data-name']);
if (JSON.stringify(toolNames) !== JSON.stringify([...toolNames].sort((a, b) => a.localeCompare(b)))) throw new Error(`the Tools inventory was not sorted: ${toolNames.join(', ')}`);
if (toolRows.some((r) => r.data['data-source'] !== 'built-in')) throw new Error('a Tools row carried a source other than built-in');
if (!toolRows.find((r) => r.data['data-name'] === 'git_commit')?.text.includes('no executor registered')) throw new Error('the row for the unimplemented name did not say so');
results.tools = { rows: toolRows.length, sorted: true, source: 'built-in' };

const noFiles = launch('instructions-empty', workspace, local, preferences, { ...openCategory('Instructions'), ROTARIS_CAPTURE_AFTER_MS: '2600' });
if (rows(noFiles.probes, '[data-testid="inventory-row"]').length !== 0) throw new Error('the Instructions inventory listed a row before either file existed');
const emptyState = text(noFiles.probes, '[data-testid="inventory-empty"]')[0] ?? '';
if (!emptyState.includes('AGENTS.md') || !emptyState.includes(workspace)) throw new Error(`the empty state did not name the file to create: "${emptyState}"`);
results.instructionsEmpty = { rows: 0, namesTheFile: true };

// ── 2. Both instruction files on disk ───────────────────────────────────────────────────────────────────────
writeFileSync(join(workspace, 'AGENTS.md'), '# standing instructions\n');
writeFileSync(join(workspace, 'AGENTS.override.md'), '# overriding instructions\n');
const instructions = launch('instructions', workspace, local, preferences, {
  ...openCategory('Instructions'),
  // PD-WORKSPACE-002: switch the first file off and save — the per-file policy round trip.
  ROTARIS_CAPTURE_CLICKS: '[data-testid="instruction-toggle"][data-id="workspace:AGENTS.md"]@1600;;.save-bar .btn-primary>>Save@3200',
  ROTARIS_CAPTURE_AFTER_MS: '6000',
});
const listed = rows(instructions.probes, '[data-testid="inventory-row"]').map((r) => [r.data['data-name'], r.data['data-source'], r.text]);
if (listed.length !== 2) throw new Error(`the Instructions inventory listed ${listed.length} rows`);
if (listed[0][0] !== 'AGENTS.md' || listed[1][0] !== 'AGENTS.override.md') throw new Error(`the order was ${listed.map((l) => l[0]).join(', ')}`);
if (listed.some((l) => l[1] !== 'workspace')) throw new Error('an Instructions row carried a source other than workspace');
if (!listed.every((l) => l[2].includes(join(workspace, l[0])))) throw new Error(`a row did not describe its file by absolute path: ${JSON.stringify(listed)}`);
results.instructions = { rows: listed.map((l) => l[0]), source: 'workspace', absolutePaths: true };
// PD-WORKSPACE-002: two switches, and the first file's switch stayed off through Save.
const toggles = rows(instructions.probes, '[data-testid="instruction-toggle"]');
if (toggles.length !== 2) throw new Error(`the Instructions tab carried ${toggles.length} switches, not two`);
if (toggles[0].data['data-on'] !== 'false') throw new Error('the AGENTS.md switch did not stay off through Save');
if (toggles[1].data['data-on'] !== 'true') throw new Error('the AGENTS.override.md switch did not stay on');
const instructionsYaml = readFileSync(configFile, 'utf8');
if (!/workspace:AGENTS\.md: off/.test(instructionsYaml)) throw new Error(`the per-file policy was not written:\n${instructionsYaml}`);
results.instructionToggle = { off: 'workspace:AGENTS.md', file: true };

// ── 3. The Display category: move all six, save, and read the file ──────────────────────────────────────────
const display = launch('display', workspace, local, preferences, {
  ...openCategory('Display'),
  // The two preferences first (immediate), then the four configuration fields (deferred to Save).
  ROTARIS_CAPTURE_CLICKS: [
    '[data-testid="auto-collapse-tools"]@1600',
    '[data-testid="group-tools"]@1900',
    '[data-testid="show-tool-results"]@2200',
    '.save-bar .btn-primary>>Save@4200',
  ].join(';;'),
  ROTARIS_CAPTURE_SELECT: '[data-testid="tool-result-lines"]>>20@2600;;[data-testid="tool-input-lines"]>>unlimited@3000',
  ROTARIS_CAPTURE_PROBE_AT: '.save-bar__status@3600',
  ROTARIS_CAPTURE_AFTER_MS: '6000',
});
// REQ-CONFIG-270: the bar is on screen in the Display category, and it went dirty when a control moved.
const dirtyLine = display.log.split('\n').find((l) => l.includes('probe-at 3600 .save-bar__status'));
if (!dirtyLine || !dirtyLine.includes('Unsaved changes')) throw new Error(`the save bar did not report unsaved changes after the six controls moved: ${dirtyLine ?? 'no probe'}`);
if ((text(display.probes, '.save-bar__status')[0] ?? '') !== 'All changes saved') throw new Error(`after Save the bar read "${text(display.probes, '.save-bar__status')[0]}"`);
const savedYaml = readFileSync(configFile, 'utf8');
// REQ-CONFIG-172: the requirement's key names, unlimited as 0, and the foreign key untouched (REQ-CONFIG-256).
if (!/tool_result_max_lines: 20/.test(savedYaml)) throw new Error(`the file does not carry the result cap:\n${savedYaml}`);
if (!/tool_input_max_lines: 0/.test(savedYaml)) throw new Error(`unlimited was not written as 0:\n${savedYaml}`);
if (!/show_tool_results: false/.test(savedYaml)) throw new Error(`the results toggle was not written:\n${savedYaml}`);
if (!/show_thinking: true/.test(savedYaml)) throw new Error(`the key this screen does not offer was disturbed:\n${savedYaml}`);
if (/tool_result_lines:/.test(savedYaml)) throw new Error(`Part Z's falsified key name was written:\n${savedYaml}`);
// REQ-CONFIG-403: the two preferences were written the moment they moved, before any Save.
const prefs = JSON.parse(readFileSync(join(preferences, 'preferences.json'), 'utf8'));
if (prefs['display/autoCollapseTools'] !== true) throw new Error(`the auto-collapse preference is ${JSON.stringify(prefs['display/autoCollapseTools'])}`);
if (prefs['display/groupTools'] !== false) throw new Error(`the grouping preference is ${JSON.stringify(prefs['display/groupTools'])}`);
results.display = { dirtyThenSaved: true, file: { tool_result_max_lines: 20, tool_input_max_lines: 0, show_tool_results: false, foreignKeyKept: true }, preferences: { autoCollapseTools: true, groupTools: false } };

// ── 4. Reopen: the saved values come back, and the form is clean ─────────────────────────────────────────────
const reopen = launch('reopen', workspace, local, preferences, { ...openCategory('Display'), ROTARIS_CAPTURE_AFTER_MS: '3000' });
const resultCap = first(reopen.probes, '[data-testid="tool-result-lines"]')?.value;
const inputCap = first(reopen.probes, '[data-testid="tool-input-lines"]')?.value;
if (resultCap !== '20') throw new Error(`the result cap came back as ${resultCap}`);
// REQ-CONFIG-172/175: 0 in the file is unlimited on the control, which is the whole round trip.
if (inputCap !== 'unlimited') throw new Error(`the input cap came back as ${inputCap}`);
if (first(reopen.probes, '[data-testid="show-tool-results"]')?.data['data-on'] !== 'false') throw new Error('the results toggle did not come back off');
if (first(reopen.probes, '[data-testid="auto-collapse-tools"]')?.data['data-on'] !== 'true') throw new Error('the auto-collapse preference did not survive the relaunch');
if (first(reopen.probes, '[data-testid="group-tools"]')?.data['data-on'] !== 'false') throw new Error('the grouping preference did not survive the relaunch');
// REQ-CONFIG-419/425: a read repopulates and the form starts clean.
if ((text(reopen.probes, '.save-bar__status')[0] ?? '') !== 'All changes saved') throw new Error(`the reopened form was not clean: "${text(reopen.probes, '.save-bar__status')[0]}"`);
results.reopen = { tool_result_lines: resultCap, tool_input_lines: inputCap, clean: true, preferencesKept: true };

// ── 5. The transcript follows the settings screen, and the guard stands between them ────────────────────────
// The file says `show_tool_results: false` after launch 3, so the transcript draws no tool output. Turning the
// control back on and leaving Settings raises REQ-CONFIG-286's guard; answering Save both writes the file and
// puts the new value on the row that was already drawn.
//
// **What this launch does NOT show, and why:** REQ-CONFIG-472 says a change reaches the rows already on screen
// the moment the control moves. In this shell Settings *replaces* the Workspace (REQ-SHELL-023's seven views),
// and a dirty form cannot be left without answering the guard — so a state in which the pending value and the
// file disagree while a transcript is visible is unreachable in the main window. The renderer publishes its
// pending caps to the transcript all the same (`pendingDisplay`), which is what makes Discard show immediately
// and what a second transcript surface would read; the narrowing is recorded rather than papered over.
const live = launch('live-apply', workspace, local, preferences, {
  ROTARIS_SCRIPT: 'read,answer',
  ROTARIS_CAPTURE_PROMPT: 'Read the file.',
  // The timings clear code intelligence's discovery at run start (~5 s, Part T), so the tool row exists first.
  ROTARIS_CAPTURE_PROBE_AT: '.tool__preview@13000;;.dialog-title@18000',
  ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_VIEW_MS: '14000', ROTARIS_CAPTURE_SETTINGS: 'Display',
  ROTARIS_CAPTURE_CLICKS: '[data-testid="show-tool-results"]@15500;;.dialog-actions .btn-primary>>Save@18500',
  ROTARIS_CAPTURE_CHORDS: 'Ctrl+2@17500',
  ROTARIS_CAPTURE_PROBE: [...PROBES, '.tool__preview', '.dialog-title'].join(';;'),
  ROTARIS_CAPTURE_AFTER_MS: '21000',
}, 180_000);
const before = /probe-at 13000 \.tool__preview → (\[.*\])/.exec(live.log)?.[1] ?? '[]';
const beforeText = JSON.parse(before).map((p) => p.text).join(' | ');
if (!/⤷/.test(beforeText)) throw new Error(`no tool row was drawn before the change: ${beforeText}`);
// Saved `show_tool_results: false`: the preview carries the marker and nothing of the result.
if (beforeText.replace('⤷', '').trim() !== '') throw new Error(`the saved setting did not hide the result: "${beforeText}"`);
// REQ-CONFIG-286: leaving a dirty settings screen raises the guard rather than dropping the change.
const guard = /probe-at 18000 \.dialog-title → (\[.*\])/.exec(live.log)?.[1] ?? '[]';
if (!JSON.parse(guard).some((p) => p.text === 'Save settings before leaving?')) throw new Error(`the unsaved guard did not stand between Settings and the view switch: ${guard}`);
const afterText = text(live.probes, '.tool__preview').join(' | ');
// The row's preview is the result's own first line, which the read tool heads with the file it read.
if (!/README\.md/.test(afterText)) throw new Error(`the change did not reach the row already on screen: "${afterText}"`);
const afterYaml = readFileSync(configFile, 'utf8');
if (!/show_tool_results: true/.test(afterYaml)) throw new Error(`the guard's Save did not write the file:
${afterYaml}`);
results.liveApply = { before: beforeText.slice(0, 40), after: afterText.slice(0, 40), guard: 'Save settings before leaving?', file: 'show_tool_results: true' };

// ── 6. The falsified keys are dead: a file written Part Z's way governs nothing ──────────────────────────────
writeFileSync(configFile, [
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'display:',
  '  # Part Z read these two; no requirement ever stated them (REQ-CONFIG-172).',
  '  tool_result_lines: 50', '  tool_input_lines: 1', '',
].join('\n'));
const falsified = launch('falsified-keys', workspace, local, preferences, { ...openCategory('Display'), ROTARIS_CAPTURE_AFTER_MS: '3000' });
const fResult = first(falsified.probes, '[data-testid="tool-result-lines"]')?.value;
const fInput = first(falsified.probes, '[data-testid="tool-input-lines"]')?.value;
if (fResult !== '10' || fInput !== '2') throw new Error(`the falsified keys still govern: result=${fResult} input=${fInput}`);
// That the two also WARN as unknown keys (REQ-CONFIG-233) is asserted where the warnings are observable, in
// `packages/config/src/display-section.test.ts`; the load's warnings do not reach this process's log.
results.falsifiedKeys = { result: fResult, input: fInput, govern: false };

writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
console.log(`\nsettings proof: evidence under ${relative(repo, output)}`);
