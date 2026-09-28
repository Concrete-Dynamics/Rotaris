import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WINDOW_CONTROLS_LAYOUT, WindowControls } from './WindowControls.js';

const controls = {
  minimized: false,
  maximized: false,
  onMinimize: vi.fn(),
  onToggleMaximize: vi.fn(),
  onClose: vi.fn(),
};

describe('PD-SHELL-003 window controls', () => {
  it('draws minimize, maximize and close in platform order', () => {
    const markup = renderToStaticMarkup(createElement(WindowControls, controls));

    expect(markup.indexOf('Minimize')).toBeLessThan(markup.indexOf('Maximize'));
    expect(markup.indexOf('Maximize')).toBeLessThan(markup.indexOf('Close window'));
    expect(markup).toContain('ph-minus');
    expect(markup).toContain('ph-square');
    expect(markup).toContain('ph-x');
    expect(markup).toContain('role="group"');
  });

  it('changes the middle control to restore while maximized', () => {
    const markup = renderToStaticMarkup(createElement(WindowControls, { ...controls, maximized: true }));

    expect(markup).toContain('aria-label="Restore"');
    expect(markup).toContain('title="Restore"');
    expect(markup).toContain('ph-copy');
    expect(markup).not.toContain('aria-label="Maximize"');
  });

  it('publishes its layout contract as the relations array ui-audit iterates (PD-SHELL-003)', () => {
    const markup = renderToStaticMarkup(createElement(WindowControls, controls));
    const attribute = /data-ui-contract="([^"]*)"/.exec(markup)?.[1];
    expect(attribute).toBeDefined();
    const relations: unknown = JSON.parse((attribute ?? '').replaceAll('&quot;', '"').replaceAll('&amp;', '&'));

    // The hand-written form this replaced was {"relations":[…]}, and the audit's for…of threw on it.
    expect(Array.isArray(relations)).toBe(true);
    expect(relations).toEqual([{ kind: 'containment', target: 'shell-title' }]);
    expect(relations).toEqual(WINDOW_CONTROLS_LAYOUT.relations);
    expect(markup).toContain('data-ui="shell-window-controls"');
  });
});
