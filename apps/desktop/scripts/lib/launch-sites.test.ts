/**
 * The two platform rules of R-062's proof sweep, kept by a scan of every script that could break them.
 *
 * Both rules live in `harness.mjs`, and both were broken by scripts that spelled their own answer:
 *
 *   1. **The scratch global configuration directory comes from `configDirFor`.** Twelve scripts spelled
 *      `join(local, 'rotaris', 'config')`, which was then the Windows answer only; off Windows the product never read what
 *      those proofs wrote (REQ-CONFIG-001, REQ-STARTUP-145). `proof-isolation.test.ts` keeps `configDirFor` in step with
 *      the product's `resolveUserDirs`; this file keeps every script on `configDirFor`.
 *   2. **Every launch of Electron carries `hostSwitches`, and carries it where no positional reader sees it.** As root,
 *      Chromium refuses to start without `--no-sandbox`, so a launch without the switch dies with SIGTRAP. Electron
 *      also keeps a Chromium switch in `process.argv`, so a script whose own entry destructures its positional
 *      arguments reads the switch as one of them: `traceability-proof`'s driver took `--no-sandbox` for the service
 *      bundle it forks. Chromium honours a switch anywhere before a bare `--`, so the rule is: before any `'--'`, and
 *      after every positional argument unless the entry is the product's own main, whose `workspaceFromArgv` skips a
 *      switch. A launch with `ELECTRON_RUN_AS_NODE` starts no Chromium and is exempt.
 *   3. **A launch of the reserved token keeps the token first** (REQ-MCP-033): the sentinel (`src/main/sentinel.ts`)
 *      reads it at one fixed index — the argument right after the entry on the development binary, the first on a
 *      packaged one — so the switch goes between the token and `--`, the product's own order
 *      (`src/run-host/code-intelligence-launch.ts`). Rule 2 admits the switch ahead of the token too, and
 *      `code-intel-proof` put it there: as root the application started instead of the server
 *      (`docs/defects/fixed/code-intel-proofs-branch-launch-puts-the-sandbox-switch-ahead-of-the-token.md`).
 *   4. **No launch of Electron goes through `spawnSync`.** Its `timeout` cannot end a launch: Node signals the child and
 *      closes its ends of the pipes at the same moment, then waits for an exit without a bound, so a launch that overran
 *      hung its proof instead of failing it. Every launch is `spawnBounded`'s (`lib/bounded-launch.mjs`: SIGTERM with the
 *      pipes open, a grace, SIGKILL to the group, reported with the log tail) or the driver's
 *      (`docs/defects/fixed/proofs-launched-through-spawnsync-cannot-end-an-overrun-launch.md`). A launch with
 *      `ELECTRON_RUN_AS_NODE` starts no application and no quit path, and is exempt here as under rule 2.
 *
 * This is a static scan, not a launch: it reads the scripts' text, so it is decidable on any host and in `pnpm check`.
 * What it does not measure is that Chromium honours the switch where the rule puts it; the proofs measure that.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const SCRIPTS = resolve(import.meta.dirname, '..');
const HARNESS = join(SCRIPTS, 'lib', 'harness.mjs');

function scripts(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === 'fixtures' ? [] : scripts(path);
    return /\.(mjs|cjs)$/.test(name) ? [path] : [];
  });
}

/** From `open` (an opening bracket), the index of its matching close, skipping string and template literals. */
function matching(text: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const stack: string[] = [];
  for (let i = open; i < text.length; i += 1) {
    const c = text[i]!;
    if (c === "'" || c === '"' || c === '`') {
      for (i += 1; i < text.length && text[i] !== c; i += 1) if (text[i] === '\\') i += 1;
      continue;
    }
    if (c in pairs) stack.push(pairs[c]!);
    else if (c === stack.at(-1)) { stack.pop(); if (stack.length === 0) return i; }
  }
  throw new Error(`no match for the bracket at ${open}`);
}

/** The top-level elements of an array literal's inner text. */
function elements(inner: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i]!;
    if ('([{'.includes(c)) { i = matching(inner, i); continue; }
    if (c === "'" || c === '"' || c === '`') { for (i += 1; i < inner.length && inner[i] !== c; i += 1) if (inner[i] === '\\') i += 1; continue; }
    if (c === ',') { out.push(inner.slice(start, i).trim()); start = i + 1; }
  }
  const last = inner.slice(start).trim();
  if (last !== '') out.push(last);
  return out;
}

interface Launch { readonly file: string; readonly binary: string; readonly args: string[] | null; readonly call: string }

/**
 * Every `spawn`/`spawnSync`/`spawnBounded` of the development Electron binary (`electron`) or a packaged one (`exe`).
 * `spawnBounded` (`lib/bounded-launch.mjs`) is a launch like the other two — it passes its arguments to `spawn` as
 * given — so a script moved onto it must carry the switch there, and the scan must see it or the count drops.
 */
