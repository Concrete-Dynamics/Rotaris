import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * ADR-0049 / PD-WORKSPACE-005: a main window asks main for the notice current before it existed (`notice.current`) once, at
 * boot (docs/defects/fixed/a-main-window-added-after-a-notice-was-published-does-not-show-it.md). `shell.ts` is imported by
 * every window this bundle boots — persona, terminal, approval and the other dialogs too — and only a main window draws the
 * notice, so the request is made under the main role alone (fin44's review of `fin44-notice-reach`: every window sent it).
 * The module runs under Electron with a preload no `node` test reaches, so what pins it is its source; `notice-proof` reads the
 * main window's boot request in the built app.
 */
describe('a window asks for the current notice at boot only when it is a main window (ADR-0049, PD-WORKSPACE-005)', () => {
  const shell = readFileSync(new URL('./shell.ts', import.meta.url), 'utf8');

  it('reads its role from the route, a main window carrying none', () => {
    expect(shell).toContain("const windowRole = new URLSearchParams(window.location.search).get('role') ?? 'main';");
  });

  it('every request for notice.current is made under the main role, after the channel 4 listener', () => {
    const lines = shell.split('\n');
    const asking = lines.filter((line) => line.includes("kind: 'notice.current'"));
    expect(asking).toHaveLength(1);
    expect(asking[0]).toMatch(/^if \(windowRole === 'main'\) void bridge\.command\(\{ kind: 'notice\.current' \}\)/);
    expect(shell.indexOf('bridge.onNotice(')).toBeLessThan(shell.indexOf("kind: 'notice.current'"));
    expect(shell.indexOf('const windowRole')).toBeLessThan(shell.indexOf("kind: 'notice.current'"));
  });
});
