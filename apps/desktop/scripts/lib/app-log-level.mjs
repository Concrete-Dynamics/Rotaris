/**
 * `pnpm live-run --app-log-level=<lvl>`: which application-log thresholds a live run may ask for, and why only two.
 *
 * PD-MONITOR-002 gives the application log four thresholds (`debug`, `info`, `warning`, `error`) and the product's default
 * is `info`. The flag exists so a live run can ask for `debug` — a child MCP server's stderr among it — since
 * `cleanEnvironment()` strips an exported `ROTARIS_APP_LOG_LEVEL` from every launch. Above `info` the log drops every `info`
 * line, and the harness reads `info` lines in every scenario, sign-in's included: the capture's `capture: wait for result
 * satisfied` and `… timed out`, its `capture: clicked` and `capture: probe …` lines (`apps/desktop/src/main/capture/probe.ts`,
 * written with `host.log`), the sign-in's `providers: Added …`, the run host's code-intelligence discovery and `child_timeout=`
 * lines. A run at `warning` or `error` would read each absence as an outcome: the duress and swarm deadline checks failed as
 * `ended`, every bare timed-out check passed whatever happened
 * (`docs/defects/fixed/a-live-run-at-app-log-level-warning-or-error-misreads-its-missing-info-lines-as-outcomes.md`).
 *
 * Raising those lines instead was not taken: PD-MONITOR-002 makes the level a field that means what it says, the one level
 * every threshold keeps is `error`, and a capture's progress line, a provider added or a discovery that succeeded is no error
 * (nor are they the capture's alone: half of them are the product's own lines). So the harness keeps the product's levels and
 * refuses the two thresholds under which it cannot read them, before any launch.
 */

/** The thresholds a live run may name: the product's default and the one the flag exists for. */
export const READABLE_LEVELS = ['debug', 'info'];

/**
 * Null when `value` (the flag's text, or null when the flag is absent) is a threshold the run can read under; otherwise the
 * sentence the run refuses with. Any casing, as PD-MONITOR-002 accepts.
 */
export function appLogLevelRefusal(value) {
  if (value === null || value === undefined) return null;
  const word = String(value).toLowerCase();
  if (READABLE_LEVELS.includes(word)) return null;
  if (word === 'warning' || word === 'error') {
    return `--app-log-level=${value}: refused. Every scenario's readings, sign-in's included, read the application log's info lines `
      + '(the capture\'s wait, click and probe lines, the providers and discovery lines), and a threshold above info drops them, '
      + 'so each check would read their absence as an outcome. A live run takes debug or info (default: unset, the product\'s info; PD-MONITOR-002).';
  }
  return `--app-log-level=${value}: expected debug or info (PD-MONITOR-002's other two, warning and error, drop the info lines the run reads)`;
}
