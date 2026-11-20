import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { windowsLaunchOf } from '@rotaris/platform';
import type { CliLaunch, CliProcess } from './client.js';

/**
 * PD-PROVIDER-002 — the one place the Claude Code executable is started. It is found on the executable search path
 * the application was started with and run as it is: this product ships no copy of it and changes nothing in it.
 */
const STDERR_TAIL = 2_000;

export function launchClaudeCli(l: CliLaunch): CliProcess {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(l.env)) if (v !== undefined) env[k] = v;
  const target = windowsLaunchOf(l.executable, l.args, env);
  const child = spawn(target.command, target.args, { cwd: l.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, ...(target.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}) });
  let stderr = '';
  let exited = false;
  const lines: ((line: string) => void)[] = [];
  const exits: ((code: number | null, stderrTail: string) => void)[] = [];
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      for (const fn of lines) fn(line);
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-STDERR_TAIL); });
  const end = (code: number | null): void => {
    if (exited) return;
    exited = true;
    for (const fn of exits) fn(code, stderr.trim());
  };
  child.on('error', () => end(null));
  child.on('exit', (code) => end(code));
  child.stdin.on('error', () => undefined);
  return {
    write: (line) => { if (!exited && child.stdin.writable) child.stdin.write(line); },
    endInput: () => { if (child.stdin.writable) child.stdin.end(); },
    kill: () => { if (!exited) child.kill(); },
    onLine: (fn) => { lines.push(fn); },
    onExit: (fn) => { exits.push(fn); },
  };
}

/** REQ-PROVIDER-048: the user's own Claude Code settings, as text, or null when there are none to read. */
export function readClaudeUserSettings(): string | null {
  try { return readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf8'); } catch { return null; }
}

/** A session's files under `dir`, each owner-only; removed when the session ends. The tool description holds the bridge's bearer. */
export function sessionFiles(dir: string): { write: (kind: 'instructions' | 'tools', text: string) => string; remove: (path: string) => void } {
  return {
    write: (kind, text) => {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const path = join(dir, `${kind}-${randomBytes(8).toString('hex')}.${kind === 'tools' ? 'json' : 'txt'}`);
      writeFileSync(path, text, { encoding: 'utf8', mode: 0o600 });
      return path;
    },
    remove: (path) => { rmSync(path, { force: true }); },
  };
}
