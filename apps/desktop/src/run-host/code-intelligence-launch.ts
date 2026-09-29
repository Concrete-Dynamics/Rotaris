import { join } from 'node:path';
import { CODE_INTELLIGENCE_TOKEN, type BuiltinLaunch } from '@rotaris/config';

/**
 * REQ-MCP-033 / ADR-0035 (Part T): what the reserved token launches — THIS application's own executable (a utility
 * process runs the same binary) with the token first and `--` after it (the branch's separator, measured in
 * spikes/code-intelligence-branch.md); in development Electron's binary with the main bundle before them, which is the
 * interpreted installation's "own language runtime" of REQ-MCP-033.
 *
 * Run as root (a Linux container, a CI runner), Chromium refuses to start without `--no-sandbox`, and the child died by
 * SIGTRAP before the sentinel ran, so every agent lost the code-intelligence tools
 * (`docs/defects/fixed/the-code-intelligence-server-cannot-start-as-root.md`). As root the switch stands between the
 * token and `--`, where the sentinel drops it (`runtimeArguments`); the child opens no window, and the owner permits it
 * (R-065). Every other launch is unchanged.
 */
export function codeIntelligenceLaunch(input: { readonly execPath: string; readonly bundleDir: string; readonly packaged: boolean; readonly root: boolean }): BuiltinLaunch {
  const switches = input.root ? ['--no-sandbox'] : [];
  return {
    command: input.execPath,
    args: input.packaged ? [CODE_INTELLIGENCE_TOKEN, ...switches, '--'] : [join(input.bundleDir, 'index.js'), CODE_INTELLIGENCE_TOKEN, ...switches, '--'],
  };
}
