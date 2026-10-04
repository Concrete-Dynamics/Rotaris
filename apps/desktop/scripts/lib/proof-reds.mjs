import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';

/**
 * The evidence of a red, kept where the next run does not remove it. A proof that starts by clearing its output
 * directory loses each red's logs and screenshots to the run after it, so on 2026-10-03 the evidence of
 * `slice-proof`'s three reds survived only because they were copied out by hand
 * (`docs/defects/fixed/slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md`).
 */

/** The host's load averages (1, 5 and 15 minutes), two decimals: a timing red is judged beside the load it ran under. */
export const hostLoad = () => loadavg().map((v) => Math.round(v * 100) / 100);

/**
 * Copies every file of `output` into `<reds>/<stamp>-<scenario>/`, beside a `red.json` that names the scenario, the error
 * (passed through `redact`, so no secret reaches it), the commit, the load and the results gathered so far. Returns the
 * directory. Never throws for an `output` that does not exist yet: the red is still recorded.
 */
export function keepRed({ output, reds, scenario, error, results = null, commit = null, redact = (t) => t, at = new Date(), load = hostLoad() }) {
  const dir = join(reds, `${at.toISOString().replace(/[:.]/g, '-')}-${scenario}`);
  mkdirSync(dir, { recursive: true });
  const kept = [];
  if (existsSync(output)) {
    for (const name of readdirSync(output)) {
      const from = join(output, name);
      if (!statSync(from).isFile()) continue;
      copyFileSync(from, join(dir, name));
      kept.push(name);
    }
  }
  const message = redact(error instanceof Error ? (error.stack ?? error.message) : String(error));
  writeFileSync(join(dir, 'red.json'), `${JSON.stringify({ scenario, error: message, at: at.toISOString(), commit, load, kept, results }, null, 2)}\n`);
  return dir;
}
