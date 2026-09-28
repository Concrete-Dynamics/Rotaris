import { join } from 'node:path';
import { inheritedChromiumSwitches } from '@rotaris/platform';
import { CODE_INTELLIGENCE_TOKEN, type BuiltinLaunch } from '@rotaris/config';

/**
 * REQ-MCP-033 / ADR-0035 (Part T): what the reserved token launches — THIS application's own executable (a utility
 * process runs the same binary) with the token first and `--` second (the branch's separator, measured in
 * `spikes/code-intelligence-branch.md`); in development Electron's binary with the main bundle before them, which is
 * the interpreted installation's "own language runtime" of REQ-MCP-033. Packaged is read off the bundle's own location.
 *
 * **The launch carries the parent's sandbox switch** (OQ-76's reading, `@rotaris/platform`'s `chromium-switches.ts`):
 * started as root on Linux the application runs with `--no-sandbox`, and the child — a fresh Chromium — died with
 * SIGTRAP before its sentinel ran when the switch was not on its own line (2026-09-27). The token stays the FIRST
 * argument (REQ-MCP-033 says so); the switch stands between it and `--`, where Chromium still reads it and the sentinel
 * drops it — after the `--` it would reach the runtime as an argument of its own.
 */
export function codeIntelligenceLaunchFor(i: { readonly execPath: string; readonly bundleDir: string; readonly argv: readonly string[] }): BuiltinLaunch & { readonly packaged: boolean } {
  const packaged = i.bundleDir.includes('app.asar');
  const switches = inheritedChromiumSwitches(i.argv);
  return {
    command: i.execPath,
    args: packaged ? [CODE_INTELLIGENCE_TOKEN, ...switches, '--'] : [join(i.bundleDir, 'index.js'), CODE_INTELLIGENCE_TOKEN, ...switches, '--'],
    packaged,
  };
}
