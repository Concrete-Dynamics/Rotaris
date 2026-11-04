import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RENDER_FAILURE_WORDS, RenderFailureBoundary, RenderFailureFallback } from './patterns.js';

/**
 * R-091 (hardening §3.2 row 4): the boundary every window's root is wrapped in. These tests run on Node with no DOM (the
 * package's convention: markup through `react-dom/server`), and React's server renderer runs no error boundary, so the catch
 * itself — React handing a child's throw to `getDerivedStateFromError` and drawing the fallback in place of the tree — is
 * measured in the built app by `exit-trace-proof`'s `render-fault` launch. What is read here is the boundary's own half: the
 * child that throws puts it in its failed state, and in that state it draws the language's empty state with the one action,
 * and not the child.
 */
function Thrower(): never {
  throw new Error('a component threw while it was drawn');
}

/** The boundary as React drives it after a child threw: the state the static derives, then `render`. */
function drawnAfterAThrow(onReload: () => void, child: ReactNode): ReactNode {
  const boundary = new RenderFailureBoundary({ onReload, children: child });
  boundary.state = RenderFailureBoundary.getDerivedStateFromError();
  return boundary.render();
}

describe('RenderFailureBoundary — a window whose tree throws draws the fallback, not a blank window (R-091)', () => {
  it('draws its children while nothing has thrown', () => {
    const boundary = new RenderFailureBoundary({ onReload: () => undefined, children: createElement('p', null, 'the shell') });
    expect(boundary.state).toEqual({ failed: false });
    expect(renderToStaticMarkup(boundary.render() as ReactElement)).toBe('<p>the shell</p>');
  });

  it('a child that throws while drawn puts it in its failed state, where it draws the fallback and not the child', () => {
    let thrown: unknown;
    try { Thrower(); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(Error);
    const drawn = drawnAfterAThrow(() => undefined, createElement(Thrower));
    expect(isValidElement(drawn)).toBe(true);
    const html = renderToStaticMarkup(drawn as ReactElement);
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-ui-component="RenderFailureFallback"');
    expect(html).toContain(`<div class="empty-state-title">${RENDER_FAILURE_WORDS.title}</div>`);
    expect(html).toContain(RENDER_FAILURE_WORDS.hint.replace(/'/g, '&#x27;'));
    expect(html).toContain(`>${RENDER_FAILURE_WORDS.action}</button>`);
    expect(html).toContain('ph-warning-octagon');
    expect(html).not.toContain('a component threw');
  });

  it('the server renderer, which runs no boundary, would throw the child\'s error out — the reason the catch is measured in the built app', () => {
    expect(() => renderToStaticMarkup(createElement(RenderFailureBoundary, { onReload: () => undefined }, createElement(Thrower)))).toThrow('a component threw while it was drawn');
  });

  it('the fallback\'s one action is the reload it was given, drawn as the language\'s primary button', () => {
    const onReload = vi.fn();
    const fallback = RenderFailureFallback({ onReload }) as ReactElement<{ children: ReactElement<{ action: ReactElement<{ onClick: () => void; variant: string; children: string }> }> }>;
    const action = fallback.props.children.props.action;
    expect(action.props.variant).toBe('primary');
    expect(action.props.children).toBe('Reload this window');
    action.props.onClick();
    expect(onReload).toHaveBeenCalledOnce();
  });
});
