import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CANCEL_RUN_TEXT } from './agents.js';
import { ConfirmDialog } from './ConfirmDialog.js';

/**
 * The shared confirmation, which PD-ORCH-005 phase 5 made the Workspace's too (its own copy had no Escape, no
 * description and no focus return — found by phase 5's second review). The markup is what a unit test can read; the
 * Escape key and the focus return are driven against the built product.
 */
describe('the shared confirmation dialog', () => {
  it('is an alert dialog named by its title and described by its body, with the cancel first and focused', () => {
    const html = renderToStaticMarkup(createElement(ConfirmDialog, { title: 'Cancel the run?', body: CANCEL_RUN_TEXT, confirmLabel: 'Cancel the run', cancelLabel: 'Keep running', destructive: true, onConfirm: () => undefined, onCancel: () => undefined }));
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain(`<h2 id="${labelledBy}" class="dialog-title">Cancel the run?</h2>`);
    expect(html).toContain(`<p id="${describedBy}" class="dialog-body confirm-dialog__body">${CANCEL_RUN_TEXT}</p>`);
    expect(html.indexOf('Keep running')).toBeLessThan(html.indexOf('>Cancel the run<'));
  });

  it('REQ-MONITOR-126: the run\'s cancel states that it cannot be undone, and what it cancels', () => {
    expect(CANCEL_RUN_TEXT).toBe('Cancellation cannot be undone in this session. The active run and every active task agent will be cancelled.');
  });
});
