import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as React from 'react';

/**
 * REQ-SHELL-055 (`docs/spec/12-desktop-shell-windows/02-title-bar.md`) on the SHARED warning prompt
 * `packages/ui/src/settings/Confirm.tsx` — the one the delete confirmation on the guided `web_search` card draws
 * (`McpSettings.tsx`), and the Security-policy card draws twice more.
 *
 * The UI review of PR #76 (2026-11-09) measured **0 of 2** Escape routes closing that prompt — a `keydown` on
 * `document` and the driver's `chord Escape` — while a click on Cancel closed it, and `document.activeElement` on
 * `body` after Cancel, not on the `[data-websearch-delete]` button that had opened it. `Confirm.tsx` registered
 * nothing; the design system's own `ConfirmDialog.tsx` had answered Escape and returned the opener since
 * PD-ORCH-005 phase 5. On the Settings view the modal IS the only route: REQ-SHELL-055 keeps the window-level
 * handler live on the Workspace alone, and it stands down while any `aria-modal` surface is open, so a prompt
 * that does not answer Escape answers nothing.
 *
 * The repo mounts no DOM under a test environment, so this file drives the two effects the contract lives in
 * rather than the window: `useEffect` is replaced by a collector (the same seam `web-search-card.test.ts` uses for
 * `useState`), the listeners that body registers are held in a fake `window`, and `document.activeElement` is a
 * fake element the focus return is read back from. The markup stays `renderToStaticMarkup`'s, as
 * `confirm-dialog.test.ts` reads it. A passing case therefore fails if the listener goes, if the `busy` guard
 * goes, or if the focus return goes.
 */
const harness = vi.hoisted(() => ({
  bodies: [] as (() => unknown)[],
  listeners: [] as ((event: { key: string; preventDefault: () => void }) => void)[],
  focused: [] as string[],
}));
vi.mock('react', async (importOriginal) => {
  const real = await importOriginal<typeof React>();
  // Effects are collected, never run by React: the server renderer runs none, and these are the behaviour.
  return { ...real, useEffect: (body: () => unknown) => { harness.bodies.push(body); } };
});
const { Confirm } = await import('./Confirm.js');

/** A stand-in for the element the prompt was opened from: connected, and its focus recorded. */
class FakeElement {
  readonly isConnected: boolean = true;
  readonly focus = () => { harness.focused.push('opener'); };
}

