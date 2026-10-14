import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CheckpointPreviewPayload } from '@rotaris/contracts';
import { RestoreConfirmDialog } from './CheckpointDialogs.js';
import { cascadeOf, classesOf, type CascadeElement } from './css-cascade.js';

/*
 * What the renderer's stylesheets give the restore confirmation's preview field, read the way the cascade reads them
 * (`css-cascade.ts`, the reading the artifact inspector's editor test made): every sheet `apps/desktop/src/renderer/design.css`
 * imports, in its order, each rule matched against the dialog's own markup.
 *
 * docs/defects/fixed/the-restore-confirmations-preview-field-is-not-drawn-in-the-monospace-face.md: the field is a
 * `textarea.input` carrying `mono checkpoint-dialog__preview`, and the adopted `textarea.input { font-family: inherit }` (0,1,1)
 * outranked both single classes (0,1,0), so REQ-GIT-064's text — its paths aligned after a 9-character verb column — was drawn
 * in the dialog's proportional face. REQ-GIT-097: "the restore preview text of REQ-GIT-064 in a read-only monospace field";
 * REQ-GIT-152 names that field among the visual properties that hold.
 */
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const { declarations, winner } = cascadeOf([
  read('../../../docs/design/system/base.css'),
  read('../../../docs/design/system/components.css'),
  read('../../../docs/design/system/motif.css'),
  read('./shell.css'),
]);

const preview: CheckpointPreviewPayload = {
  sessionId: 's1', sequence: 2, treeRoot: '/ws', entries: [{ status: 'M', path: 'src/a.ts' }], dirty: [], blockedReason: '',
  text: 'Restore checkpoint 2\n\nmodified src/a.ts\nadded    src/b.ts\n', summary: 'This replaces 1 file in /ws.', restorable: true,
};
const html = renderToStaticMarkup(createElement(RestoreConfirmDialog, { preview, onConfirm: () => undefined, onCancel: () => undefined }));
const chain: CascadeElement[] = [
  { tag: 'div', classes: classesOf(html, /<div class="(dialog-backdrop[^"]*)"/) },
  { tag: 'div', classes: classesOf(html, /<div class="([^"]*)"[^>]*data-testid="checkpoint-confirm"/) },
  { tag: 'textarea', classes: classesOf(html, /<textarea[^>]*class="([^"]*)"[^>]*data-testid="checkpoint-preview-text"/) },
];

describe('REQ-GIT-097, REQ-GIT-152: the restore preview is drawn in a read-only monospace field', () => {
  it('reads the field\'s own markup: a read-only textarea.input inside the confirmation dialog', () => {
    expect(chain[0]!.classes).toEqual(['dialog-backdrop']);
    expect(chain[1]!.classes).toEqual(expect.arrayContaining(['dialog', 'checkpoint-dialog', 'checkpoint-dialog--confirm']));
    expect(chain[2]!.classes).toEqual(expect.arrayContaining(['input', 'mono', 'checkpoint-dialog__preview']));
    expect(html).toMatch(/<textarea[^>]*readOnly=""[^>]*data-testid="checkpoint-preview-text"|<textarea[^>]*data-testid="checkpoint-preview-text"[^>]*readOnly=""/);
    // The adopted rule the field has to outrank is present and as specific as the defect found it.
    expect(declarations(chain, 'font-family').some((d) => d.selector === 'textarea.input' && d.value === 'inherit')).toBe(true);
  });

  it('the font family that wins is the monospace token', () => {
    const won = winner(chain, 'font-family', 'font');
    expect(won?.value, JSON.stringify(won)).toMatch(/^var\(--rt-font-mono\b/);
  });

  it('keeps REQ-GIT-064\'s lines as written: no wrapping, its own size and leading', () => {
    expect(winner(chain, 'white-space')?.value).toBe('pre');
    expect(winner(chain, 'font-size', 'font')?.value).toMatch(/^var\(--rt-text-sm\b/);
    expect(winner(chain, 'line-height')?.value).toBe('1.5');
  });
});
