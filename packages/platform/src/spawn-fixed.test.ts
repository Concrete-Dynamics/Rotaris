import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedLaunchOf } from './spawn.js';

/** A fixed command line takes nothing from the environment: the search path decides its form and adds no text to it. */
describe('fixedLaunchOf', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-fixed-launch-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('starts the tool by its own name everywhere but for a Windows command shim', () => {
    expect(fixedLaunchOf('claude', ['auth', 'status'], { PATH: dir }, 'linux')).toEqual({ command: 'claude', args: ['auth', 'status'] });
    writeFileSync(join(dir, 'claude.exe'), '', { mode: 0o755 });
    expect(fixedLaunchOf('claude', ['auth', 'status'], { PATH: dir, PATHEXT: '.exe;.cmd' }, 'win32')).toEqual({ command: 'claude', args: ['auth', 'status'] });
  });

  it('runs a command shim through cmd.exe by name, with the tool\'s name on the line and neither ComSpec nor the shim\'s location in it', () => {
    // The host's file system matches case, so the extension is spelt as the file is.
    writeFileSync(join(dir, 'claude.cmd'), '', { mode: 0o755 });
    const launch = fixedLaunchOf('claude', ['--tools', '', '--model', 'haiku', '--system-prompt-file', 'instructions-ab12.txt'], { PATH: dir, PATHEXT: '.cmd', ComSpec: 'C:\\evil\\shell.exe' }, 'win32');
    expect(launch).toEqual({ command: 'cmd.exe', args: ['/d', '/s', '/c', '"claude --tools "" --model haiku --system-prompt-file instructions-ab12.txt"'], windowsVerbatimArguments: true });
    expect(JSON.stringify(launch)).not.toContain('evil');
    expect(JSON.stringify(launch)).not.toContain(dir);
  });
});
