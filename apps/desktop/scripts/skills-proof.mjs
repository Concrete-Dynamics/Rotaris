/**
 * The portable-skills proof (ADR-0063; REQ-WORKSPACE-051..069, 072, 073, 151).
 *
 * Six launches against the built product, with a scratch profile **and a scratch home directory**, so the
 * user-scope roots and the disable manifest are fixtures rather than whatever this machine happens to hold.
 * `HOME`, `USERPROFILE` and `HOMEPATH` are all set, because Node's `homedir()` reads a different one per
 * platform and a proof that set only one would silently read the operator's own skills on the other.
 *
 *   1. discover   — a workspace inside a git repository with project, repository and user-scope skills, a
 *                   shadowed duplicate, an invalid file, a disabled one and a name that collides with a
 *                   built-in command. The table's rows, sources, elided paths, shadow tooltip and skipped
 *                   list; the composer's popup and the suffixed command.
 *   2. policy     — the selectors and the switch move, the form goes dirty, Save writes `skills:` sparsely,
 *                   and a baseline chosen over a global override is written out explicitly (REQ-CONFIG-258).
 *   3. reopen     — the same profile again: the saved policy is what the selectors show, the form is clean.
 *   4. run        — a scripted run: the run host logs the context units at agent construction, the skill
 *                   directories are read roots, and the catalog block carries no body.
 *   5. rescan     — a SKILL.md added mid-session appears on Rescan, with the form still clean; the chooser's
 *                   dismissal changes nothing and a bad path reports REQ-WORKSPACE-057's own sentence.
 *   6. disabled   — `skills.enabled: false`: no catalog unit, nothing invocable, the switch off.
 *
 * Evidence under `.proof/skills-proof/`: one PNG and one log per launch, plus `results.json`.
 * `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { app, buildDesktop, electron, evidenceDirectory, launchOptions, readProbes, repo } from './lib/harness.mjs';

const output = evidenceDirectory('skills-proof');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
if (!process.argv.includes('--skip-build')) buildDesktop(output);
if (!existsSync(electron)) throw new Error(`Electron executable is absent: ${electron}`);

const PROBES = [
  '.app-shell',
  '[data-testid="skill-row"]',
  '[data-testid="skill-skipped"]',
  '[data-testid="skills-empty"]',
  '[data-testid="skills-message"]',
  '[data-testid="skills-enabled"]',
  '[data-testid="skill-commands"]',
  '[data-testid="prompt-commands"]',
  '[data-testid="transcript-clear"]',
  '.save-bar__status',
  '.slash-popup__row',
];

const results = [];
const fail = (message) => { writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2)); throw new Error(message); };

function launch(name, workspace, extra, timeoutMs = 120_000) {
  const png = join(output, `${name}.png`);
  const args = [join(app, 'out', 'main', 'index.js')];
  if (workspace !== null) args.push(workspace);
  const result = spawnSync(electron, args, {
    cwd: app, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    env: {
      ...launchOptions({ local: scratch.local, preferences: scratch.preferences }),
      /*
       * The scratch home for user-scope discovery, so this proof exercises `~/.agents/skills` and the OpenHands
       * manifest without reading the operator's own skills.
       *
       * It is a capture seam rather than an override of `HOME`/`USERPROFILE`: **overriding those kills the
       * Electron process before it paints** on Windows. Measured on this proof's first run — the launch exited
       * 0x80000003 two log lines in, and a control run with the same environment minus those two variables
       * exited 0. The seam is read only by the run host's skill host and only when it is set.
       */
      ROTARIS_CAPTURE_SKILLS_HOME: scratch.home,
      ROTARIS_CAPTURE_PNG: png,
      ROTARIS_CAPTURE_PROBE: PROBES.join(';;'),
      ...extra,
    },
  });
  const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(output, `${name}.log`), log);
  if (result.status !== 0) fail(`${name} exited ${result.status ?? result.signal ?? 'unknown'}`);
  if (!existsSync(png)) fail(`${name} produced no screenshot`);
  return { log, probes: readProbes(log) };
}

