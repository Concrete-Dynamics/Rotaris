import { createElement, type FunctionComponent, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as design from './index.js';
import { classes, componentClass } from './shared.js';

/**
 * What a unit test can prove about this layer is what the MARKUP says: the element chosen, the
 * classes kept, the role, the accessible name, the state attribute, and the native attributes a
 * caller passed through. Pointer, keyboard and focus behaviour is proven against the built
 * product (`pnpm layout-proof`, `pnpm ui-audit`, `pnpm theme-proof`) because this repository has
 * no DOM in vitest, and a fake one would be a second opinion about a document that does not exist.
 */
const render = (component: unknown, props: Record<string, unknown>, ...children: ReactNode[]) =>
  renderToStaticMarkup(createElement(component as FunctionComponent<Record<string, unknown>>, props, ...children));

describe('production design-system layer', () => {
  it('exports the approved inventory through one subpath', () => {
    expect(Object.keys(design)).toEqual(expect.arrayContaining([
      'Button', 'Kbd', 'SegmentedControl', 'StatusDot', 'Tag', 'ToggleSwitch',
      'Input', 'TextArea', 'Select', 'SearchableSelect', 'Checkbox', 'Card', 'KpiCard', 'SectionLabel',
      'ContextRing', 'MeterBar', 'Sparkline', 'Table',
      'Dialog', 'Spinner', 'Tooltip', 'Acknowledgement',
      'Tabs', 'NavRail', 'CommandPalette',
      'ConfirmDialog', 'EmptyState', 'LogPanel', 'PageHeader', 'TableCard',
    ]));
  });

  it('marks every component it renders, so the rendered audit can name it', () => {
    const marked: readonly [string, unknown, Record<string, unknown>][] = [
      ['Button', design.Button, {}],
      ['StatusDot', design.StatusDot, {}],
      ['Tag', design.Tag, {}],
      ['ToggleSwitch', design.ToggleSwitch, { checked: false, onChange: () => undefined, label: 'Auto' }],
      ['SegmentedControl', design.SegmentedControl, { options: [{ value: 'a', label: 'A' }], value: 'a', onChange: () => undefined, label: 'Scope' }],
      ['Kbd', design.Kbd, {}],
      ['Input', design.Input, {}],
      ['TextArea', design.TextArea, {}],
      ['Select', design.Select, {}],
      ['SearchableSelect', design.SearchableSelect, { value: '', options: [], ariaLabel: 'Model', onChange: () => undefined }],
      ['Checkbox', design.Checkbox, { label: 'Run isolated' }],
      ['Card', design.Card, {}],
      ['KpiCard', design.KpiCard, { title: 'Runs', value: 4 }],
      ['SectionLabel', design.SectionLabel, {}],
      ['Sparkline', design.Sparkline, { values: [1, 2], label: 'Tokens' }],
      ['MeterBar', design.MeterBar, { value: 1, label: 'Context' }],
      ['ContextRing', design.ContextRing, { value: 1, label: 'Context' }],
      ['Table', design.Table, {}],
      ['Dialog', design.Dialog, { title: 'Confirm' }],
      ['Tooltip', design.Tooltip, { content: 'Hint' }],
      ['Acknowledgement', design.Acknowledgement, { title: 'Copied' }],
      ['AcknowledgementStack', design.AcknowledgementStack, {}],
      ['Spinner', design.Spinner, {}],
      ['Tabs', design.Tabs, { tabs: [], value: '', onChange: () => undefined, label: 'Tabs' }],
      ['NavRail', design.NavRail, { items: [], active: '', onChange: () => undefined }],
      ['CommandPalette', design.CommandPalette, { open: true, query: '', onQueryChange: () => undefined, items: [], onSelect: () => undefined, onClose: () => undefined }],
      ['TableCard', design.TableCard, { title: 'Sessions' }],
      ['PageHeader', design.PageHeader, { title: 'Overview' }],
      ['EmptyState', design.EmptyState, { title: 'Nothing yet' }],
      ['LogPanel', design.LogPanel, {}],
    ];
    for (const [name, component, props] of marked) {
      expect(render(component, props), name).toContain(`data-ui-component="${name}"`);
    }
  });

  describe('docked-strip shells (PD-CHAT-001 revision 2)', () => {
    it('marks the strip shells, so the rendered audit can name them', () => {
      expect(render(design.StripActionButton, { icon: 'ph-paperclip', ariaLabel: 'Attach images' })).toContain('data-ui-component="StripActionButton"');
      expect(render(design.SendPill, { shortLabel: 'Run', sendName: 'Start run. Control Enter submits from anywhere in the window.' })).toContain('data-ui-component="SendPill"');
    });

    it('the send pill carries the spec wording as its accessible name, never as visible copy', () => {
      const markup = render(design.SendPill, { shortLabel: 'Run', sendName: 'Start run. Control Enter submits from anywhere in the window.' });
      expect(markup).toContain('aria-label="Start run. Control Enter submits from anywhere in the window."');
      expect(markup).toContain('>Run<');
      expect(markup).not.toContain('>Start run<');
    });

    it('the strip shell of the searchable picker reads the display map over the chip text', () => {
      const options = [{ value: 'medium', label: 'medium' }, { value: 'high', label: 'high' }];
      const chip = render(design.SearchableSelect, { value: 'medium', options, ariaLabel: 'Reasoning effort', onChange: () => undefined });
      const strip = render(design.SearchableSelect, { value: 'medium', options, ariaLabel: 'Reasoning effort', onChange: () => undefined, strip: { icon: 'ph-brain', labels: { medium: 'Medium' } } });
      expect(chip).toContain('>medium<');
      expect(strip).toContain('>Medium<');
      expect(strip).toContain('strip-btn');
    });

    it('the strip shell of the popover menu reads the display map over the chip value', () => {
      const options = [{ value: 'auto', label: 'Auto' }, { value: 'plan', label: 'Plan' }];
      const chip = render(design.PopoverMenu, { value: 'Auto', options, ariaLabel: 'Mode', onChoose: () => undefined });
      const strip = render(design.PopoverMenu, { value: 'Auto', options, ariaLabel: 'Mode', onChoose: () => undefined, strip: { labels: { Auto: 'Auto' } } });
      expect(chip).toContain('>Auto<');
      expect(strip).toContain('>Auto<');
      expect(strip).toContain('strip-btn');
    });

    it('iconOnly keeps the value mounted for the probes while the compact state hides it', () => {
      const options = [{ value: 'medium', label: 'medium' }, { value: 'high', label: 'high' }];
      const strip = render(design.SearchableSelect, { value: 'medium', options, ariaLabel: 'Reasoning effort', onChange: () => undefined, strip: { icon: 'ph-brain', iconOnly: true } });
      expect(strip).toContain('>medium<');
      const menu = render(design.PopoverMenu, { value: 'auto', options: [{ value: 'auto', label: 'Auto' }], ariaLabel: 'Mode', onChoose: () => undefined, strip: { iconOnly: true } });
      expect(menu).toContain('>auto<');
    });

    it('names a hinted option by its label alone, with the hint as its description (REQ-CHAT-007)', () => {
      const options = [
        { value: 'auto', label: 'Auto', hint: 'start at once' },
        { value: 'plan', label: 'Plan first', hint: 'plan gate first' },
      ];
      const markup = render(design.PopoverMenu, { value: 'auto', options, ariaLabel: 'Mode', onChoose: () => undefined, defaultOpen: true });
      expect(markup).toContain('role="menuitemradio"');
      expect(markup).toContain('aria-labelledby=');
      // The name points at the label span, never at a fused label+hint string.
      expect(markup).toContain('class="chip-menu__label"');
      expect(markup).toContain('class="chip-menu__hint"');
      expect(markup).toContain('aria-describedby=');
      expect(markup).not.toContain('aria-label="Auto');
      expect(markup).not.toContain('aria-label="Plan first');
    });

    it('carries no description on an option with no hint', () => {
      const markup = render(design.PopoverMenu, {
        value: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
        ariaLabel: 'Mode', onChoose: () => undefined, defaultOpen: true,
      });
      expect(markup).toContain('role="menuitemradio"');
      expect(markup).toContain('aria-labelledby=');
      expect(markup).not.toContain('aria-describedby=');
      expect(markup).not.toContain('chip-menu__hint');
    });
  });

  describe('Button', () => {

    it('draws each variant and size through the foundation class', () => {
      expect(render(design.Button, { variant: 'primary' }, 'Save')).toContain('class="btn btn-primary"');
      expect(render(design.Button, { variant: 'danger', size: 'compact' }, 'Delete')).toContain('class="btn btn-danger btn-compact"');
      expect(render(design.Button, {}, 'Discard')).toContain('class="btn btn-secondary"');
    });

    it('keeps a specialised product class exactly, which is what preserves a selector', () => {
      const markup = render(design.Button, { className: 'nav-item' }, 'Workspace');
      expect(markup).toContain('class="nav-item"');
      expect(markup).toContain('type="button"');
    });

    it('does not repeat a foundation class a migrated caller already carried', () => {
      expect(render(design.Button, { className: 'btn btn-primary btn-compact' }, 'Save'))
        .toContain('class="btn btn-primary btn-compact"');
    });

    it('forwards native attributes and stays a button by default', () => {
      const markup = render(design.Button, {
        'data-testid': 'term-clear', disabled: true, 'aria-pressed': true, title: 'Clear', tabIndex: -1,
      }, 'Clear');
      expect(markup).toContain('data-testid="term-clear"');
      expect(markup).toContain('disabled=""');
      expect(markup).toContain('aria-pressed="true"');
      expect(markup).toContain('tabindex="-1"');
      expect(markup).toContain('type="button"');
    });

    it('submits only when the caller asks for it', () => {
      expect(render(design.Button, { type: 'submit' }, 'Send')).toContain('type="submit"');
    });

    it('draws an icon as decoration, never as an accessible name', () => {
      const markup = render(design.Button, { icon: 'ph-copy', 'aria-label': 'Copy' }, null);
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).toContain('aria-label="Copy"');
    });
  });

  describe('state and accessible names', () => {
    it('publishes ToggleSwitch state as a switch with one name', () => {
      const on = render(design.ToggleSwitch, { checked: true, onChange: () => undefined, label: 'Open automatically' });
      expect(on).toContain('role="switch"');
      expect(on).toContain('aria-checked="true"');
      expect(on).toContain('aria-label="Open automatically"');
      expect(on).toContain('class="toggle is-on"');
      const off = render(design.ToggleSwitch, { checked: false, onChange: () => undefined, label: 'Open automatically' });
      expect(off).toContain('aria-checked="false"');
      expect(off).not.toContain('is-on');
    });

    it('lets a caller name a ToggleSwitch by visible text instead, and never carries two names', () => {
      const markup = render(design.ToggleSwitch, {
        checked: false, onChange: () => undefined, label: 'Open automatically', 'aria-labelledby': 'term-auto-open-label',
      });
      expect(markup).toContain('aria-labelledby="term-auto-open-label"');
      expect(markup).not.toContain('aria-label=');
    });

    it('marks the selected tab and the current nav item', () => {
      const tabs = render(design.Tabs, {
        tabs: [{ value: 'prompts', label: 'Prompts' }, { value: 'artifacts', label: 'Artifacts' }],
        value: 'artifacts', onChange: () => undefined, label: 'Library tabs',
      });
      expect(tabs).toContain('role="tablist"');
      expect(tabs).toContain('aria-label="Library tabs"');
      expect(tabs).toContain('class="tab"');
      expect(tabs).toContain('class="tab is-active"');
      expect(tabs).toContain('aria-selected="false"');
      expect((tabs.match(/aria-selected="true"/g) ?? []).length).toBe(1);

      const rail = render(design.NavRail, {
        items: [{ id: 'overview', icon: 'ph-gauge', label: 'Overview' }, { id: 'workspace', icon: 'ph-terminal', label: 'Workspace' }],
        active: 'workspace', onChange: () => undefined,
      });
      expect(rail).toContain('aria-label="Primary views"');
      expect(rail).toContain('class="nav-item is-active"');
      expect((rail.match(/aria-current="page"/g) ?? []).length).toBe(1);
    });

    it('gives a meter its bounds and a spinner and sparkline their names', () => {
      const meter = render(design.MeterBar, { value: 30, max: 120, label: 'Context used' });
      expect(meter).toContain('role="meter"');
      expect(meter).toContain('aria-valuemin="0"');
      expect(meter).toContain('aria-valuemax="120"');
      expect(meter).toContain('aria-valuenow="30"');
      expect(meter).toContain('width:25%');
      expect(render(design.Spinner, { label: 'Loading sessions' })).toContain('aria-label="Loading sessions"');
      expect(render(design.Sparkline, { values: [1, 4, 2], label: 'Tokens per turn' })).toContain('aria-label="Tokens per turn"');
    });

    it('clamps a meter rather than drawing outside itself', () => {
      expect(render(design.MeterBar, { value: 400, max: 100, label: 'Context' })).toContain('width:100%');
      expect(render(design.MeterBar, { value: -4, max: 100, label: 'Context' })).toContain('width:0%');
      expect(render(design.MeterBar, { value: 4, max: 0, label: 'Context' })).toContain('width:0%');
    });

    it('names a dialog by its own title and marks it modal', () => {
      const markup = render(design.Dialog, { title: 'Discard changes?' }, 'This cannot be undone.');
      expect(markup).toContain('role="dialog"');
      expect(markup).toContain('aria-modal="true"');
      const labelled = /aria-labelledby="([^"]+)"/.exec(markup)?.[1];
      expect(labelled).toBeTypeOf('string');
      expect(markup).toContain(`id="${labelled}" class="dialog-title">Discard changes?`);
    });

    it('draws nothing when a dialog or palette is closed', () => {
      expect(render(design.Dialog, { open: false, title: 'Hidden' })).toBe('');
      expect(render(design.CommandPalette, { open: false, query: '', onQueryChange: () => undefined, items: [], onSelect: () => undefined, onClose: () => undefined })).toBe('');
    });
  });

  describe('forms', () => {
    it('keeps the element the semantics need, and pairs a label with its field', () => {
      expect(render(design.TextArea, { rows: 4, value: 'draft', onChange: () => undefined })).toContain('<textarea');
      expect(render(design.Input, { type: 'file', accept: '.png' })).toContain('type="file"');
      const labelled = render(design.Input, { label: 'Worktree name', name: 'worktree' });
      expect(labelled).toContain('<label class="field">');
      expect(labelled).toContain('<span class="field-label">Worktree name</span>');
      expect(labelled).toContain('name="worktree"');
    });

    it('renders options from data with stable values and keeps a disabled one disabled', () => {
      const markup = render(design.Select, {
        label: 'Model', value: 'b', onChange: () => undefined,
        options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C', disabled: true }],
      });
      expect(markup).toContain('<option value="a">A</option>');
      expect(markup).toContain('<option value="c" disabled="">C</option>');
      expect(markup).toContain('class="input select"');
    });

    it('draws the searchable picker as a closed combobox trigger carrying the bare value', () => {
      const markup = render(design.SearchableSelect, {
        value: 'b', ariaLabel: 'Model for tester', onChange: () => undefined,
        options: [{ value: '', label: 'Unset (built-in)' }, { value: 'a', label: 'a' }, { value: 'b', label: 'b' }],
      });
      expect(markup).toContain('data-ui-component="SearchableSelect"');
      expect(markup).toContain('aria-haspopup="listbox"');
      expect(markup).toContain('aria-expanded="false"');
      expect(markup).toContain('aria-label="Model for tester"');
      expect(markup).toContain('data-value="b"');
      // The bare identifier is the visible text — never a decorated label (REQ-CONFIG-432).
      expect(markup).toContain('>b<');
      expect(markup).not.toContain('searchable-select-panel');
    });

    it('names the full value on the trigger tooltip, so a truncated control still reads whole', () => {
      const long = 'openai-compatible--vllm/qwen3.8-flash-next';
      const markup = render(design.SearchableSelect, {
        value: long, ariaLabel: 'Agent model', onChange: () => undefined,
        options: [{ value: long, label: long }],
      });
      expect(markup).toContain(`title="${long}"`);
      const explicit = render(design.SearchableSelect, {
        value: long, ariaLabel: 'Agent model', title: 'Custom reason', onChange: () => undefined,
        options: [{ value: long, label: long }],
      });
      expect(explicit).toContain('title="Custom reason"');
      const withheld = render(design.SearchableSelect, {
        value: 'm', ariaLabel: 'Agent model', onChange: () => undefined,
        options: [{ value: 'm', label: 'm', unavailableReason: 'switched off' }],
      });
      expect(withheld).toContain('title="switched off"');
    });
  });

  describe('SearchableSelect — the searchable model picker (REQ-CONFIG-427..433)', () => {
    it('filters case-insensitively over value and label, keeping the caller order', () => {
      const options = [
        { value: 'small_model', label: 'small_model' },
        { value: 'openai-compatible--vllm/qwen3.8-flash-next', label: 'openai-compatible--vllm/qwen3.8-flash-next' },
        { value: 'openai-compatible--openrouter/anthropic/claude-haiku-latest', label: 'openai-compatible--openrouter/anthropic/claude-haiku-latest' },
      ];
      expect(design.filterSearchableOptions(options, '')).toEqual(options);
      expect(design.filterSearchableOptions(options, '  QWEN  ').map((o) => o.value)).toEqual(['openai-compatible--vllm/qwen3.8-flash-next']);
      // Slot-first order survives filtering (REQ-CONFIG-339).
      expect(design.filterSearchableOptions(options, 'model').map((o) => o.value)).toEqual(['small_model']);
      expect(design.filterSearchableOptions(options, 'openai-compatible').map((o) => o.value)).toEqual([
        'openai-compatible--vllm/qwen3.8-flash-next',
        'openai-compatible--openrouter/anthropic/claude-haiku-latest',
      ]);
      expect(design.filterSearchableOptions(options, 'no-such-model')).toEqual([]);
    });

    it('debounces the filter interval at the product filter precedent', () => {
      expect(design.FILTER_DEBOUNCE_MS).toBe(150);
    });

    it('caps the visible rows at the slash popup figure', () => {
      expect(design.SEARCHABLE_SELECT_MAX_ROWS).toBe(8);
    });

    it('suffixes an unavailable row in words, overridable per vocabulary', () => {
      const unavailable = render(design.SearchableSelect, {
        value: 'm', ariaLabel: 'Agent model', onChange: () => undefined,
        options: [{ value: 'm', label: 'm', unavailableReason: 'switched off' }],
      });
      // Closed trigger shows the suffixed text — the bare id never round-trips decorated (REQ-CONFIG-432).
      expect(unavailable).toContain('m — unavailable');
      const withheld = render(design.SearchableSelect, {
        value: 'm', ariaLabel: 'Agent model', onChange: () => undefined,
        options: [{ value: 'm', label: 'm', unavailableReason: 'quota', suffix: 'withheld: quota' }],
      });
      expect(withheld).toContain('m — withheld: quota');
    });
  });

  describe('Checkbox — OQ-57, drawn from parts the language declares', () => {
    it('keeps the native input and puts its label beside it, on one row', () => {
      const markup = render(design.Checkbox, { label: 'Run in an isolated Git worktree', checked: true, readOnly: true, 'data-testid': 'start-session-isolation' });
      expect(markup).toContain('type="checkbox"');
      expect(markup).toContain('checked=""');
      expect(markup).toContain('data-testid="start-session-isolation"');
      expect(markup).toContain('class="check"');
      expect(markup.indexOf('check__input')).toBeLessThan(markup.indexOf('check__label'));
      expect(markup).toContain('Run in an isolated Git worktree');
    });

    it('draws no label where the row already names it, and says so in the class', () => {
      const markup = render(design.Checkbox, { 'aria-label': 'Select session alpha for trajectory export' });
      expect(markup).toContain('check--bare');
      expect(markup).not.toContain('check__label');
      expect(markup).toContain('aria-label="Select session alpha for trajectory export"');
    });

    it('carries a disabled state onto the control itself, never onto a drawn stand-in', () => {
      expect(render(design.Checkbox, { label: 'Locked', disabled: true })).toContain('disabled=""');
    });
  });

  describe('patterns', () => {
    it('keeps a card’s own product class and adds its kicker and footer', () => {
      const markup = render(design.Card, { className: 'card settings__fatal', title: 'Unresolved', footer: 'Workspace file' }, 'Body');
      expect(markup).toContain('class="card settings__fatal"');
      expect(markup).toContain('<div class="card-kicker">Unresolved</div>');
      expect(markup).toContain('<div class="card-meta">Workspace file</div>');
    });

    it('offers a bounded confirmation, cancel first and focused', () => {
      const markup = render(design.ConfirmDialog, {
        title: 'Delete session?', danger: true, confirmLabel: 'Delete', onConfirm: () => undefined, onCancel: () => undefined,
      }, 'The transcript is removed.');
      expect(markup.indexOf('btn-secondary')).toBeLessThan(markup.indexOf('btn-danger'));
      expect(markup).toContain('autofocus=""');
      expect(markup).toContain('Delete');
    });

    it('keys a log line by its own time and position', () => {
      const markup = render(design.LogPanel, { lines: [{ time: '12:00:01', level: 'warn', text: 'Retrying' }] });
      expect(markup).toContain('class="log-level log-level-warn"');
      expect(markup).toContain('Retrying');
    });

    it('draws its own body when the shorthand is not used', () => {
      expect(render(design.EmptyState, {}, 'Own body')).toContain('Own body');
      expect(render(design.PageHeader, {}, 'Own header')).toContain('Own header');
      expect(render(design.LogPanel, {}, 'Own lines')).toContain('Own lines');
    });

    it('takes the shorthand when it is given, and titles win over a body', () => {
      const markup = render(design.EmptyState, { title: 'No sessions yet', hint: 'Start one from the composer.' }, 'ignored');
      expect(markup).toContain('class="empty-state-title">No sessions yet<');
      expect(markup).toContain('Start one from the composer.');
      expect(markup).not.toContain('ignored');
    });
  });

  describe('layout contracts', () => {
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

    it('publishes nothing when a component has no contract', () => {
      expect(design.layoutContractAttributes(undefined)).toEqual({});
      expect(render(design.Button, {}, 'Plain')).not.toContain('data-ui-contract');
    });

    it('puts the contract on the component root, where the probe reads it', () => {
      const markup = render(design.Table, { ui: { id: 'agents', relations: [{ kind: 'viewport-scroll', axis: 'x', expected: false }] } });
      expect(markup).toContain('data-ui="agents"');
      expect(markup).toContain('viewport-scroll');
    });
  });

  describe('the two class helpers', () => {
    it('drops empty values and keeps the first of each token', () => {
      expect(classes('btn', false, undefined, null, '', 'btn-primary')).toBe('btn btn-primary');
      expect(classes('btn btn-primary', 'btn')).toBe('btn btn-primary');
      expect(classes('  spaced   out  ')).toBe('spaced out');
    });

    it('lets a caller’s class replace the foundation outright', () => {
      expect(componentClass(undefined, 'card')).toBe('card');
      expect(componentClass('   ', 'card')).toBe('card');
      expect(componentClass('card settings__fatal', 'card')).toBe('card settings__fatal');
    });
  });
});
