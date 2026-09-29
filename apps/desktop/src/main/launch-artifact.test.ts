import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { takeArtifactVariables } from '@rotaris/platform';
import { classifyInstallation } from './updater/classify.js';

/**
 * REQ-STARTUP-106 / REQ-STARTUP-147: main's composition root takes the artifact variables out of its own environment
 * before it starts any child, and hands what it read to the classification. `index.ts` is a composition root over
 * Electron and cannot be run in a test, so the ORDER is read from its source — the one fact about it this test needs —
 * and the flow it wires is then run over the real helper and the real classification.
 */
const source = readFileSync(join(import.meta.dirname, 'index.ts'), 'utf8');
/** The module body: everything after the last import statement. */
const body = source.slice(source.lastIndexOf('\nimport '));
const at = (needle: string): number => body.indexOf(needle);

describe('main takes the artifact variables before any child exists (REQ-STARTUP-106, REQ-STARTUP-147)', () => {
  it('the take is the first statement of the module body, from process.env itself', () => {
    const take = at('const launchArtifact = takeArtifactVariables(process.env);');
    expect(take).toBeGreaterThan(0);
    const firstStatement = /\n(?:const|let|var|app\.|process\.|function|async function|void|await) /.exec(body);
    expect(firstStatement?.index).toBe(take - 1);
  });

  it('every fork and spawn main performs — the run host, each workspace service, the successor — comes after it', () => {
    const take = at('takeArtifactVariables(process.env)');
    const children = [...body.matchAll(/utilityProcess\.fork\(|spawnDetached\(|\bspawn\(|\bexecFile\(|\bfork\(/g)].map((m) => m.index);
    // The run host's fork, the workspace service's fork and the successor's detached spawn.
    expect(children.length).toBeGreaterThanOrEqual(3);
    for (const index of children) expect(index).toBeGreaterThan(take);
    // No fork passes an environment of its own that could carry the variables back: each inherits main's.
    for (const m of body.matchAll(/utilityProcess\.fork\([^\n]*/g)) expect(m[0]).not.toMatch(/\benv\s*:/);
  });

  it('the classification is given what the take read, never process.env', () => {
    expect(body).toContain('classifyThisInstallation(launchArtifact)');
    const electron = readFileSync(join(import.meta.dirname, 'updater', 'electron.ts'), 'utf8');
    expect(electron).toMatch(/env: artifact,/);
    expect(electron).not.toMatch(/env: process\.env/);
  });

  it('the classification reads the values the take returned, after they are gone from the environment children inherit', () => {
    const env: NodeJS.ProcessEnv = { Path: 'C:\\Windows', ROTARIS_PORTABLE_ARTIFACT: 'E:\\Rotaris-0.1.0-windows-x64-portable.exe' };
    const launchArtifact = takeArtifactVariables(env, 'win32');
    expect(env).toEqual({ Path: 'C:\\Windows' });
    const c = classifyInstallation({ platform: 'win32', packaged: true, execPath: 'C:\\Users\\u\\AppData\\Local\\rotaris\\prep\\abc\\Rotaris.exe', env: launchArtifact, installDir: null });
    expect(c).toEqual({ updatable: true, flavour: 'portable', target: 'E:\\Rotaris-0.1.0-windows-x64-portable.exe' });
    // A Rotaris started from inside that one, with the environment its children now carry, classifies from its own
    // launch alone: no variable names the other artifact, so a payload run directly is not updatable (ADR-0054, OQ-84).
    const inherited = classifyInstallation({ platform: 'win32', packaged: true, execPath: 'C:\\tools\\other\\Rotaris.exe', env: takeArtifactVariables({ ...env }, 'win32'), installDir: null });
    expect(inherited.updatable).toBe(false);
  });
});