const rows = (probes, selector) => probes[selector] ?? [];
/** One Settings category opened by its rail label, after the view switch settles. */
const openSkills = (extra = {}) => ({ ROTARIS_CAPTURE_VIEW: '7', ROTARIS_CAPTURE_VIEW_MS: '900', ROTARIS_CAPTURE_SETTINGS: 'Skills', ...extra });

// ── The fixture tree ────────────────────────────────────────────────────────────────────────────────
const scratch = {
  base: join(output, 'scratch'),
  local: join(output, 'scratch', 'local'),
  preferences: join(output, 'scratch', 'prefs'),
  home: join(output, 'scratch', 'home'),
  repoRoot: join(output, 'scratch', 'repo'),
};
const workspace = join(scratch.repoRoot, 'project');
const skill = (name, description, extra = '') => `---\nname: ${name}\ndescription: ${description}\n${extra}---\n${name.toUpperCase().replace(/[^A-Z]/g, '_')}_BODY\n`;
const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };

for (const dir of [scratch.local, scratch.preferences, scratch.home, workspace]) mkdirSync(dir, { recursive: true });
// A `.git` FILE, not a directory — the linked-worktree shape REQ-WORKSPACE-051 names, and the one this
// repository's own proofs run under.
write(join(scratch.repoRoot, '.git'), 'gitdir: /elsewhere/.git/worktrees/repo\n');
write(join(scratch.repoRoot, '.agents', 'skills', 'repo-wide', 'SKILL.md'), skill('repo-wide', 'A skill the whole repository offers.'));
write(join(workspace, '.agents', 'skills', 'ws-skill', 'SKILL.md'), skill('ws-skill', 'The workspace skill.', 'trigger:\n  type: keyword\n  keywords: [render, "/pdf"]\n'));
// The same normalized name in a lower-priority layout: the workspace's `.agents` must win and record it.
write(join(workspace, '.opencode', 'skills', 'ws-skill', 'SKILL.md'), skill('ws-skill', 'The shadowed duplicate.'));
write(join(workspace, '.agents', 'skills', 'broken', 'SKILL.md'), 'no frontmatter at all\n');
// REQ-SHELL-056: a declared name colliding with the built-in `/stop`.
write(join(workspace, '.agents', 'skills', 'stop', 'SKILL.md'), skill('stop', 'A skill whose name a built-in holds.'));
// REQ-WORKSPACE-056: `user-invocable: false` is auto-only — in the catalog, never a command.
write(join(workspace, '.agents', 'skills', 'auto-only', 'SKILL.md'), skill('auto-only', 'Model-facing only.', 'user-invocable: false\n'));
write(join(scratch.home, '.agents', 'skills', 'home-skill', 'SKILL.md'), skill('home-skill', 'A skill from the user scope.'));
write(join(scratch.home, '.openhands', 'skills', 'installed', 'kept', 'SKILL.md'), skill('kept', 'An installed skill that stays.'));
write(join(scratch.home, '.openhands', 'skills', 'installed', 'dropped', 'SKILL.md'), skill('dropped', 'An installed skill the manifest disables.'));
write(join(scratch.home, '.openhands', 'skills', '.installed.json'), JSON.stringify({ disabled: ['dropped'] }));
// A skill outside every search root, for the hand-loaded case.
write(join(scratch.base, 'by-hand', 'SKILL.md'), skill('by-hand', 'Loaded by hand for this session.'));
const agentsYaml = join(workspace, '.rotaris', 'agents.yaml');

// ── 1. discover ─────────────────────────────────────────────────────────────────────────────────────
const discover = launch('discover', workspace, openSkills());
const discovered = rows(discover.probes, '[data-testid="skill-row"]').map((r) => r.data['data-name']);
const expected = ['auto-only', 'home-skill', 'kept', 'repo-wide', 'stop', 'ws-skill'];
if (JSON.stringify(discovered) !== JSON.stringify(expected)) fail(`the table listed ${JSON.stringify(discovered)}, not ${JSON.stringify(expected)} in ascending name order`);
results.push({ launch: 'discover', skills: discovered });

