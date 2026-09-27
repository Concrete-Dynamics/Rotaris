import { installedProductVersion } from '@rotaris/platform';

/**
 * The version main reports (REQ-STARTUP-007, REQ-STARTUP-158): the one its own installation metadata declares, read
 * through `@rotaris/platform`'s one reader from the manifest beside this bundle — the same file the release guard
 * checks and the run host sends as the MCP client's version, so the About surface and every handshake say one thing.
 *
 * Not `app.getVersion()`: Electron answers that from the package the runtime was *started with*, which for
 * `electron out/main/index.js` — the development entry and every proof — is no package at all, and Electron then
 * reports its OWN version (the About page read "v44.1.1").
 */
let cached: string | null = null;

/** The process's version, read once: the file cannot change under a running installation. */
export function productVersion(): string {
  cached ??= installedProductVersion(__dirname);
  return cached;
}
