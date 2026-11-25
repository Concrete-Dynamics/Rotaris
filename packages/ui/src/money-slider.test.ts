import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { resolveMoneyStop, type MoneyLevers } from '@rotaris/contracts';
import { markText, MoneyPreview, MONEY_SLIDER_STEPS, moneyChipTitle, roleGroups } from './MoneySlider.js';

const LEVERS: MoneyLevers = {
  strategy: { value: 'orchestrator', origin: 'default' },
  maxActive: { value: 6, origin: 'default' },
  maxDepth: { value: 3, origin: 'default' },
  maxTotal: { value: 20, origin: 'default' },
  entryRole: 'orchestrator',
  roles: [
    { role: 'orchestrator', model: { value: 'large_model', origin: 'default' }, thinking: { value: null, origin: 'default' } },
    { role: 'architect', model: { value: 'large_model', origin: 'workspace' }, thinking: { value: null, origin: 'default' } },
    { role: 'coding-agent', model: { value: 'medium_model', origin: 'default' }, thinking: { value: null, origin: 'default' } },
    { role: 'tester', model: { value: 'medium_model', origin: 'default' }, thinking: { value: null, origin: 'default' } },
    { role: 'librarian', model: { value: 'small_model', origin: 'default' }, thinking: { value: null, origin: 'default' } },
  ],
  slots: { small_model: 's', medium_model: 'm', large_model: 'l' },
  offered: { s: ['low', 'medium', 'high'], m: ['low', 'medium', 'high'], l: [] },
};

describe('PD-ORCH-021 clause 9 — the money slider as the composer draws it', () => {
  it('five stops in clause 9\'s order; the two upper ones carry the warning tone', () => {
    expect(MONEY_SLIDER_STEPS.map((s) => s.label)).toEqual(['Money saver', 'Small budget', 'Regular', 'Strong budget', 'Token burner']);
    expect(MONEY_SLIDER_STEPS.map((s) => s.tone ?? null)).toEqual([null, null, null, 'warn', 'warn']);
  });

  it('the chip\'s tooltip names the stop, its sentence, and whether the session follows the default', () => {
    expect(moneyChipTitle('regular', true)).toBe('Money slider: Regular, the default. Runs as configured: this stop moves nothing.');
    expect(moneyChipTitle('regular', false)).toBe('Money slider: Regular. Runs as configured: this stop moves nothing.');
  });

  it('the entry role stands first and alone; the rest are grouped by identical result, every role named', () => {
    const groups = roleGroups(resolveMoneyStop(LEVERS, 'token_burner'));
    expect(groups.map((g) => g.roles)).toEqual([['orchestrator'], ['architect'], ['coding-agent', 'tester'], ['librarian']]);
    expect(groups[0]!.entry).toBe(true);
  });

  it('marks read moved, set or stays, and an unchanged value carries none', () => {
    expect(markText({ kind: 'moved', direction: 'up', from: 'medium_model' }, 'tier')).toEqual({ visible: 'from medium_model', name: 'One tier higher, from medium_model' });
    expect(markText({ kind: 'set', origin: 'workspace' }, 'tier')).toEqual({ visible: 'set', name: 'Set for this workspace; no stop moves it' });
    expect(markText({ kind: 'stays', reason: 'largest tier' }, 'tier')).toEqual({ visible: 'stays: largest tier', name: 'Stays: largest tier' });
    expect(markText(null, 'tier')).toBeNull();
  });

  it('the preview states no currency and no relative cost (clause 9), and a single run delegates nobody', () => {
    for (const stop of ['money_saver', 'small_budget', 'regular', 'strong_budget', 'token_burner'] as const) {
      const html = renderToStaticMarkup(createElement(MoneyPreview, { resolution: resolveMoneyStop(LEVERS, stop), pointed: false, ruleId: 'r' }));
      expect(html).not.toMatch(/\$|€|cheap|expensive|cost/i);
    }
    const saver = renderToStaticMarkup(createElement(MoneyPreview, { resolution: resolveMoneyStop(LEVERS, 'money_saver'), pointed: true, ruleId: 'r' }));
    expect(saver).toContain('No agent is delegated: a single run works alone.');
    expect(saver).toContain(', if you choose Money saver');
  });

  it('a model offering no levels reads "none"', () => {
    const html = renderToStaticMarkup(createElement(MoneyPreview, { resolution: resolveMoneyStop(LEVERS, 'regular'), pointed: false, ruleId: 'r' }));
    expect(html).toContain('>none<');
  });
});