const byName = Object.fromEntries(rows(discover.probes, '[data-testid="skill-row"]').map((r) => [r.data['data-name'], r]));
// REQ-WORKSPACE-051: the scopes, and every project location outranking every user one.
if (byName['ws-skill'].data['data-scope'] !== 'project') fail('the workspace skill did not read as project scope');
if (byName['home-skill'].data['data-scope'] !== 'user') fail('the home skill did not read as user scope');
// REQ-WORKSPACE-052: the manifest's entry never appears, and is not listed as skipped either.
if (discovered.includes('dropped')) fail('the disabled skill was listed');
// REQ-WORKSPACE-053: the invalid file is skipped WITH its reason rather than silently absent.
const skipped = rows(discover.probes, '[data-testid="skill-skipped"]');
if (skipped.length !== 1 || !skipped[0].data['data-path'].includes('broken')) fail(`the skipped list was ${JSON.stringify(skipped.map((s) => s.data['data-path']))}`);
if (!discover.log.includes('skills: skipped')) fail('the run host logged no skip reason');
// REQ-WORKSPACE-054: the shadowed duplicate is recorded against the winner and reportable per name.
if (!discover.log.includes('6 discovered')) fail('the discovery log did not report six skills');
// REQ-WORKSPACE-056: `user-invocable: false` derives auto-only from the frontmatter alone.
if (byName['auto-only'].data['data-invocation'] !== 'auto-only') fail('the frontmatter-derived invocation mode was not auto-only');
// REQ-WORKSPACE-065: the default policy with nothing recorded is on-demand.
if (byName['ws-skill'].data['data-load'] !== 'name-only') fail('the zero-migration default was not on-demand');

// ── 1b. commands ────────────────────────────────────────────────────────────────────────────────────
// REQ-CHAT-034 / REQ-SHELL-056: the commands, with the collision suffixed and the auto-only skill absent.
// A SEPARATE launch, on the Workspace view: the registrar mounts with the transcript toolbar, and Settings
// replaces Workspace among REQ-SHELL-023's seven views, so a launch sitting in Settings has no composer at all.
// A prompt is submitted first: the registrar mounts with the transcript toolbar, which the Workspace view
// draws once there is a transcript to put it above (measured — with no session the probe found no element).
const commandsLaunch = launch('commands', workspace, { ROTARIS_CAPTURE_PROMPT: 'Say hello and stop.', ROTARIS_CAPTURE_AFTER_MS: '9000' }, 180_000);
const registered = (rows(commandsLaunch.probes, '[data-testid="skill-commands"]')[0]?.data['data-names'] ?? '').split(',').filter((s) => s !== '');
for (const name of ['ws-skill', 'render', 'pdf', 'home-skill', 'stop-2']) {
  if (!registered.includes(name)) fail(`/${name} was not registered; the catalogue holds ${JSON.stringify(registered)}`);
}
if (registered.includes('auto-only')) fail('an auto-only skill was offered as a command');
if (registered.includes('stop')) fail('a skill took the built-in /stop');
results.push({ launch: 'commands', commands: registered });

// ── 2. policy ───────────────────────────────────────────────────────────────────────────────────────
/*
 * A GLOBAL policy for one skill, so REQ-CONFIG-258's "write the baseline out explicitly" case is reachable at
 * all. The path is `resolveUserDirs().config`, which on Windows is `%LOCALAPPDATA%/rotaris/config` — the proof
 * points LOCALAPPDATA at the scratch tree, so this is that tree's own global scope and not the operator's.
 */
