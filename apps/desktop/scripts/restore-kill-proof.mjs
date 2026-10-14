/**
 * restore-kill-proof — the kill-in-the-gap case of ADR-0058's restore (docs/architecture/README.md B2), measured with real
 * processes and a real kill: what a restore leaves behind when the process running it dies between its two renames (step 8
 * displaces the target store, step 9 installs the staging copy), and what the workspace service's next open makes of it.
 *
 * Not a launch of the application: the restore runs in the workspace service, which is a plain Node process around
 * `restoreStore`, so the harness runs `restoreStore` in a plain Node child — `packages/store/src/restore-kill.child.ts`,
 * bundled here with esbuild from the same sources (the way `terminal-proof.mjs` bundles its page) — and kills it with
 * SIGKILL once the child reports, through a marker file written by the `betweenRenames` hook, that step 8 is done and step
 * 9 has not begun. No display is needed.
 *
 * Each trial: seed a store holding two sessions; take an artifact of a store holding one other session; restore it in the
 * child and kill the child in the gap; survey the workspaces root (each entry, each store's sessions, quick_check and
 * bytes); then open the workspace the way the workspace service does (`openWorkspaceStore`) and survey again.
 *
 * The verdict FAILs when the harness did not measure what it says: the child was not killed in the gap, or the disk is not
 * the state the mechanism's model gives for that point (the target name empty, the restore's journal beside it, the
 * displaced store whole with both sessions, the staging store whole with the artifact's). Since OQ-266's ruling
 * (2026-10-13, R-072; built 2026-10-14) it also FAILs unless the next open put the displaced store back: the open lists the
 * two previous sessions and migrated nothing, says what it reversed (`cutRestore`), the reinstated `workspace.db` is byte
 * for byte the one that was displaced, the journal is gone, and the staging copy is kept. Until then (fin41, 2026-10-13)
 * what the next open did was a FINDING only: an empty store, created and migrated from 0, in 10 of 10.
 *
 * Evidence under `.proof/restore-kill-proof/` (`results.json`); `--trials=N` (default 10).
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const output = resolve(repo, '.proof', 'restore-kill-proof');
if (relative(repo, output).startsWith(`..${sep}`) || relative(repo, output) === '..') throw new Error(`proof output escaped the repository: ${output}`);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const trials = Number((process.argv.find((a) => a.startsWith('--trials=')) ?? '--trials=10').slice('--trials='.length));
if (!Number.isInteger(trials) || trials < 1) throw new Error('--trials must be a positive whole number');

// ── The child, bundled from the store's own sources ────────────────────────────────────────────────────────────────
// Under `out/`, which the lint's ignore list covers (`**/out/**`). `better-sqlite3` stays external: the bundle sits inside
// the repository, so Node resolves the binding from the repository's `node_modules`, the one the tests load.
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const child = join(output, 'out', 'restore-kill-child.cjs');
const alias = Object.fromEntries(['kernel', 'platform', 'contracts', 'store'].map((name) => [`@rotaris/${name}`, join(repo, 'packages', name, 'src', 'index.ts')]));
await esbuild.build({
  entryPoints: [join(repo, 'packages', 'store', 'src', 'restore-kill.child.ts')],
  bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: child, alias, external: ['better-sqlite3'], logLevel: 'warning',
});

function run(command, args) {
  const r = spawnSync(process.execPath, [child, command, JSON.stringify(args)], { encoding: 'utf8', timeout: 60_000 });
  if (r.status !== 0) throw new Error(`${command} failed (${r.status ?? r.signal}): ${r.stderr}`);
  return JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1));
}

/** The restore in a child, killed with SIGKILL the moment its marker says it is between the two renames. */
function killInTheGap(args) {
  return new Promise((resolveKill, reject) => {
    const started = Date.now();
    const proc = spawn(process.execPath, [child, 'restore', JSON.stringify(args)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    let killedAt = null;
    const poll = setInterval(() => {
      if (killedAt === null && existsSync(args.marker)) { killedAt = Date.now() - started; proc.kill('SIGKILL'); }
      if (killedAt === null && Date.now() - started > 60_000) { clearInterval(poll); proc.kill('SIGKILL'); reject(new Error('the restore never reached the gap within 60 s')); }
    }, 2);
    proc.on('exit', (code, signal) => { clearInterval(poll); resolveKill({ code, signal, killedAtMs: killedAt, stdout: stdout.trim(), stderr: stderr.trim() }); });
    proc.on('error', (e) => { clearInterval(poll); reject(e); });
  });
}

const ID = '000000000000000000000000000000ab';
const results = { generatedAt: new Date().toISOString(), platform: process.platform, node: process.version, trials: [] };
const failures = [];
for (let t = 1; t <= trials; t++) {
  const dir = join(output, `trial-${t}`);
  const root = join(dir, 'workspaces');
  mkdirSync(root, { recursive: true });
  run('seed', { root, id: ID, sessions: ['S-old-1', 'S-old-2'] });
  const artifact = join(dir, 'backup.tar');
  run('artifact', { file: artifact, id: ID, sessions: ['S-from-backup'] });
  const kill = await killInTheGap({ root, id: ID, artifact, marker: join(dir, 'between-renames.marker') });
  const survey = run('survey', { root, id: ID });
  const reopen = run('reopen', { root, id: ID, workspace: join(dir, 'project') });
  const after = run('survey', { root, id: ID });
  const names = Object.keys(survey.stores).filter((n) => survey.stores[n] !== null);
  const displaced = names.find((n) => n.includes('.displaced-'));
  const staging = names.find((n) => n.endsWith('.restoring-1'));
  const target = names.find((n) => !n.includes('.'));
  const SID = survey.id; // the identifier as minted, the store's directory name
  const journal = `${SID}.restore-pending`;
  const trial = { trial: t, kill: { signal: kill.signal, killedAtMs: kill.killedAtMs, completed: kill.stdout !== '' }, survey, reopen, after };
  results.trials.push(trial);
  const wrong = [];
  if (kill.signal !== 'SIGKILL' || kill.stdout !== '') wrong.push(`the child was not killed in the gap (signal ${kill.signal}, output ${kill.stdout || 'none'})`);
  if (target !== undefined) wrong.push(`the target name holds ${target}`);
  const whole = (facts, sessions) => facts !== undefined && facts !== null && JSON.stringify(facts.sessions) === JSON.stringify(sessions) && facts.quickCheck === 'ok';
  if (!displaced || !whole(survey.stores[displaced], ['S-old-1', 'S-old-2'])) wrong.push(`the displaced store is not whole: ${JSON.stringify(displaced ? survey.stores[displaced] : null)}`);
  if (!staging || !whole(survey.stores[staging], ['S-from-backup'])) wrong.push(`the staging store is not whole: ${JSON.stringify(staging ? survey.stores[staging] : null)}`);
  if (!survey.entries.includes(journal)) wrong.push(`no journal (${journal}) beside the empty target`);
  // OQ-266: the next open puts the displaced store back, byte for byte, and creates nothing.
  if (JSON.stringify(reopen.sessions) !== JSON.stringify(['S-old-1', 'S-old-2'])) wrong.push(`the next open listed ${JSON.stringify(reopen.sessions)}, not the two previous sessions`);
  if (reopen.migration.kind !== 'unchanged') wrong.push(`the next open migrated (${JSON.stringify(reopen.migration)}): a store was created`);
  if (!reopen.cutRestore || !displaced || !reopen.cutRestore.reversed?.endsWith(displaced) || reopen.cutRestore.hadStore !== true) wrong.push(`the next open did not say it reversed ${displaced}: ${JSON.stringify(reopen.cutRestore)}`);
  const reinstated = after.stores[SID];
  if (!displaced || !reinstated || reinstated.sha256 !== survey.stores[displaced]?.sha256) wrong.push(`the reinstated workspace.db is not the displaced one byte for byte (${reinstated?.sha256 ?? 'absent'} against ${displaced ? survey.stores[displaced]?.sha256 : 'none'})`);
  if (after.entries.includes(journal)) wrong.push('the journal is still there after the next open');
  if (!after.entries.includes(`${SID}.restoring-1`)) wrong.push('the staging copy was not kept');
  if (wrong.length > 0) failures.push(`trial ${t}: ${wrong.join('; ')}`);
  console.log(`trial ${t}: killed at ${kill.killedAtMs} ms by ${kill.signal}; left ${survey.entries.filter((n) => n.startsWith(SID)).join(', ')}; the next open: ${reopen.migration.kind}${reopen.migration.from === undefined ? '' : ` from ${reopen.migration.from}`}, ${reopen.sessions.length} session(s), reversed ${reopen.cutRestore?.reversed ? 'the displaced store' : 'nothing'}; after it: ${after.entries.filter((n) => n.startsWith(SID)).join(', ')}`);
}

const opened = results.trials.map((t) => t.reopen);
results.finding = {
  nextOpenCreatedAnEmptyStore: opened.filter((o) => o.migration.kind === 'migrated' && o.migration.from === 0 && o.sessions.length === 0).length,
  nextOpenPutTheStoreBack: results.trials.filter((t) => JSON.stringify(t.reopen.sessions) === JSON.stringify(['S-old-1', 'S-old-2']) && t.reopen.cutRestore?.reversed).length,
  reinstatedByteIdentical: results.trials.filter((t) => { const d = Object.keys(t.survey.stores).find((n) => n.includes('.displaced-')); return d !== undefined && t.after.stores[t.survey.id]?.sha256 === t.survey.stores[d]?.sha256; }).length,
  trials,
};
results.verdict = failures.length === 0 ? 'PASS' : 'FAIL';
results.failures = failures;
writeFileSync(join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(`OQ-266: the next open put the displaced store back in ${results.finding.nextOpenPutTheStoreBack} of ${trials}, byte-identical in ${results.finding.reinstatedByteIdentical} of ${trials}; it created an empty store in ${results.finding.nextOpenCreatedAnEmptyStore} of ${trials}.`);
console.log(`${results.verdict}${failures.length > 0 ? `\n${failures.join('\n')}` : ''} — evidence in ${relative(repo, output)}`);
process.exitCode = failures.length === 0 ? 0 : 1;