beforeEach(() => {
  harness.bodies.length = 0; harness.listeners.length = 0; harness.focused.length = 0;
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('document', { activeElement: new FakeElement() });
  vi.stubGlobal('window', {
    addEventListener: (type: string, listener: (event: { key: string; preventDefault: () => void }) => void) => {
      if (type === 'keydown') harness.listeners.push(listener);
    },
    removeEventListener: () => undefined,
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** One draw plus every effect body, which is what a commit runs; the cleanups a body returns are returned here. */
function draw(props: { busy?: boolean } = {}): { html: string; cleanups: (() => void)[]; onCancel: ReturnType<typeof vi.fn>; onYes: ReturnType<typeof vi.fn> } {
  harness.bodies.length = 0; harness.listeners.length = 0;
  const onCancel = vi.fn(); const onYes = vi.fn();
  const html = renderToStaticMarkup(createElement(Confirm, { title: 'Delete the stored key?', body: 'This removes the key.', onYes, onCancel, busy: props.busy }));
  const cleanups: (() => void)[] = [];
  for (const body of harness.bodies) {
    const cleanup = body();
    if (typeof cleanup === 'function') cleanups.push(cleanup as () => void);
  }
  return { html, cleanups, onCancel, onYes };
}

const escape = { key: 'Escape', preventDefault: vi.fn() };

describe('the shared confirmation answers Escape with its declining answer (REQ-SHELL-055)', () => {
  it('registers one keydown listener and closes on Escape, before the window sees it — fails if the prompt registers nothing', () => {
    const { cleanups, onCancel, onYes } = draw();
    expect(harness.listeners).toHaveLength(1);
    expect(cleanups).toHaveLength(2);
    harness.listeners[0]!(escape);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onYes).not.toHaveBeenCalled();
    // The modal answers FIRST: the event is consumed, so the window-level handler cannot act a second time.
    expect(escape.preventDefault).toHaveBeenCalledTimes(1);
    expect(cleanups[0]).toBeTypeOf('function');
  });

  it('answers no other key, so Escape stays the one dismissal route', () => {
    const { onCancel } = draw();
    harness.listeners[0]!({ key: 'Enter', preventDefault: vi.fn() });
    harness.listeners[0]!({ key: 'a', preventDefault: vi.fn() });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('leaves Escape unanswered while the prompt cannot be answered (`busy`), as ConfirmDialog does', () => {
    const { onCancel } = draw({ busy: true });
    harness.listeners[0]!(escape);
    expect(onCancel).not.toHaveBeenCalled();
    expect(escape.preventDefault).not.toHaveBeenCalled();
  });

  it('holds the answers with `aria-disabled`, never `disabled`, so the button that has focus stays focusable — fails if the held state drops focus to `body` (R4-FND-1, Opus 5.5 review, round 4)', () => {
    const held = draw({ busy: true });
    // The regression this guards: the `web_search` card keeps the dialog open for the length of the delete press
    // (R3-FND-1). A `disabled` answer button cannot hold focus — the browser moves it to `body` — so the whole
    // write-and-re-read window would sit with `body` focused, which is what the fix set out to prevent.
    expect(held.html).not.toMatch(/\sdisabled(?:=|\s|>)/);
    expect((held.html.match(/aria-disabled="true"/g) ?? [])).toHaveLength(2);
    // The press is ignored in the handlers, so no second answer can be taken while the prompt is held: the `aria-disabled`
    // state is the announcement, and the guard is what makes it true.
    expect(held.html).toContain('aria-disabled="true"');
    // …and with `busy` false the buttons are plain again, so the ordinary path is untouched.
    const free = draw();
    expect(free.html).not.toContain('aria-disabled');
    expect(free.html).not.toMatch(/\sdisabled(?:=|\s|>)/);
  });

  it('paints the held answers as held — fails if `aria-disabled` is announced but nothing draws it (R5-FND-1, Opus 5.5 review, round 5)', () => {
    // Rubric D3: what acts looks like it acts. `aria-disabled` alone paints nothing — `.btn:disabled` was the only
    // rule that drew a held control, so after R4-FND-1 (which replaced `disabled` with `aria-disabled` to keep the
    // focused answer focusable) the held answers read as fully live. The rules below restore the look, in the tokens
    // the house already spends, scoped to an alertdialog's answers (the one place an answer is HELD rather than
    // disabled). R6-FND-1: the resting rule must fix ALL FOUR (colour, ground, edge, cursor) and the `:hover` rule
    // must hold the SAME values — a resting rule that left the background and the edge to `.btn-secondary`/
    // `.btn-warning` let the pointer still move the control.
    const css = readFileSync(new URL('../shell.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rest = css.match(/\[role="alertdialog"\] \.dialog-actions \.btn\[aria-disabled='true'\] \{([^}]*)\}/);
    const hover = css.match(/\[role="alertdialog"\] \.dialog-actions \.btn\[aria-disabled='true'\]:hover \{([^}]*)\}/);
    expect(rest).not.toBeNull();
    expect(hover).not.toBeNull();
    for (const decl of ['color: var(--rt-text-disabled)', 'background: var(--rt-bg)', 'border-color: var(--rt-border)', 'cursor: not-allowed']) {
      expect(rest![1]).toContain(decl);
    }
    // The hover rule repeats colour, ground and edge, so a hovered held answer paints EXACTLY what it paints at rest.
    for (const decl of ['color: var(--rt-text-disabled)', 'background: var(--rt-bg)', 'border-color: var(--rt-border)']) {
      expect(hover![1]).toContain(decl);
    }
  });
});

describe('the shared confirmation hands focus back to what opened it (Rubric F3; Guide 05 §4 step 6)', () => {
  it('focuses the opener on unmount, so `document.activeElement` does not fall to `body` — fails if the prompt keeps no opener', () => {
    const { cleanups } = draw();
    // The first effect is the keydown listener, the second returns the focus. Both are the prompt's only work.
    for (const cleanup of cleanups) cleanup();
    expect(harness.focused).toEqual(['opener']);
  });

  it('draws the opener from the document before `autoFocus` moves focus in, so the button that was pressed is the one read', () => {
    // The initializer runs during the render, which is the only moment `document.activeElement` is still the opener:
    // re-rendering the same element with a different active element cannot change what the prompt will focus back.
    const { cleanups } = draw();
    vi.stubGlobal('document', { activeElement: { isConnected: true, focus: () => { harness.focused.push('other'); } } });
    for (const cleanup of cleanups) cleanup();
    expect(harness.focused).toEqual(['opener']);
  });

  it('focuses nothing when the opener left the document (a delete that removed its own button)', () => {
    class Detached extends FakeElement { override readonly isConnected: boolean = false; }
    vi.stubGlobal('document', { activeElement: new Detached() });
    const { cleanups } = draw();
    for (const cleanup of cleanups) cleanup();
    expect(harness.focused).toEqual([]);
  });
});