function launches(file: string, text: string): Launch[] {
  const found: Launch[] = [];
  for (const m of text.matchAll(/\b(?:spawn|spawnSync|spawnBounded)\(\s*(electron|exe)\s*,\s*/g)) {
    // The call's text up to its first `);` is enough to see an `ELECTRON_RUN_AS_NODE` option; bracket-matching the
    // whole call would have to parse the regular expressions some options hold.
    const end = text.indexOf(');', m.index!);
    const call = text.slice(m.index!, end === -1 ? undefined : end + 2);
    const at = m.index! + m[0].length;
    const args = text[at] === '[' ? elements(text.slice(at + 1, matching(text, at))) : resolveIdentifier(text, /^\w+/.exec(text.slice(at))![0]);
    found.push({ file, binary: m[1]!, args, call });
  }
  return found;
}

/**
 * An argument list passed by name: the literal the file binds it to (`const args = [...]`), or — when it is a
 * function's parameter, as in `live-run`'s `runElectron(args, …)` — the literal at every call of that function,
 * which must agree. `null` when the scan cannot see the list, which the test treats as a failure.
 */
function resolveIdentifier(text: string, id: string): string[] | null {
  const bound = new RegExp(`\\b(?:const|let)\\s+${id}\\s*=\\s*\\[`).exec(text);
  if (bound) { const open = bound.index + bound[0].length - 1; return elements(text.slice(open + 1, matching(text, open))); }
  const param = new RegExp(`function\\s+(\\w+)\\s*\\(\\s*${id}\\b`).exec(text);
  if (!param) return null;
  const calls = [...text.matchAll(new RegExp(`\\b${param[1]}\\(\\s*\\[`, 'g'))].map((c) => {
    const open = c.index + c[0].length - 1;
    return elements(text.slice(open + 1, matching(text, open)));
  });
  if (calls.length === 0 || calls.some((c) => JSON.stringify(c) !== JSON.stringify(calls[0]))) return null;
  return calls[0]!;
}

/** The product's own main entry, whose workspace reader skips a switch (`apps/desktop/src/main/index.ts`). */
const productMain = (element: string): boolean =>
  element === 'mainEntry' || element === '...before' || /join\(app, 'out', 'main', 'index\.js'\)/.test(element);

/** What is wrong with one launch's argument list, or null. */
function launchProblem(launch: Launch): string | null {
  if (/ELECTRON_RUN_AS_NODE/.test(launch.call)) return null;
  if (launch.args === null) return 'its argument list is not a literal the scan can read';
  const at = launch.args.indexOf('...hostSwitches');
  if (at === -1) return 'it does not carry `...hostSwitches`';
  const dashes = launch.args.findIndex((a) => a === "'--'");
  if (dashes !== -1 && at > dashes) return "`...hostSwitches` follows a bare '--', where Chromium no longer reads a switch";
  // A packaged binary's first argument is its own; the development binary's first is the entry it runs.
  if (launch.binary === 'electron' && !productMain(launch.args[0]!) && at !== launch.args.length - 1) {
    return `\`...hostSwitches\` precedes a positional argument of ${launch.args[0]}, which reads it as one`;
  }
  // Rule 3: the reserved token sits at the sentinel's fixed index — first, or right after the product's main entry.
  const token = launch.args.findIndex(isToken);
  if (token > 0 && !(token === 1 && productMain(launch.args[0]!))) {
    return `the reserved token follows ${launch.args[token - 1]}, not the entry; the sentinel reads it at one fixed index (REQ-MCP-033)`;
  }
  return null;
}

/** The reserved token of REQ-MCP-033, spelled as the literal or as the scripts' `TOKEN` constant. */
const isToken = (element: string): boolean => element === 'TOKEN' || element === "'builtin:code-intelligence'";

const all = scripts(SCRIPTS);

describe('R-062: the proof harness platform rules, kept at every script', () => {
  it('no script but the harness spells the scratch global configuration directory itself (REQ-CONFIG-001, REQ-STARTUP-145)', () => {
    // Both Windows spellings are refused: `rotaris\config` (the product's until 2026-09-29) and REQ-CONFIG-001's
    // `rotaris\rotaris`, which `configDirFor` answers since.
    const spelled = all.filter((f) => f !== HARNESS && /['"]rotaris['"]\s*,\s*['"](?:config|rotaris)['"]/.test(readFileSync(f, 'utf8')));
    expect(spelled.map((f) => relative(SCRIPTS, f))).toEqual([]);
  });

  it('no script but the harness spells the data directory itself (REQ-PROVIDER-014; rule 1 for the data directory)', () => {
    // `<local>/rotaris/data` is the Windows answer only: off Windows the data directory is `<XDG_DATA_HOME>/rotaris`.
    // `slice-proof` waited on, and checked the sign-out against, a credential file at that spelling the product never
    // wrote off Windows, and `code-intel-proof` kept a code-intelligence home the product never used there
    // (`docs/defects/fixed/slice-proof-and-code-intel-proof-spell-the-windows-data-directory-on-every-platform.md`).
    // `dataDirFor`, `tokensDirFor`, `workspacesRootFor` and `machineIdFileFor` answer it by platform.
    const spelled = all.filter((f) => f !== HARNESS && /['"]rotaris['"]\s*,\s*['"]data['"]/.test(readFileSync(f, 'utf8')));
    expect(spelled.map((f) => relative(SCRIPTS, f))).toEqual([]);
  });

  it('every launch of Electron carries hostSwitches where Chromium reads it and no positional reader does', () => {
    const found = all.flatMap((f) => launches(relative(SCRIPTS, f).split(sep).join('/'), readFileSync(f, 'utf8')));
    // The scan must be seeing the launches at all, or the next assertion is vacuous. On 2026-09-28 it sees 42 spawn
    // sites in 40 files: 41 carrying the switch (the driver's among them) and `build-hooks.cjs`'s node-mode probe.
    // `resilience-proof`'s launch is a `spawnBounded` since the same day, and still one of the 42.
    expect(found.length).toBeGreaterThanOrEqual(42);
    expect(found.map((l) => l.file)).toEqual(expect.arrayContaining(['lib/driver.mjs', 'traceability-proof.mjs', 'live-run.mjs', 'resilience-proof.mjs']));
    const problems = found.map((l) => [l.file, launchProblem(l)]).filter(([, p]) => p !== null);
    expect(problems).toEqual([]);
  });

  it('the scan fails the three shapes the rule forbids, including traceability-proof as it was', () => {
    const call = (args: string) => launches('fixture.mjs', `spawnSync(electron, ${args}, { env });`)[0]!;
    expect(launchProblem(call("[join(app, 'out', 'main', 'index.js'), workspace]"))).toMatch(/does not carry/);
    expect(launchProblem(call("[driver, ...hostSwitches, join(app, 'out', 'main', 'workspace-service.js'), fixture, scale, out]"))).toMatch(/precedes a positional argument of driver/);
    expect(launchProblem(call("[...before, TOKEN, '--', ...hostSwitches, ...tail]"))).toMatch(/follows a bare '--'/);
    // And passes what the rule allows: the product's main takes the switch anywhere; a driver's goes last.
    expect(launchProblem(call("[join(app, 'out', 'main', 'index.js'), ...hostSwitches, workspace]"))).toBeNull();
    expect(launchProblem(call("[driver, join(app, 'out', 'main', 'workspace-service.js'), fixture, ...hostSwitches]"))).toBeNull();
    expect(launchProblem(launches('fixture.cjs', "spawnSync(exe, [probe, dir], { env: { ELECTRON_RUN_AS_NODE: '1' } });")[0]!)).toBeNull();
  });

  it('no launch of Electron goes through spawnSync, whose timeout cannot end an overrun launch (rule 4)', () => {
    const found = all.flatMap((f) => launches(relative(SCRIPTS, f).split(sep).join('/'), readFileSync(f, 'utf8')));
    const unbounded = found.filter((l) => l.call.startsWith('spawnSync(') && !/ELECTRON_RUN_AS_NODE/.test(l.call)).map((l) => l.file);
    expect(unbounded).toEqual([]);
    // Not vacuous: the scan sees the bounded launches, and it sees a `spawnSync` launch where one is written.
    expect(found.filter((l) => l.call.startsWith('spawnBounded(')).length).toBeGreaterThanOrEqual(36);
    expect(launches('fixture.mjs', "const r = spawnSync(electron, [mainEntry, ...hostSwitches, ws], { timeout: 1 });")[0]!.call).toMatch(/^spawnSync\(/);
  });

  it('a launch of the reserved token keeps it at the sentinel\'s index, the switch after it, including code-intel-proof as it was (REQ-MCP-033)', () => {
    const call = (binary: string, args: string) => launches('fixture.mjs', `spawn(${binary}, ${args}, { env });`)[0]!;
    // code-intel-proof's branch launch before the repair: rule 2 passed it, and as root the application started instead.
    expect(launchProblem(call('exe', "[...before, ...hostSwitches, TOKEN, '--', ...tail]"))).toMatch(/reserved token follows \.\.\.hostSwitches/);
    expect(launchProblem(call('electron', "[mainEntry, ...hostSwitches, 'builtin:code-intelligence', '--', 'start-mcp-server']"))).toMatch(/reserved token follows/);
    // The product's own order, on both binaries.
    expect(launchProblem(call('exe', "[...before, TOKEN, ...hostSwitches, '--', ...tail]"))).toBeNull();
    expect(launchProblem(call('electron', "[mainEntry, TOKEN, ...hostSwitches, '--', 'no-such-subcommand']"))).toBeNull();
    expect(launchProblem(call('exe', "[TOKEN, ...hostSwitches, '--', ...tail]"))).toBeNull();
    // And the scan reaches code-intel-proof's two token launches, so the rule is not vacuous there.
    const text = readFileSync(join(SCRIPTS, 'code-intel-proof.mjs'), 'utf8');
    const tokenLaunches = launches('code-intel-proof.mjs', text).filter((l) => l.args?.some(isToken));
    expect(tokenLaunches).toHaveLength(2);
    expect(tokenLaunches.map(launchProblem)).toEqual([null, null]);
  });
});
