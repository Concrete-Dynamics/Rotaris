// @ts-check
/**
 * The shipped runtime's audit (R-091; `docs/architecture/hardening.md` §3.5, the Scorecard's Vulnerabilities): the
 * advisories at or above a severity that name a package the installer ships although no manifest declares it a
 * production dependency.
 *
 * `pnpm deps:audit` (`pnpm audit --prod --audit-level=high`) blocks CI's gate on a production dependency inside a high
 * advisory, and `--prod` reads `dependencies` alone. Electron is the runtime every packaged build ships, yet it is a
 * `devDependency` of `apps/desktop` (electron-builder's convention, which refuses it under `dependencies`), so the
 * production audit never saw it: 44.3.0 sat inside GHSA-jr5w-w6x2-84p9 (high, `<44.9.1`) with the gate green
 * (`docs/archive/defects/the-shipped-electron-runtime-sits-inside-a-high-advisory-the-production-audit-cannot-see.md`).
 * The release SBOM corrects the same blind spot by adding Electron (`tools/sbom/sbom.mjs`); this module corrects it for
 * the audit, by reading the whole tree's report (`pnpm audit --json`) and keeping only the shipped runtime's
 * advisories, so the build tools' advisories stay report-only as `docs/architecture/dependency-alerts/2026-11-01-audit-gate.md`
 * §3 left them.
 *
 * An exception is written as the production audit's are, in `pnpm-workspace.yaml`'s `auditConfig.ignoreGhsas`
 * (that reading's §4): pnpm drops an ignored advisory from the report's `advisories` before this module reads it
 * (measured 2026-11-04, pnpm 11.9.0 — the `metadata.vulnerabilities` counts keep it, so they are not read here).
 */

/** The packages the installer ships that no manifest declares under `dependencies`. */
export const SHIPPED_RUNTIME = /** @type {const} */ (['electron']);

/** npm's severities, least first. */
export const SEVERITIES = /** @type {const} */ (['info', 'low', 'moderate', 'high', 'critical']);

/**
 * @typedef {{ module: string; versions: string[]; severity: string; ghsa: string; vulnerable: string; patched: string; title: string }} RuntimeFinding
 */

/**
 * The shipped runtime's advisories in an audit report at or above `level`, ordered by package then advisory.
 * Refuses (throws) a report that is not one: an audit that could not reach the registry prints an error object, and
 * reading that as "no advisories" would pass the gate on no evidence.
 *
 * @param {unknown} report the parsed output of `pnpm audit --json`
 * @param {{ shipped?: readonly string[]; level?: string }} [options]
 * @returns {RuntimeFinding[]}
 */
export function runtimeFindings(report, options = {}) {
  const shipped = options.shipped ?? SHIPPED_RUNTIME;
  const level = options.level ?? 'high';
  const floor = SEVERITIES.indexOf(/** @type {typeof SEVERITIES[number]} */ (level));
  if (floor < 0) throw new Error(`unknown audit level "${level}" (one of ${SEVERITIES.join(', ')})`);
  const advisories =
    report !== null && typeof report === 'object' && 'advisories' in report ? /** @type {{ advisories: unknown }} */ (report).advisories : undefined;
  if (advisories === null || typeof advisories !== 'object' || Array.isArray(advisories)) {
    throw new Error('not an audit report: it holds no "advisories" object');
  }
  /** @type {RuntimeFinding[]} */
  const findings = [];
  for (const raw of Object.values(advisories)) {
    const a = /** @type {Record<string, unknown>} */ (raw ?? {});
    const module = String(a['module_name'] ?? '');
    if (!shipped.includes(module)) continue;
    const severity = String(a['severity'] ?? '');
    const rank = SEVERITIES.indexOf(/** @type {typeof SEVERITIES[number]} */ (severity));
    // An unknown severity is not quietly below the floor: it counts.
    if (rank >= 0 && rank < floor) continue;
    const found = Array.isArray(a['findings']) ? /** @type {Array<{ version?: unknown }>} */ (a['findings']) : [];
    findings.push({
      module,
      versions: [...new Set(found.map((f) => String(f.version ?? '')).filter((v) => v !== ''))].sort(),
      severity,
      ghsa: String(a['github_advisory_id'] ?? a['id'] ?? ''),
      vulnerable: String(a['vulnerable_versions'] ?? ''),
      patched: String(a['patched_versions'] ?? ''),
      title: String(a['title'] ?? ''),
    });
  }
  return findings.sort((x, y) => x.module.localeCompare(y.module) || x.ghsa.localeCompare(y.ghsa));
}

/**
 * One line per finding, for the gate's log.
 *
 * @param {RuntimeFinding} f
 */
export function describeFinding(f) {
  return `${f.module} ${f.versions.join(', ') || '(version unread)'}: ${f.severity} ${f.ghsa} (${f.vulnerable}; fixed in ${f.patched || 'no release'}) ${f.title}`.trim();
}
