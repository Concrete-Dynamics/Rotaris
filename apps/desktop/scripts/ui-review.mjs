/**
 * `pnpm ui-review` — deterministic evidence pack for an external, report-only UI critic.
 *
 * The command invokes no model. It records rendered ground truth and caps a review
 * series at three iterations. `$review-ui` turns the pack into `critique.json`.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { repo } from './lib/harness.mjs';

const argv = process.argv.slice(2).filter((value) => value !== '--');
const flag = (name) => argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const allowedStatuses = new Set(['proposed', 'approved', 'implemented', 'verified-resolved', 'partial']);
const allowedCategories = new Set(['design-quality', 'originality', 'craft', 'functionality', 'deterministic']);
const allowedSeverities = new Set(['high', 'medium', 'low']);

function validateCritique(path) {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  const errors = [];
  if (value.version !== 1) errors.push('version must be 1');
  if (typeof value.revision !== 'string' || value.revision === '') errors.push('revision is required');
  if (!Number.isInteger(value.iteration) || value.iteration < 1 || value.iteration > 3) errors.push('iteration must be 1..3');
  if (typeof value.summary !== 'string') errors.push('summary must be a string');
  if (!Array.isArray(value.findings)) errors.push('findings must be an array');
  else value.findings.forEach((finding, index) => {
    const at = `findings[${index}]`;
    if (typeof finding.id !== 'string' || finding.id === '') errors.push(`${at}.id is required`);
    if (!allowedStatuses.has(finding.status)) errors.push(`${at}.status is outside the evidence lifecycle`);
    if (!allowedCategories.has(finding.category)) errors.push(`${at}.category is outside the review categories`);
    if (!allowedSeverities.has(finding.severity)) errors.push(`${at}.severity is outside high, medium, low`);
    for (const key of ['surface', 'observation', 'recommendation']) if (typeof finding[key] !== 'string' || finding[key] === '') errors.push(`${at}.${key} is required`);
    if (!Array.isArray(finding.evidence) || finding.evidence.length === 0 || finding.evidence.some((item) => typeof item !== 'string')) errors.push(`${at}.evidence requires file references`);
  });
  if (errors.length > 0) {
    process.stderr.write(`Critique validation failed:\n${errors.join('\n')}\n`);
    process.exitCode = 1;
  } else process.stdout.write(`Critique valid: ${value.findings.length} finding(s)\n`);
}

const validation = flag('validate');
if (validation !== undefined) {
  validateCritique(resolve(repo, validation));
  process.exit();
}

const iteration = Number(flag('iteration') ?? '1');
if (!Number.isInteger(iteration) || iteration < 1 || iteration > 3) throw new Error('ui-review iteration must be 1, 2, or 3');
const revisionResult = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: repo, encoding: 'utf8' });
if (revisionResult.status !== 0) throw new Error(`unable to identify revision: ${revisionResult.stderr}`);
const revision = revisionResult.stdout.trim();
const output = join(repo, '.ui-review', revision, `iteration-${iteration}`);
/**
 * An iteration that already carries a critique is not re-runnable.
 *
 * `ui-audit` empties its output directory before it captures, which is right for evidence and fatal
 * for the one file in there that is NOT evidence: a critic's `critique.json` is the only record of a
 * reading, it took a whole pass to produce, and re-running the same iteration deleted one on
 * 2026-09-13 — the ninety-ninth defect, found by running the loop rather than by reading it. Pass
 * `--reshoot` to say the loss is intended.
 */
if (existsSync(join(output, 'critique.json')) && !argv.includes('--reshoot')) {
  throw new Error(`iteration ${iteration} already holds a critique (${join(output, 'critique.json')}); capture a new iteration, or pass --reshoot to discard it`);
}
const audit = join(repo, 'apps', 'desktop', 'scripts', 'ui-audit.mjs');
// `--reshoot` is the only way a critique is allowed to die: the refusal above passes, and the capture is
// told to discard rather than preserve it. Without the flag `ui-audit` carries it across its own wipe.
const forwarded = [
  ...argv.filter((value) => value !== `--iteration=${iteration}` && value !== '--reshoot' && !value.startsWith('--validate=')),
  ...(argv.includes('--reshoot') ? ['--discard-critique'] : []),
];
const run = spawnSync(process.execPath, [audit, `--output=${output}`, ...forwarded], { cwd: repo, stdio: 'inherit' });
if (run.status !== 0) process.exit(run.status ?? 1);

const report = JSON.parse(readFileSync(join(output, 'report.json'), 'utf8'));
const dirty = spawnSync('git', ['diff', '--quiet'], { cwd: repo }).status !== 0;
const files = readdirSync(output, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
/**
 * The previous iteration's critique, which is almost never under this revision.
 *
 * Acting on a finding changes the source, which changes `HEAD`, which changes the directory the
 * next pack is written to — so keying the chain on the revision alone breaks it on exactly the
 * round where something was repaired, and a three-iteration series would never link once. The
 * pack keeps the revision it was shot at, because that is its provenance; the chain is found by
 * looking across revisions for the newest `iteration-(N-1)/critique.json`.
 */
function previousIterationCritique(n) {
  if (n <= 1) return null;
  const root = join(repo, '.ui-review');
  if (!existsSync(root)) return null;
  const candidates = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name, `iteration-${n - 1}`, 'critique.json'))
    .filter((candidate) => existsSync(candidate))
    .map((candidate) => ({ candidate, at: statSync(candidate).mtimeMs }))
    .sort((a, b) => b.at - a.at);
  return candidates[0]?.candidate ?? null;
}
const previousCritique = previousIterationCritique(iteration);
const byKind = report.findings.reduce((acc, finding) => ({ ...acc, [finding.kind]: (acc[finding.kind] ?? 0) + 1 }), {});
const manifest = {
  version: 1,
  revision,
  dirty,
  iteration,
  iterationLimit: 3,
  evidenceStatus: 'verified',
  criticStatus: 'pending',
  generatedAt: new Date().toISOString(),
  // What ground the pack was captured on. A critique that names a contrast is answerable only
  // against a named palette, and a screenshot does not say which one it is.
  captured: { theme: report.theme ?? null, sizes: report.sizes ?? [], views: report.views ?? [] },
  deterministic: { findings: report.findings.length, byKind },
  files,
  previousCritique: previousCritique === null ? null : relative(output, previousCritique).replaceAll('\\', '/'),
};
writeFileSync(join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(output, 'critic-input.json'), `${JSON.stringify({
  version: 1,
  revision,
  iteration,
  role: 'report-only',
  categories: ['design-quality', 'originality', 'craft', 'functionality', 'deterministic'],
  evidence: { screenshots: files.filter((file) => file.endsWith('.png')), geometry: 'geometry.json', styles: 'styles.json', deterministic: 'report.json', manifest: 'manifest.json' },
  output: 'critique.json',
  schema: '.agents/skills/review-ui/references/critique-schema.md',
}, null, 2)}\n`);
process.stdout.write(`UI review iteration ${iteration}/3 ready at ${output}\n`);
