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
