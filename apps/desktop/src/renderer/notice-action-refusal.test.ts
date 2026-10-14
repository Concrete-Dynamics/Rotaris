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
