import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * REQ-STARTUP-004, REQ-STARTUP-007, REQ-STARTUP-158 — the version the running desktop reports, read from its own
 * installation metadata: the application's `package.json`, the one place a release declares the product version
 * (`tools/release-guard`, ADR-0054).
 *
 * One reader for every process that reports it. Main presents it on the About surface (`shell.hello`); the run host
 * sends it as the MCP client's `clientInfo.version` in every handshake it makes (`@rotaris/mcp`). A literal in either
 * place would be a second product version the guard never sees — the MCP client carried `0.1.0` as one until
 * 2026-09-27.
 *
 * Never throws: no startup path may fail because version metadata is unavailable (REQ-STARTUP-159).
 */

/**
 * The version reported when the metadata declares none. REQ-STARTUP-007 says `dev` for the running desktop and
 * REQ-STARTUP-004 says `0+unknown`; the two disagree, and this is OQ-68's reading — REQ-STARTUP-007 is the one written
 * for the running desktop and the About surface, and `dev` is also what REQ-STARTUP-109's unanswerable comparison
 * names. Demo mode's fixed `0.1.0` (REQ-STARTUP-007) waits for the demo entry (REQ-SHELL-162), which is not built.
 */
export const VERSION_WITHOUT_METADATA = 'dev';

export function readProductVersion(manifestPath: string): string {
  try {
    const version = (JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown } | null)?.version;
    if (typeof version === 'string' && version.trim() !== '') return version;
  } catch {
    // Missing, unreadable or not JSON: no metadata.
  }
  return VERSION_WITHOUT_METADATA;
}

/**
 * The application manifest seen from the directory a process's bundle sits in. electron-vite emits all three node
 * entries — main, the run host, the workspace service — side by side into `out/main/`, and electron-builder packs
 * `out/**` with `package.json` into `app.asar`, so `<bundle>/../../package.json` is `apps/desktop/package.json` for the
 * development entry and every proof, and `app.asar/package.json` inside an installed build: one file, one code path.
 *
 * Read from the file rather than asked of Electron's `app.getVersion()`, which answers with Electron's OWN version for
 * a runtime started with a file (`electron out/main/index.js`), and which the run host cannot ask at all.
 */
export function applicationManifestPath(bundleDir: string): string {
  return join(bundleDir, '..', '..', 'package.json');
}

export function installedProductVersion(bundleDir: string): string {
  return readProductVersion(applicationManifestPath(bundleDir));
}
