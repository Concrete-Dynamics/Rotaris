import { describe, expect, it } from 'vitest';
import { assignSlots, pickTiers, type AssignableModel } from './slots.js';

const P = 'openai-compatible--openrouter';
const m = (id: string, available = true): AssignableModel => ({ qualifiedId: `${P}/${id}`, id, available });

describe('automatic tier assignment (REQ-PROVIDER-081/082; ADR-0032: pure and total)', () => {
  it('never picks a mini or nano as large; medium is not large; small is neither', () => {
    const picks = pickTiers([m('openai/gpt-4o-mini'), m('openai/gpt-4o'), m('anthropic/claude-haiku-4.5'), m('anthropic/claude-sonnet-4')]);
    expect(picks.large).not.toMatch(/mini|nano/);
    expect(picks.medium).not.toBe(picks.large);
    expect(picks.small).not.toBe(picks.large);
    expect(picks.small).not.toBe(picks.medium);
  });
  it('is deterministic under any discovery order, breaking ties by the lowest qualified id', () => {
    const models = [m('z/gpt-4o'), m('a/gpt-4o'), m('b/gpt-4o-mini'), m('c/claude-haiku-4.5')];
    const a = assignSlots(models);
    const b = assignSlots([...models].reverse());
    expect(a).toEqual(b);
    // Two models match the same preferred fragment; the lowest qualified id wins.
    expect(a.large_model).toBe(`${P}/a/gpt-4o`);
    expect(a.medium_model).toBe(`${P}/b/gpt-4o-mini`);
    expect(a.small_model).toBe(`${P}/c/claude-haiku-4.5`);
  });
  it('closes gaps in the fixed order and falls back to the single deterministic choice (REQ-PROVIDER-082)', () => {
    const only = assignSlots([m('vendor/thing-b'), m('vendor/thing-a')]);
    expect(only.large_model).toBe(`${P}/vendor/thing-a`);
    expect(only.medium_model).toBe(`${P}/vendor/thing-a`);
    expect(only.small_model).toBe(`${P}/vendor/thing-a`);
    expect(only.default_summary_model).toBe(`${P}/vendor/thing-a`);
    expect(only.fallback_model).toBeNull();
    // A lone model matching only the small tier: the small pick, and every slot closes onto it.
    const smallOnly = assignSlots([m('acme/haiku-lite')]);
    expect(smallOnly.picks).toEqual({ large: null, medium: null, small: `${P}/acme/haiku-lite` });
    expect(smallOnly.large_model).toBe(`${P}/acme/haiku-lite`);
    expect(smallOnly.fallback_model).toBe(`${P}/acme/haiku-lite`);
  });
  it('unavailable models are never assigned; an empty catalogue leaves every slot unset', () => {
    const r = assignSlots([m('openai/gpt-4o', false)]);
    expect(r).toMatchObject({ large_model: null, medium_model: null, small_model: null, default_summary_model: null, fallback_model: null });
    expect(assignSlots([]).large_model).toBeNull();
  });
  it('server-side suggestions replace the pick for their role only when they name a discovered model (REQ-PROVIDER-077/082)', () => {
    const r = assignSlots([m('openai/gpt-4o'), m('openai/gpt-4o-mini')], { large: `${P}/openai/gpt-4o-mini`, fallback: `${P}/nope` });
    expect(r.large_model).toBe(`${P}/openai/gpt-4o-mini`);
    expect(r.fallback_model).toBe(r.picks.small);
  });
});
