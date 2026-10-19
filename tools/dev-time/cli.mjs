#!/usr/bin/env node
// @ts-check
// `pnpm dev-time` — the CLI of the development-time measure (R-075): one command around a clock, one honest record
// appended to the per-user store. The mechanism, the record shape and the store are `dev-time.mjs`'s; this file
// parses a command line, calls that module, and prints what happened. Nothing here gates anything: the tool
// measures and the record is evidence. Much of the capture is transparent and never passes through here — the
// gate's stages, `pnpm build`, the scripts that drive the application and the `tools/worktree/` wrappers record
// themselves; the explicit path is for everything else, and `gate` is the runner behind `pnpm check`.
//
// Exit codes (the build-id convention): 0 the command ran — a measured command's own code is passed through; 1 a
// handled error, said as one `error: …` line; 2 a usage error, with a pointer at the usage.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DISABLE_ENV,
  GATE_STAGES,
  KINDS,
  aggregate,
  cancelSpan,
  defaultStoreDir,
  disabled,
  filterByDays,
  formatRecordLine,
  formatReport,
  listPending,
  parseKindLabel,
  pnpmCommand,
  readRecords,
  redsClosed,
  runGate,
  runMeasured,
  shellCommand,
  shellLine,
  startSpan,
  stopSpan,
  storePath,
} from './dev-time.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const USAGE = `pnpm dev-time — where development time goes (R-075). Records append to ~/.rotaris/dev-time/log.jsonl;
ROTARIS_DEV_TIME_HOME moves that directory. The tool measures; it gates nothing.

  run [--quiet] [--shell] <kind>:<label> -- <command…>   measure one command
  gate [--stage=<name>]… [--keep-going]   the four pnpm check stages; each records itself, the run as gate:check
  proof <script> [args…]                  a pnpm script by name (a proof script, the live run)
  start <kind>:<label>                    open a span around work no single command covers
  stop | cancel | pending                 close it, drop it, or list what is open
  report [--days=N] [--json]              aggregate by kind and label, and the reds their next greens closed
  log [--tail=N] [--all] [--json]         the recent records

The gate's four stages (pnpm symbols, typecheck, lint, test), pnpm build, every script that drives the
application and the worktree wrappers' steps record themselves — the capture needs no habit.
ROTARIS_DEV_TIME_DISABLE switches it off; ROTARIS_DEV_TIME_VIA marks the context a wrapped command ran in.

kinds:  ${KINDS.join(', ')}
stages: ${GATE_STAGES.join(', ')} — the order \`pnpm check\` runs them`;

/**
 * @param {string} message
 * @returns {never}
 */
function usageError(message) {
  process.stderr.write(`error: ${message}\n`);
  process.stderr.write('run `pnpm dev-time` with no command for the usage\n');
  process.exit(2);
}

/**
 * @param {string} message
 * @returns {never}
 */
function handledError(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

/** The root package.json's scripts, or null when the file cannot be read. */
function rootScripts() {
  try {
    const pkg = /** @type {Record<string, unknown>} */ (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')));
    const scripts = pkg.scripts;
    if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) return {};
    return /** @type {Record<string, string>} */ (scripts);
  } catch {
    return null;
  }
}

/**
 * The script name nearest to `what` within two edits, for a misspelling's `did you mean`; null when none is near.
 * @param {string} what @param {string[]} candidates
 * @returns {string | null}
 */
function nearestScript(what, candidates) {
  /** Levenshtein distance; two rolling rows are all two names need. */
  const distance = (/** @type {string} */ a, /** @type {string} */ b) => {
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= b.length; j += 1) {
        const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
        current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution);
      }
      previous = current;
    }
    return previous[b.length] ?? 0;
  };
  let best = null;
  let bestDistance = 3;
  for (const candidate of candidates) {
    const d = distance(what, candidate);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  return best;
}

const [command, ...rest] = process.argv.slice(2);
const storeDir = defaultStoreDir();