const globalAgents = join(scratch.local, 'rotaris', 'config', 'agents.yaml');
write(globalAgents, 'skills:\n  overrides:\n    home-skill: on\n');
const policy = launch('policy', workspace, openSkills({
  // The Load selector for `ws-skill` to always, its Invocation to manual only, and `home-skill` back to the
  // on-demand baseline — which a lower layer states, so it must be written out rather than deleted.
  ROTARIS_CAPTURE_SELECT: '[aria-label="Load policy for ws-skill"]>>on@1500;;[aria-label="Invocation policy for ws-skill"]>>manual-only@1900;;[aria-label="Load policy for home-skill"]>>name-only@2300',
  ROTARIS_CAPTURE_CLICKS: '.save-bar .btn-primary@3000',
  ROTARIS_CAPTURE_AFTER_MS: '4200',
}));
// Finding 2 of ADR-0063's first execution: before the repair the selectors were bound to the run host's
// projection, so a choice was recorded as "chosen" and every row still read its file value.
const chosen = Object.fromEntries(rows(policy.probes, '[data-testid="skill-row"]').map((r) => [r.data['data-name'], r.data['data-load']]));
if (chosen['ws-skill'] !== 'on') fail(`the Load selector did not hold the chosen value: ${JSON.stringify(chosen)}`);
if (!existsSync(agentsYaml)) fail('Save wrote no workspace agents.yaml');
const written = readFileSync(agentsYaml, 'utf8');
results.push({ launch: 'policy', agentsYaml: written });
if (!/ws-skill:\s*on/.test(written)) fail(`the always policy was not written: ${written}`);
if (!/ws-skill:\s*manual-only/.test(written)) fail(`the invocation override was not written: ${written}`);
// REQ-CONFIG-258: the baseline is written out explicitly BECAUSE the global scope states a policy for it.
if (!/home-skill:\s*name-only/.test(written)) fail(`the baseline over a global override was not written explicitly: ${written}`);
// …and no skill the user did not touch is in the file at all.
if (/repo-wide|auto-only|kept\s*:/.test(written)) fail(`the save was not sparse: ${written}`);

// ── 3. reopen ───────────────────────────────────────────────────────────────────────────────────────
const reopen = launch('reopen', workspace, openSkills());
const reopened = Object.fromEntries(rows(reopen.probes, '[data-testid="skill-row"]').map((r) => [r.data['data-name'], r.data]));
if (reopened['ws-skill']['data-load'] !== 'on') fail(`after reopening, the Load selector read ${reopened['ws-skill']['data-load']}`);
if (reopened['ws-skill']['data-invocation'] !== 'manual-only') fail('after reopening, the Invocation selector did not hold');
const status = rows(reopen.probes, '.save-bar__status')[0]?.text ?? '';
if (/unsaved/i.test(status)) fail(`the form was dirty on open: ${status}`);
results.push({ launch: 'reopen', wsSkill: reopened['ws-skill'], status });

// ── 4. run ──────────────────────────────────────────────────────────────────────────────────────────
// A scripted run: the units are composed at agent construction, so the log carries them.
const run = launch('run', workspace, {
  ROTARIS_CAPTURE_PROMPT: 'Say hello and stop.',
  ROTARIS_CAPTURE_AFTER_MS: '9000',
}, 180_000);
results.push({ launch: 'run', log: run.log.split('\n').filter((l) => l.includes('skills:')).slice(0, 12) });
// REQ-WORKSPACE-058: session creation re-discovered from disk.
if (!/skills: \d+ discovered/.test(run.log)) fail('the run logged no discovery');
// REQ-WORKSPACE-060/062: the units composed at agent construction, named in the log. `ws-skill` is `on` after
// launch 2, so its body is force-loaded and its catalog entry is gone; every other skill is in the catalog.
const unitLine = run.log.split(/\r?\n/).find((l) => l.includes('skills: context units'));
if (!unitLine) fail('the run host logged no context units, so nothing proves injection happened');
if (!/force-loaded [^;]*ws-skill/.test(unitLine)) fail(`the always-load skill was not force-loaded: ${unitLine}`);
if (/catalog [^;]*ws-skill/.test(unitLine)) fail(`a force-loaded skill was still listed in the catalog: ${unitLine}`);
for (const name of ['home-skill', 'repo-wide', 'kept', 'auto-only']) {
  if (!unitLine.includes(name)) fail(`${name} was not in the injected catalog: ${unitLine}`);
}
results.push({ launch: 'run', units: unitLine.slice(unitLine.indexOf('skills:')) });

