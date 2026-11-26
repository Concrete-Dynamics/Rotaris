import { describe, expect, it } from 'vitest';
import { childLimitsLabel, moneyAuditOf, moneyIntentHold, resolveMoneyStop, type LeverOrigin, type MoneyLevers, type RoleLevers } from './money-slider.js';

const LEVELS = ['low', 'medium', 'high'];
function role(name: string, model: string, origin: LeverOrigin = 'default', thinking: string | null = null, thinkingOrigin: LeverOrigin = 'default'): RoleLevers {
  return { role: name, model: { value: model, origin }, thinking: { value: thinking, origin: thinkingOrigin } };
}
function levers(over: Partial<MoneyLevers> = {}): MoneyLevers {
  return {
    strategy: { value: 'orchestrator', origin: 'default' },
    maxActive: { value: 6, origin: 'default' }, maxDepth: { value: 3, origin: 'default' }, maxTotal: { value: 20, origin: 'default' },
    entryRole: 'orchestrator',
    roles: [role('orchestrator', 'large_model'), role('coding-agent', 'medium_model'), role('librarian', 'small_model')],
    slots: { small_model: 'small', medium_model: 'mid', large_model: 'big' },
    offered: { mid: LEVELS, big: LEVELS },
    ...over,
  };
}
const byRole = (r: ReturnType<typeof resolveMoneyStop>, name: string) => r.roles.find((x) => x.role === name)!;

describe('PD-ORCH-021: what each stop does to the levers a user left unset (clause 3)', () => {
  it('regular moves nothing', () => {
    const r = resolveMoneyStop(levers(), 'regular');
    expect(r.strategy).toEqual({ value: 'orchestrator', mark: null });
    expect(r.roles.every((x) => x.model.mark === null && x.thinking.mark === null)).toBe(true);
    expect(r.budget).toBe('cell');
    expect(r.rule).toBeNull();
  });
  it('money saver takes the run under single, the entry role one tier and one level lower, and no limits apply', () => {
    const r = resolveMoneyStop(levers(), 'money_saver');
    expect(r.strategy).toEqual({ value: 'single', mark: { kind: 'moved', direction: 'changed', from: 'orchestrator' } });
    expect(byRole(r, 'orchestrator').model).toEqual({ value: 'medium_model', mark: { kind: 'moved', direction: 'down', from: 'large_model' } });
    expect(byRole(r, 'orchestrator').modelKey).toBe('mid');
    // Clause 6: no level of its own is counted from the middle level of the model it lands on.
    expect(byRole(r, 'orchestrator').thinking).toEqual({ value: 'low', mark: { kind: 'moved', direction: 'down', from: 'default' } });
    expect(r.limits).toBeNull();
  });
  it('small budget takes lead and moves every delegated agent one tier lower, the entry role unchanged', () => {
    const r = resolveMoneyStop(levers(), 'small_budget');
    expect(r.strategy.value).toBe('lead');
    expect(byRole(r, 'orchestrator').model.mark).toBeNull();
    expect(byRole(r, 'coding-agent').model.value).toBe('small_model');
    expect(byRole(r, 'librarian').model.mark).toEqual({ kind: 'stays', reason: 'smallest tier' });
    expect(byRole(r, 'coding-agent').thinking.mark).toBeNull();
  });
  it('strong budget lifts the entry role, widens the limits to 8 and 30 and the clamp one step', () => {
    const r = resolveMoneyStop(levers(), 'strong_budget');
    expect(byRole(r, 'orchestrator').model.mark).toEqual({ kind: 'stays', reason: 'largest tier' });
    expect(byRole(r, 'orchestrator').thinking.value).toBe('high');
    expect(byRole(r, 'coding-agent').model.mark).toBeNull();
    expect(r.limits?.maxActive.value).toBe(8);
    expect(r.limits?.maxTotal.value).toBe(30);
    expect(r.limits?.maxDepth.mark).toBeNull();
    expect(r.budget).toBe('one_wider');
  });
  it('token burner lifts every agent, and its limits are 12 and 40 with no clamp', () => {
    const r = resolveMoneyStop(levers(), 'token_burner');
    expect(byRole(r, 'coding-agent').model.value).toBe('large_model');
    expect(byRole(r, 'librarian').model.value).toBe('medium_model');
    expect(r.limits && childLimitsLabel(r.limits)).toBe('12 at once · no depth limit · 40 in all');
    expect(r.budget).toBe('wide');
  });
});

