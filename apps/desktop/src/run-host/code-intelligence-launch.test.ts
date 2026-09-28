import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { codeIntelligenceLaunchFor } from './code-intelligence-launch.js';

describe('what the reserved token launches — REQ-MCP-033, REQ-STARTUP-015 (OQ-82)', () => {
  const packagedDir = join('C:', 'Rotaris', 'resources', 'app.asar', 'out', 'main');
  const devDir = join('/', 'repo', 'apps', 'desktop', 'out', 'main');

  it('packaged: the executable with the token first and the separator second, and nothing else on a sandboxed host', () => {
    const l = codeIntelligenceLaunchFor({ execPath: 'C:\\Rotaris\\Rotaris.exe', bundleDir: packagedDir, argv: ['C:\\Rotaris\\Rotaris.exe', 'D:\\a\\workspace'] });
    expect(l.packaged).toBe(true);
    expect(l.command).toBe('C:\\Rotaris\\Rotaris.exe');
    expect(l.args).toEqual(['builtin:code-intelligence', '--']);
  });

  it('development: Electron with the main bundle before the token', () => {
    const l = codeIntelligenceLaunchFor({ execPath: '/repo/node_modules/electron/dist/electron', bundleDir: devDir, argv: ['electron', join(devDir, 'index.js')] });
    expect(l.packaged).toBe(false);
    expect(l.args).toEqual([join(devDir, 'index.js'), 'builtin:code-intelligence', '--']);
  });

  it('a parent started with --no-sandbox hands the switch to the child between the token and the separator; the token stays first', () => {
    const packaged = codeIntelligenceLaunchFor({ execPath: '/opt/Rotaris/rotaris', bundleDir: packagedDir, argv: ['/opt/Rotaris/rotaris', '--no-sandbox'] });
    expect(packaged.args).toEqual(['builtin:code-intelligence', '--no-sandbox', '--']);
    // REQ-MCP-033: the frozen installation's executable takes the token as its FIRST argument.
    expect(packaged.args[0]).toBe('builtin:code-intelligence');
    const dev = codeIntelligenceLaunchFor({ execPath: '/repo/node_modules/electron/dist/electron', bundleDir: devDir, argv: ['electron', join(devDir, 'index.js'), '--no-sandbox', '/a/workspace'] });
    expect(dev.args).toEqual([join(devDir, 'index.js'), 'builtin:code-intelligence', '--no-sandbox', '--']);
    expect(dev.args[1]).toBe('builtin:code-intelligence');
    // Never after the separator, where the runtime would read it as one of its own arguments.
    expect(dev.args.indexOf('--no-sandbox')).toBeLessThan(dev.args.indexOf('--'));
    expect(packaged.args.indexOf('--no-sandbox')).toBeLessThan(packaged.args.indexOf('--'));
  });

  it('inherits no other switch of the parent\'s line', () => {
    const l = codeIntelligenceLaunchFor({ execPath: '/opt/Rotaris/rotaris', bundleDir: packagedDir, argv: ['/opt/Rotaris/rotaris', '--disable-gpu', '--enable-logging=stderr'] });
    expect(l.args).toEqual(['builtin:code-intelligence', '--']);
  });
});
