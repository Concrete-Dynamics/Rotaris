import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as design from './index.js';

describe('production design-system layer', () => {
  it('exports the approved inventory through one subpath', () => {
    expect(Object.keys(design)).toEqual(expect.arrayContaining([
      'Button', 'Kbd', 'SegmentedControl', 'StatusDot', 'Tag', 'ToggleSwitch',
      'Input', 'Select', 'Card', 'KpiCard', 'SectionLabel',
      'ContextRing', 'MeterBar', 'Sparkline', 'Table',
      'Dialog', 'Spinner', 'Tooltip', 'Acknowledgement',
      'Tabs', 'NavRail', 'CommandPalette',
      'ConfirmDialog', 'EmptyState', 'LogPanel', 'PageHeader', 'TableCard',
    ]));
  });

  it('keeps specialised product classes while marking the shared component', () => {
    const markup = renderToStaticMarkup(createElement(design.Button, { className: 'nav-item' }, 'Workspace'));
    expect(markup).toContain('class="nav-item"');
    expect(markup).toContain('data-ui-component="Button"');
    expect(markup).toContain('type="button"');
  });

  it('serializes layout relationships for the rendered audit', () => {
    const attributes = design.layoutContractAttributes({
      id: 'header-actions',
      relations: [{ kind: 'align-x', target: 'content', edge: 'right' }, { kind: 'hit-test' }],
    });
    expect(attributes['data-ui']).toBe('header-actions');
    expect(JSON.parse(attributes['data-ui-contract'] ?? '[]')).toEqual([
      { kind: 'align-x', target: 'content', edge: 'right' },
      { kind: 'hit-test' },
    ]);
  });
});