describe('clause 2: a lever the user set is never moved', () => {
  it('a set strategy, model, level and limit stay, each marked set', () => {
    const r = resolveMoneyStop(levers({
      strategy: { value: 'intelligent', origin: 'workspace' },
      maxActive: { value: 3, origin: 'global' },
      roles: [role('orchestrator', 'big', 'session', 'low', 'workspace'), role('coding-agent', 'medium_model')],
    }), 'token_burner');
    expect(r.strategy).toEqual({ value: 'intelligent', mark: null });
    expect(r.limits?.maxActive).toEqual({ value: 3, mark: { kind: 'set', origin: 'global' } });
    expect(byRole(r, 'orchestrator').model).toEqual({ value: 'big', mark: { kind: 'set', origin: 'session' } });
    expect(byRole(r, 'orchestrator').thinking).toEqual({ value: 'low', mark: { kind: 'set', origin: 'workspace' } });
    expect(resolveMoneyStop(levers({ strategy: { value: 'swarm', origin: 'workspace' } }), 'money_saver').strategy.mark).toEqual({ kind: 'set', origin: 'workspace' });
  });
  it('a discovered value is no choice of the user\'s', () => {
    const r = resolveMoneyStop(levers({ roles: [role('orchestrator', 'large_model', 'discovered')] }), 'money_saver');
    expect(r.roles[0]!.model.value).toBe('medium_model');
  });
  it('every lever set reads allSet', () => {
    const set = levers({
      strategy: { value: 'orchestrator', origin: 'workspace' }, maxActive: { value: 6, origin: 'workspace' }, maxTotal: { value: 20, origin: 'workspace' },
      roles: [role('orchestrator', 'big', 'workspace', 'low', 'workspace')],
    });
    expect(resolveMoneyStop(set, 'strong_budget').allSet).toBe(true);
    expect(resolveMoneyStop(levers(), 'strong_budget').allSet).toBe(false);
  });
});

describe('clauses 5 and 6: the ends of a step', () => {
  it('a role on a model key has no tier, and a neighbouring slot holding no model stops the step', () => {
    const r = resolveMoneyStop(levers({ slots: { small_model: null, medium_model: 'mid', large_model: 'big' }, roles: [role('orchestrator', 'mid'), role('coding-agent', 'medium_model')] }), 'token_burner');
    expect(byRole(r, 'orchestrator').model.mark).toEqual({ kind: 'stays', reason: 'no tier' });
    const down = resolveMoneyStop(levers({ slots: { small_model: null, medium_model: 'mid', large_model: 'big' }, roles: [role('orchestrator', 'large_model'), role('coding-agent', 'medium_model')] }), 'small_budget');
    expect(byRole(down, 'coding-agent').model.mark).toEqual({ kind: 'stays', reason: 'no smaller model configured' });
  });
  it('a level is stepped along the resulting model\'s levels and stops at either end; a model with none is left alone', () => {
    const top = resolveMoneyStop(levers({ roles: [role('orchestrator', 'large_model', 'default', 'high')] }), 'strong_budget');
    expect(top.roles[0]!.thinking).toEqual({ value: 'high', mark: { kind: 'stays', reason: 'highest level' } });
    const none = resolveMoneyStop(levers({ roles: [role('orchestrator', 'medium_model')] }), 'money_saver');
    expect(none.roles[0]!.modelKey).toBe('small');
    expect(none.roles[0]!.thinking).toEqual({ value: null, mark: { kind: 'stays', reason: 'no levels' } });
  });
});

describe('clause 4: the classified intent bounds the stop', () => {
  it('an answer, a clarification or a micro edit runs the upper stops as regular', () => {
    expect(moneyIntentHold('question')).toBe('answer');
    expect(moneyIntentHold('ambiguous')).toBe('answer');
    expect(moneyIntentHold('single_file_change')).toBe('answer');
    const r = resolveMoneyStop(levers(), 'token_burner', 'answer');
    expect(r.roles.every((x) => x.model.mark === null)).toBe(true);
    expect(r.limits?.maxActive.value).toBe(6);
    expect(r.budget).toBe('cell');
  });
  it('a large build keeps the entry role at money saver, under single', () => {
    expect(moneyIntentHold('architectural')).toBe('large_build');
    const r = resolveMoneyStop(levers(), 'money_saver', 'large_build');
    expect(r.strategy.value).toBe('single');
    expect(r.roles[0]!.model.mark).toBeNull();
  });
  it('the rule is written only while the intent is unknown', () => {
    expect(resolveMoneyStop(levers(), 'money_saver').rule).toMatch(/^Except on a large build/);
    expect(resolveMoneyStop(levers(), 'money_saver', 'none').rule).toBeNull();
  });
});

describe('clause 7: the audit names the stop and, per lever, moved or set', () => {
  it('records each lever', () => {
    const audit = moneyAuditOf(resolveMoneyStop(levers({ maxActive: { value: 3, origin: 'workspace' } }), 'strong_budget', 'none'));
    expect(audit.stop).toBe('strong_budget');
    expect(audit.levers['strategy']).toBe('unchanged');
    expect(audit.levers['runtime.max_active_children']).toBe('set');
    expect(audit.levers['runtime.max_children']).toBe('moved');
    expect(audit.levers['personas.orchestrator.thinking']).toBe('moved');
  });
});
