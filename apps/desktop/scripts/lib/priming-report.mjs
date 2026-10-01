/**
 * The run host's opening credential report, read from an application log (REQ-PROVIDER-067, REQ-PROVIDER-068).
 *
 * REQ-PROVIDER-068: opening a run's keep-fresh scope "yields the priming report of REQ-PROVIDER-067 — the providers
 * found authenticated, … and the map of providers that could not be resolved with a reason for each — reported as ok
 * exactly when that map is empty". The run host writes that report once per workspace root, whole, as
 * `LeaseReportLog`'s opening line (`apps/desktop/src/run-host/launch.ts`):
 *
 *   credentials: leased for <id>[, <id>…] (workspace <root>)[; unresolved: <id> (<reason>)[, …]]
 *
 * and after it only what changed (`credentials (workspace <root>): …`), which is not the opening report.
 *
 * `slice-proof` asserted `credentials: 1 provider(s) authenticated`, a line nothing in the product writes, so its
 * step 3 failed on every build that reached it
 * (`docs/defects/fixed/slice-proof-asserts-a-priming-line-the-product-does-not-write.md`). This reader is pinned by
 * `priming-report.test.ts` against `LeaseReportLog`'s own output, so the proof cannot drift from the product again
 * without a red.
 */
const OPENING = /credentials: leased for (.+?) \(workspace (.+?)\)(?:; unresolved: (.+))?\s*$/;

/**
 * The first opening report in `log`, or null: the providers it names as authenticated (`no provider` names none),
 * its workspace root, and its unresolved part as written (null where the map was empty).
 */
export function openingReport(log) {
  for (const line of log.split('\n')) {
    const m = OPENING.exec(line);
    if (!m) continue;
    const authenticated = m[1] === 'no provider' ? [] : m[1].split(', ');
    return { line: line.trim(), authenticated, workspace: m[2], unresolved: m[3] ?? null };
  }
  return null;
}

/**
 * Why the opening report does not show `provider` primed, or null where it does: the report is present, names the
 * provider among the authenticated, and is ok — no provider left unresolved (REQ-PROVIDER-068).
 */
export function primingProblem(log, provider) {
  const report = openingReport(log);
  if (report === null) return 'the run host wrote no opening credential report (REQ-PROVIDER-068)';
  if (!report.authenticated.includes(provider)) return `the run host's opening report does not name ${provider} as authenticated (REQ-PROVIDER-067): ${report.line}`;
  if (report.unresolved !== null) return `the run host's opening report is not ok — providers unresolved (REQ-PROVIDER-068): ${report.unresolved}`;
  return null;
}