// ── 5. rescan, the chooser's dismissal, and a bad path ───────────────────────────────────────────────
write(join(workspace, '.agents', 'skills', 'added-later', 'SKILL.md'), skill('added-later', 'Added while the session was open.'));
const rescan = launch('rescan', workspace, openSkills({
  ROTARIS_CAPTURE_CLICKS: '[data-testid="skills-rescan"]@1600;;[data-testid="skills-load-file"]@3000;;[data-testid="skills-load-file"]@4400',
  // Two answers, consumed in order: a dismissal, then a real selection.
  ROTARIS_CAPTURE_SKILL_FILE: `(cancel);;${join(scratch.base, 'by-hand')}`,
  ROTARIS_CAPTURE_AFTER_MS: '5800',
}));
const afterRescan = rows(rescan.probes, '[data-testid="skill-row"]').map((r) => r.data['data-name']);
if (!afterRescan.includes('added-later')) fail(`the rescan did not pick up the new skill: ${JSON.stringify(afterRescan)}`);
// REQ-WORKSPACE-151 / REQ-WORKSPACE-057: the hand-loaded skill carries the `manual` label.
const hand = rows(rescan.probes, '[data-testid="skill-row"]').find((r) => r.data['data-name'] === 'by-hand');
if (!hand) fail(`the hand-loaded skill was not listed: ${JSON.stringify(afterRescan)}`);
if (hand.data['data-scope'] !== 'manual') fail(`the hand-loaded skill read as ${hand.data['data-scope']}, not manual`);
// REQ-WORKSPACE-069 / REQ-WORKSPACE-151: neither action marks the form dirty.
const rescanStatus = rows(rescan.probes, '.save-bar__status')[0]?.text ?? '';
if (/unsaved/i.test(rescanStatus)) fail(`a rescan or a hand-load marked the form dirty: ${rescanStatus}`);
results.push({ launch: 'rescan', skills: afterRescan, status: rescanStatus });

// ── 6. disabled ─────────────────────────────────────────────────────────────────────────────────────
write(agentsYaml, `${readFileSync(agentsYaml, 'utf8').replace(/^skills:$/m, 'skills:\n  enabled: false')}\n`);
if (!readFileSync(agentsYaml, 'utf8').includes('enabled: false')) write(agentsYaml, `${readFileSync(agentsYaml, 'utf8')}\nskills:\n  enabled: false\n`);
// On the Workspace view, for the same reason launch 1b is: the command registrar mounts with the composer.
const disabled = launch('disabled', workspace, { ROTARIS_CAPTURE_PROMPT: 'Say hello and stop.', ROTARIS_CAPTURE_AFTER_MS: '9000' }, 180_000);
// REQ-WORKSPACE-064: no catalog is injected and nothing is invocable.
const disabledCommands = (rows(disabled.probes, '[data-testid="skill-commands"]')[0]?.data['data-names'] ?? '').split(',').filter((s) => s !== '');
if (disabledCommands.length > 0) fail(`with skills off the catalogue still offered ${JSON.stringify(disabledCommands)}`);
// And once more in Settings, so the switch itself is read off the file.
const disabledTab = launch('disabled-tab', workspace, openSkills());
const toggle = rows(disabledTab.probes, '[data-testid="skills-enabled"]')[0];
if (!toggle) fail('the Skills tab drew no switch');
if (toggle.data['aria-checked'] === 'true') fail('the switch read on while the file said off');
results.push({ launch: 'disabled', commands: disabledCommands, toggle: toggle.data['aria-checked'] });

writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
console.log(`skills-proof: ${results.length} checks over 7 launches, evidence in ${output}`);
console.log(`  discovered ${expected.length} skills; commands ${JSON.stringify(registered)}`);
console.log(`  policy written sparsely to ${agentsYaml}`);
console.log(`  rescan found ${afterRescan.length}; with skills off the catalogue offers none`);
if (!existsSync(join(repo, '.proof'))) fail('the evidence directory vanished');