switch (command) {
  case undefined:
  case 'help':
  case '--help':
  case '-h': {
    process.stdout.write(`${USAGE}\n`);
    break;
  }

  case 'run': {
    let quiet = false;
    let shell = false;
    while (rest[0] === '--quiet' || rest[0] === '--shell') {
      if (rest.shift() === '--quiet') quiet = true;
      else shell = true;
    }
    const token = rest.shift();
    if (token === undefined) usageError('run needs a <kind>:<label> and a command: `pnpm dev-time run build:desktop -- pnpm build`');
    const parsed = parseKindLabel(token);
    if ('problem' in parsed) usageError(parsed.problem);
    const tokens = rest[0] === '--' ? rest.slice(1) : rest;
    if (tokens.length === 0) usageError(`run ${token} names no command; write it after the kind: \`pnpm dev-time run ${token} -- <command>\``);
    const command = shell ? shellLine(tokens) : shellCommand(tokens);
    const { record, code, saved } = runMeasured({ storeDir, kind: parsed.kind, label: parsed.label, command });
    if (!quiet) {
      process.stderr.write(`[dev-time] ${formatRecordLine(record)}\n`);
      if (saved) process.stderr.write(`[dev-time] appended to ${storePath(storeDir)}\n`);
      else if (disabled()) process.stderr.write(`[dev-time] recording is switched off (${DISABLE_ENV})\n`);
    }
    process.exitCode = code;
    break;
  }

  case 'gate': {
    /** @type {string[]} */
    const asked = [];
    let keepGoing = false;
    for (const arg of rest) {
      if (arg === '--keep-going') {
        keepGoing = true;
        continue;
      }
      if (arg === '--stage') usageError('--stage needs a name: `--stage=test`');
      if (arg.startsWith('--stage=')) {
        const name = arg.slice('--stage='.length);
        if (!GATE_STAGES.includes(name)) usageError(`"${name}" is not a stage; the stages are ${GATE_STAGES.join(', ')}`);
        if (!asked.includes(name)) asked.push(name);
        continue;
      }
      usageError(`"${arg}" is not understood by \`gate\`; it takes [--stage=<name>]… and [--keep-going]`);
    }
    const stages = GATE_STAGES.filter((stage) => asked.length === 0 || asked.includes(stage));
    const { code, total, saved } = runGate({ storeDir, stages, keepGoing });
    if (total === null) {
      process.stderr.write(`[dev-time] ${stages.length} stage run${stages.length === 1 ? '' : 's'}; each stage records its own run — a subset gets no gate:check total\n`);
    } else if (saved) {
      process.stderr.write(`[dev-time] ${formatRecordLine(total)}\n`);
      process.stderr.write(`[dev-time] appended to ${storePath(storeDir)} (each stage recorded its own run)\n`);
    } else if (disabled()) {
      process.stderr.write(`[dev-time] recording is switched off (${DISABLE_ENV})\n`);
    }
    process.exitCode = code;
    break;
  }

  case 'proof': {
    const script = rest.shift();
    if (script === undefined) usageError('proof needs a script name: `pnpm dev-time proof theme-proof --counterfactual=text`');
    const scripts = rootScripts();
    if (scripts === null) handledError(`the root package.json cannot be read at ${join(ROOT, 'package.json')}`);
    if (!Object.hasOwn(scripts, script)) {
      const near = nearestScript(script, Object.keys(scripts));
      usageError(`"${script}" is not a script of the root package.json${near === null ? '' : `; did you mean "${near}"?`}`);
    }
    const { record, code, saved } = runMeasured({ storeDir, kind: 'proof', label: script, command: pnpmCommand(script, rest) });
    process.stderr.write(`[dev-time] ${formatRecordLine(record)}\n`);
    if (saved) process.stderr.write(`[dev-time] appended to ${storePath(storeDir)}\n`);
    else if (disabled()) process.stderr.write(`[dev-time] recording is switched off (${DISABLE_ENV})\n`);
    process.exitCode = code;
    break;
  }

  case 'start': {
    if (rest.length !== 1) usageError('start takes one <kind>:<label>: `pnpm dev-time start repair:flaky-windows-test`');
    const parsed = parseKindLabel(rest[0] ?? '');
    if ('problem' in parsed) usageError(parsed.problem);
    const opened = startSpan({ storeDir, kind: parsed.kind, label: parsed.label });
    if ('problem' in opened) handledError(opened.problem);
    process.stdout.write(`[dev-time] ${parsed.kind}:${parsed.label} opened at ${opened.span.startedAt} in ${resolve(process.cwd())}\n`);
    process.stdout.write('[dev-time] close it with `pnpm dev-time stop`, drop it with `pnpm dev-time cancel`\n');
    break;
  }

  case 'stop': {
    if (rest.length > 0) usageError(`stop takes no arguments (got "${rest.join(' ')}")`);
    const closed = stopSpan({ storeDir });
    if ('problem' in closed) handledError(closed.problem);
    process.stdout.write(`[dev-time] ${formatRecordLine(closed.record)}\n`);
    process.stdout.write(`[dev-time] appended to ${storePath(storeDir)}\n`);
    break;
  }

  case 'cancel': {
    if (rest.length > 0) usageError(`cancel takes no arguments (got "${rest.join(' ')}")`);
    const dropped = cancelSpan({ storeDir });
    if ('problem' in dropped) handledError(dropped.problem);
    process.stdout.write(`[dev-time] dropped ${dropped.span.kind}:${dropped.span.label} (opened ${dropped.span.startedAt}); nothing was recorded\n`);
    break;
  }

  case 'pending': {
    if (rest.length > 0) usageError(`pending takes no arguments (got "${rest.join(' ')}")`);
    const open = listPending(storeDir);
    if (open.length === 0) {
      process.stdout.write(`[dev-time] no spans open under ${storeDir}\n`);
      break;
    }
    for (const entry of open) {
      const said =
        entry.span === null
          ? `an unreadable pending file: ${entry.file}`
          : `${entry.span.kind}:${entry.span.label}  since ${entry.span.startedAt}  in ${entry.span.cwd ?? '?'}`;
      process.stdout.write(`${said}\n`);
    }
    break;
  }

  case 'report': {
    /** @type {number | null} */
    let days = null;
    let json = false;
    for (const arg of rest) {
      if (arg === '--json') {
        json = true;
        continue;
      }
      if (arg.startsWith('--days=')) {
        const asked = arg.slice('--days='.length);
        const n = Number(asked);
        if (!Number.isInteger(n) || n < 1) usageError(`--days=${asked} is not a whole number of days`);
        days = n;
        continue;
      }
      usageError(`"${arg}" is not understood by \`report\`; it takes [--days=N] and [--json]`);
    }
    const { records, skips, missing } = readRecords(storeDir);
    const kept = filterByDays(records, days);
    const totals = aggregate(kept);
    const reds = redsClosed(kept);
    const pending = listPending(storeDir);
    const outsideWindow = records.length - kept.length;
    if (json) {
      const document = {
        store: storePath(storeDir),
        missing,
        days,
        outsideWindow,
        ...totals,
        reds,
        skips,
        pending: pending.map((entry) => ({ file: entry.file, span: entry.span })),
      };
      process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
      break;
    }
    const lines = formatReport({ aggregate: totals, store: storePath(storeDir), missing, skips, days, pending, outsideWindow, reds });
    process.stdout.write(`${lines.join('\n')}\n`);
    break;
  }

  case 'log': {
    let tail = 20;
    let all = false;
    let json = false;
    let tailAsked = false;
    for (const arg of rest) {
      if (arg === '--all') {
        all = true;
        continue;
      }
      if (arg === '--json') {
        json = true;
        continue;
      }
      if (arg.startsWith('--tail=')) {
        const asked = arg.slice('--tail='.length);
        const n = Number(asked);
        if (!Number.isInteger(n) || n < 1) usageError(`--tail=${asked} is not a whole number of records`);
        tail = n;
        tailAsked = true;
        continue;
      }
      usageError(`"${arg}" is not understood by \`log\`; it takes [--tail=N], [--all] and [--json]`);
    }
    if (all && tailAsked) usageError('--all and --tail=… name different windows; keep one');
    const { records, missing } = readRecords(storeDir);
    if (missing) {
      process.stdout.write(`[dev-time] no records under ${storeDir} yet — record one with \`pnpm dev-time run <kind>:<label> -- <command>\`\n`);
      break;
    }
    const selected = all ? records : records.slice(Math.max(0, records.length - tail));
    if (selected.length === 0 && !json) process.stdout.write(`[dev-time] no records under ${storeDir} yet\n`);
    for (const record of selected) {
      process.stdout.write(json ? `${JSON.stringify(record)}\n` : `${formatRecordLine(record)}\n`);
    }
    break;
  }

  default:
    usageError(`"${command}" is not a command`);
}
