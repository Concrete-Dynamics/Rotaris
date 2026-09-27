import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The version the running desktop reports (REQ-STARTUP-004, REQ-STARTUP-007, REQ-STARTUP-158): the one its own
 * installation metadata declares — the application's `package.json`, the single place the product version is declared
 * (`tools/release-guard`, ADR-0054) — else the literal `dev`.
 *
 * Read from the file beside the bundle rather than asked of `app.getVersion()`: Electron answers that from the package
 * the runtime was *started with*, which for the packaged build is this same file inside the archive but for
 * `electron out/main/index.js` — the development entry and every proof — is no package at all, and Electron then
 * reports its OWN version (the About page read "v44.1.1"). `__dirname/../../package.json` is `apps/desktop/package.json`
 * from `out/main/` and `app.asar/package.json` from inside the archive (electron-builder packs `out/**` and
 * `package.json`), so both entries run one code path, as `about.ts` does for the bundled assets.
 *
 * Never throws: no startup path may fail because version metadata is unavailable (REQ-STARTUP-159). Demo mode's fixed
 * `0.1.0` (REQ-STARTUP-007) waits for the demo entry (REQ-SHELL-162), which is not built.
 */
export const VERSION_WITHOUT_METADATA = 'dev';

export function readProductVersion(manifestPath: string): string {
  try {
    const version = (JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown } | null)?.version;
    if (typeof version === 'string' && version.trim() !== '') return version;
  } catch {
    // Missing, unreadable or not JSON: no metadata, which REQ-STARTUP-007 answers with `dev`.
  }
  return VERSION_WITHOUT_METADATA;
}

let cached: string | null = null;

/** The process's version, read once: the file cannot change under a running installation. */
export function productVersion(): string {
  cached ??= readProductVersion(join(__dirname, '..', '..', 'package.json'));
  return cached;
}
