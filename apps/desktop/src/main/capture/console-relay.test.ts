import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type ConsoleMessageDetails, onConsoleWarning } from './console-relay.js';

/**
 * The capture's console relay listens in the details form of Electron's `console-message` event, never the deprecated
 * positional arguments (`docs/defects/fixed/the-captures-console-relay-listens-with-the-deprecated-console-message-arguments.md`).
 */

const details = (level: ConsoleMessageDetails['level'], message: string): ConsoleMessageDetails => ({ level, message, lineNumber: 7, sourceId: 'file:///app.js' });

describe('onConsoleWarning — the details form of console-message', () => {
  it('registers one single-argument listener and relays warnings and errors only', () => {
    const listeners: ((...args: never[]) => void)[] = [];
    const source = { on: (event: 'console-message', listener: (d: ConsoleMessageDetails) => void) => { expect(event).toBe('console-message'); listeners.push(listener); } };
    const relayed: string[] = [];
    onConsoleWarning(source, (d) => { relayed.push(`${d.level}: ${d.message} (${d.sourceId}:${d.lineNumber})`); });
    expect(listeners).toHaveLength(1);
    // Electron reads the listener's arity: more than one parameter is the deprecated positional form.
    expect(listeners[0]!.length).toBe(1);
    const listener = listeners[0] as (d: ConsoleMessageDetails) => void;
    for (const level of ['debug', 'info', 'warning', 'error'] as const) listener(details(level, `a ${level}`));
    // What `level >= 2` relayed under the positional form (0 verbose, 1 info, 2 warning, 3 error).
    expect(relayed).toEqual(['warning: a warning (file:///app.js:7)', 'error: a error (file:///app.js:7)']);
  });

  it('is the only place under apps/desktop/src that listens to console-message', () => {
    const root = join(import.meta.dirname, '..', '..');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(path);
      }
    };
    walk(root);
    const listening = files.filter((file) => /['"]console-message['"]/.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file).split('\\').join('/'));
    expect(listening).toEqual(['main/capture/console-relay.ts']);
  });
});
