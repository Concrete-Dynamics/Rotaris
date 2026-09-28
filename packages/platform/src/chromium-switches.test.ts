import { describe, expect, it } from 'vitest';
import { afterInheritedSwitches, inheritedChromiumSwitches, SANDBOX_SWITCH } from './chromium-switches.js';

describe('the Chromium switch a launch of the application\'s own executable inherits — REQ-MCP-033, REQ-STARTUP-015 (OQ-76)', () => {
  it('carries --no-sandbox when the parent was started with it, wherever it stood', () => {
    expect(inheritedChromiumSwitches(['/opt/Rotaris/rotaris', '--no-sandbox'])).toEqual([SANDBOX_SWITCH]);
    expect(inheritedChromiumSwitches(['electron', 'out/main/index.js', '--no-sandbox', '/a/workspace'])).toEqual([SANDBOX_SWITCH]);
  });

  it('carries nothing when the parent was started without it, and never another switch', () => {
    expect(inheritedChromiumSwitches(['/opt/Rotaris/rotaris'])).toEqual([]);
    expect(inheritedChromiumSwitches(['electron', 'out/main/index.js', '--disable-gpu', '--enable-logging'])).toEqual([]);
  });

  it('finds the token past the inherited switch, and past nothing else', () => {
    expect(afterInheritedSwitches(['exe', '--no-sandbox', 'builtin:code-intelligence', '--'], 1)).toBe(2);
    expect(afterInheritedSwitches(['exe', 'builtin:code-intelligence', '--'], 1)).toBe(1);
    expect(afterInheritedSwitches(['electron', 'index.js', '--no-sandbox', 'builtin:code-intelligence', '--'], 2)).toBe(3);
    // `--` is the branch's separator and a workspace path is a positional: neither is skipped.
    expect(afterInheritedSwitches(['exe', '--', 'x'], 1)).toBe(1);
    expect(afterInheritedSwitches(['exe', '/a/workspace'], 1)).toBe(1);
  });
});
