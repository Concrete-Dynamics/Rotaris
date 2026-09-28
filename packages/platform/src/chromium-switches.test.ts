import { describe, expect, it } from 'vitest';
import { inheritedChromiumSwitches, SANDBOX_SWITCH, withoutInheritedSwitches } from './chromium-switches.js';

describe('the Chromium switch a launch of the application\'s own executable inherits — REQ-MCP-033, REQ-STARTUP-015 (OQ-82)', () => {
  it('carries --no-sandbox when the parent was started with it, wherever it stood', () => {
    expect(inheritedChromiumSwitches(['/opt/Rotaris/rotaris', '--no-sandbox'])).toEqual([SANDBOX_SWITCH]);
    expect(inheritedChromiumSwitches(['electron', 'out/main/index.js', '--no-sandbox', '/a/workspace'])).toEqual([SANDBOX_SWITCH]);
  });

  it('carries nothing when the parent was started without it, and never another switch', () => {
    expect(inheritedChromiumSwitches(['/opt/Rotaris/rotaris'])).toEqual([]);
    expect(inheritedChromiumSwitches(['electron', 'out/main/index.js', '--disable-gpu', '--enable-logging'])).toEqual([]);
  });

  it('drops the inherited switch standing between the token and the separator, so the runtime never receives it', () => {
    expect(withoutInheritedSwitches(['--no-sandbox', '--', 'start-mcp-server', '--transport', 'stdio'])).toEqual(['--', 'start-mcp-server', '--transport', 'stdio']);
    expect(withoutInheritedSwitches(['--', 'start-mcp-server'])).toEqual(['--', 'start-mcp-server']);
  });

  it('leaves everything else as it stands: a switch after the separator is the runtime\'s own, and no separator means nothing is skipped', () => {
    expect(withoutInheritedSwitches(['--', '--no-sandbox'])).toEqual(['--', '--no-sandbox']);
    expect(withoutInheritedSwitches(['--no-sandbox', 'start-mcp-server'])).toEqual(['--no-sandbox', 'start-mcp-server']);
    expect(withoutInheritedSwitches(['--disable-gpu', '--', 'x'])).toEqual(['--disable-gpu', '--', 'x']);
    expect(withoutInheritedSwitches([])).toEqual([]);
  });
});
