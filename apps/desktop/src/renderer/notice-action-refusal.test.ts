import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CommandOutcome, CommandRequest } from '@rotaris/contracts';
import { reportNoticeActionRefusal } from './notice-action-refusal.js';

/**
 * REQ-NOTIFY-254 / REQ-NOTIFY-003: a notice action main refuses is said on screen, in main's words, as a persistent notice
 * (docs/defects/fixed/a-refused-hook-review-notice-action-is-reported-only-to-the-renderer-console.md). `notice-proof` section 6e
 * presses the hook review where it is refused in the built app and reads the notice.
 */
function harness(reply: CommandOutcome | Error = { ok: true, value: { id: 7 } }) {
  const sent: CommandRequest[] = [];
  const lines: string[] = [];
  const bridge = { command: async (req: CommandRequest) => { sent.push(req); if (reply instanceof Error) throw reply; return reply; } };
  return { sent, lines, report: (pending: Promise<CommandOutcome>) => reportNoticeActionRefusal(bridge, 'open-hook-review', pending, (l) => { lines.push(l); }) };
}

describe('a refused notice action is published where it was pressed (REQ-NOTIFY-254, REQ-NOTIFY-003)', () => {
  it('publishes the refusal as a persistent warning notice, its headline the title and its detail the detail', async () => {
    const h = harness();
    await h.report(Promise.resolve({ ok: false, code: 'hooks.review', headline: 'The review dialog could not be opened', detail: 'Error: load failed' }));
    expect(h.sent).toEqual([{ kind: 'notice.report', severity: 'warning', title: 'The review dialog could not be opened', detail: 'Error: load failed', persistent: true }]);
    expect(h.lines).toEqual(['notice action "open-hook-review" was refused: The review dialog could not be opened (hooks.review)']);
  });

  it('carries no detail when main gave none', async () => {
    const h = harness();
    await h.report(Promise.resolve({ ok: false, code: 'workspace.none', headline: 'Open a workspace before reviewing its hooks' }));
    expect(h.sent).toEqual([{ kind: 'notice.report', severity: 'warning', title: 'Open a workspace before reviewing its hooks', persistent: true }]);
  });

  it('publishes nothing for an action that was carried out', async () => {
    const h = harness();
    await h.report(Promise.resolve({ ok: true }));
    expect(h.sent).toEqual([]);
    expect(h.lines).toEqual([]);
  });

  it('does not publish a second time a refused reach REQ-SHELL-019 already reported', async () => {
    for (const code of ['workspace.openFailed', 'workspace.buildFailed']) {
      const h = harness();
      await h.report(Promise.resolve({ ok: false, code, headline: 'Could not open the selected project: /w/gone could not be opened as a workspace.' }));
      expect(h.sent).toEqual([]);
      expect(h.lines).toEqual([`notice action "open-hook-review" was refused: Could not open the selected project: /w/gone could not be opened as a workspace. (${code})`]);
    }
  });

  it('says a command main never answered, rather than dropping the rejection', async () => {
    const h = harness();
    await h.report(Promise.reject(new Error('channel closed')));
    expect(h.sent).toEqual([{ kind: 'notice.report', severity: 'warning', title: 'The application did not answer', detail: 'channel closed', persistent: true }]);
  });

  it('never throws when the notice itself cannot be published', async () => {
    const h = harness(new Error('channel closed'));
    await expect(h.report(Promise.resolve({ ok: false, code: 'hooks.none', headline: 'This workspace declares no hooks' }))).resolves.toBeUndefined();
  });
});

/**
 * The arm in `dispatchNoticeAction` runs under Electron with a preload no `node` test reaches, so what pins its wiring is its
 * source, as `notice-boot-wiring.test.ts` pins the boot request.
 */
describe("the hook-review arm hands main's answer to the refusal report", () => {
  const main = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
  const arm = main.slice(main.indexOf("case 'open-hook-review':"), main.indexOf("case 'open-provider-sign-in':"));

  it("passes the hooks.review outcome to reportNoticeActionRefusal and writes no console warning of its own", () => {
    expect(arm.length).toBeGreaterThan(0);
    expect(arm).toContain("void reportNoticeActionRefusal(bridge, 'open-hook-review', bridge.command({ kind: 'hooks.review', workspace: action.workspace }));");
    expect(arm).not.toContain('console.warn');
  });
});

/**
 * The two sibling arms that send a command and read its outcome: `focus-session` (`session.focusFromNotice`, PD-SHELL-001
 * revision 3) and `open-project-init` (`projectInit.open`, PD-WORKSPACE-005 revision 3). Main refuses them with "The window
 * holding the session closed before it could focus it" / "…the project closed before Settings › Project could open"
 * (`window.gone`), "No main window is open" (`window.notMain`) or a refused reach; until 2026-10-15 each arm wrote the refusal to
 * the console alone (docs/defects/fixed/a-refused-focus-session-or-project-setup-notice-action-is-reported-only-to-the-renderer-console.md).
 * `notice-proof` section 6f presses both where the reach is refused in the built app.
 */
describe("the focus-session and project-setup arms hand main's answer to the refusal report", () => {
  const main = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
  const armOf = (from: string, to: string) => main.slice(main.indexOf(from), main.indexOf(to));

  it('passes the session.focusFromNotice outcome to reportNoticeActionRefusal and writes no console warning of its own', () => {
    const arm = armOf("case 'focus-session':", "case 'open-library':");
    expect(arm.length).toBeGreaterThan(0);
    expect(arm).toContain("void reportNoticeActionRefusal(bridge, 'focus-session', bridge.command({ kind: 'session.focusFromNotice', sessionId: action.sessionId, workspace: action.workspace }));");
    expect(arm).not.toContain('console.warn');
  });

  it('passes the projectInit.open outcome to reportNoticeActionRefusal and writes no console warning of its own', () => {
    const arm = armOf("case 'open-project-init':", "case 'open-cloud-account':");
    expect(arm.length).toBeGreaterThan(0);
    expect(arm).toContain("void reportNoticeActionRefusal(bridge, 'open-project-init', bridge.command({ kind: 'projectInit.open', workspace: action.workspace }));");
    expect(arm).not.toContain('console.warn');
  });
});

describe('a refused focus-session or project-setup press is published in main\'s words (REQ-NOTIFY-254, REQ-NOTIFY-003)', () => {
  const cases: readonly [string, CommandOutcome][] = [
    ['focus-session', { ok: false, code: 'window.gone', headline: 'The window holding the session closed before it could focus it' }],
    ['focus-session', { ok: false, code: 'window.notMain', headline: 'No main window is open' }],
    ['open-project-init', { ok: false, code: 'window.gone', headline: 'The window holding the project closed before Settings › Project could open' }],
  ];
  for (const [action, outcome] of cases) {
    it(`${action}: ${outcome.ok ? '' : outcome.code}`, async () => {
      const sent: CommandRequest[] = [];
      const lines: string[] = [];
      await reportNoticeActionRefusal({ command: async (req: CommandRequest) => { sent.push(req); return { ok: true, value: { id: 1 } }; } }, action, Promise.resolve(outcome), (l) => { lines.push(l); });
      if (outcome.ok) throw new Error('unreachable');
      expect(sent).toEqual([{ kind: 'notice.report', severity: 'warning', title: outcome.headline, persistent: true }]);
      expect(lines).toEqual([`notice action "${action}" was refused: ${outcome.headline} (${outcome.code})`]);
    });
  }
});
