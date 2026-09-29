import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { codeIntelligenceLaunch } from './code-intelligence-launch.js';

describe('REQ-MCP-033 / ADR-0035: what the reserved token launches', () => {
  const at = { execPath: '/opt/rotaris/rotaris', bundleDir: '/opt/rotaris/out/main' };
  it('packaged: the executable, the token, then the separator', () => {
    expect(codeIntelligenceLaunch({ ...at, packaged: true, root: false })).toEqual({ command: at.execPath, args: ['builtin:code-intelligence', '--'] });
  });
  it('in development: the main bundle before the token', () => {
    expect(codeIntelligenceLaunch({ ...at, packaged: false, root: false })).toEqual({ command: at.execPath, args: [join(at.bundleDir, 'index.js'), 'builtin:code-intelligence', '--'] });
  });
  it('R-066: as root, `--no-sandbox` stands between the token and the separator, where the sentinel drops it', () => {
    expect(codeIntelligenceLaunch({ ...at, packaged: true, root: true }).args).toEqual(['builtin:code-intelligence', '--no-sandbox', '--']);
    expect(codeIntelligenceLaunch({ ...at, packaged: false, root: true }).args).toEqual([join(at.bundleDir, 'index.js'), 'builtin:code-intelligence', '--no-sandbox', '--']);
  });
});
