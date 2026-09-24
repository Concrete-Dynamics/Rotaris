import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WindowControls } from './WindowControls.js';

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
  });

  it('changes the middle control to restore while maximized', () => {
    const markup = renderToStaticMarkup(createElement(WindowControls, { ...controls, maximized: true }));

    expect(markup).toContain('aria-label="Restore"');
    expect(markup).toContain('title="Restore"');
    expect(markup).toContain('ph-copy');
    expect(markup).not.toContain('aria-label="Maximize"');
  });
});
