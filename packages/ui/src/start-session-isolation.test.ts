import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ISOLATION_HINT, ISOLATION_REQUIRED_HINT, ISOLATION_REQUIRED_TOOLTIP, isolationRequiredOf, StartSessionDialog } from './StartSessionDialog.js';

/**
 * PD-GIT-001 (OQ-224): the launch dialog shows main's answer — `session.newId`'s `isolationRequired`, the same count
 * `session.start` forces a worktree on. Before, the renderer locked from its own workspace's session list while main forced
 * on the instance's count, so the two disagreed about a run in another project.
 */
const dialog = (newId: unknown) => renderToStaticMarkup(createElement(StartSessionDialog, {
  sessionId: 's1', runActive: isolationRequiredOf(newId), defaultSandboxMode: 'off', confinement: null,
  onChooseAttach: async () => ({ ok: true as const, cancelled: true as const }), onAccept: () => undefined, onCancel: () => undefined,
}));
const isolationBox = (html: string) => /<input[^>]*data-testid="start-session-isolation"[^>]*>/.exec(html)?.[0] ?? '';

describe("the launch dialog's isolation lock is main's answer (PD-GIT-001, REQ-GIT-118, REQ-GIT-119)", () => {
  it('locks — pre-checked, disabled, with the tooltip and the hint — when main says a run shares the tree', () => {
    const html = dialog({ sessionId: 's1', isolationRequired: true });
    expect(isolationBox(html)).toMatch(/checked=""/);
    expect(isolationBox(html)).toMatch(/disabled=""/);
    expect(html).toContain(`title="${ISOLATION_REQUIRED_TOOLTIP}"`);
    expect(html).toContain(ISOLATION_REQUIRED_HINT.replace(/'/g, '&#x27;'));
  });

  it('is unchecked and enabled, with the normal hint, when main says none does', () => {
    const html = dialog({ sessionId: 's1', isolationRequired: false });
    expect(isolationBox(html)).not.toMatch(/checked=""/);
    expect(isolationBox(html)).not.toMatch(/disabled=""/);
    expect(html).toContain(ISOLATION_HINT);
    expect(html).not.toContain(ISOLATION_REQUIRED_TOOLTIP);
  });

  it('locks when the answer does not say: a count that could not be read is a run active', () => {
    expect(isolationRequiredOf({ sessionId: 's1' })).toBe(true);
    expect(isolationRequiredOf(null)).toBe(true);
    expect(isolationRequiredOf({ sessionId: 's1', isolationRequired: false })).toBe(false);
  });
});
