import { describe, expect, it } from 'vitest';
import { costAskFor, costOf, decimalFromNumber, reportedCostExtractor, reportedCostFrom } from './reported-cost.js';

/**
 * PD-MONITOR-001's two halves at the model boundary: the ask is sent only where the protocol defines
 * one, and the figure that comes back survives the SDK's usage mapping by travelling as metadata.
 */
describe('model — the provider-reported cost (PD-MONITOR-001)', () => {
  it('asks only the endpoints whose protocol defines the field', () => {
    expect(costAskFor('https://openrouter.ai/api/v1')).toEqual({ usage: { include: true } });
    expect(costAskFor('https://OPENROUTER.AI/api/v1')).toEqual({ usage: { include: true } });
    // A strict OpenAI-shaped endpoint answers an unrecognised body field with a 400, so it is asked nothing.
    expect(costAskFor('https://api.openai.com/v1')).toBeNull();
    expect(costAskFor('https://acme.example/v1')).toBeNull();
    expect(costAskFor(undefined)).toBeNull();
    expect(costAskFor('not a url')).toBeNull();
  });

  it('carries the number across as a plain decimal string, exponent form expanded and nothing computed', () => {
    expect(decimalFromNumber(0.0123)).toBe('0.0123');
    expect(decimalFromNumber(1.2e-7)).toBe('0.00000012');
    expect(decimalFromNumber(1.5e2)).toBe('150');
    expect(decimalFromNumber(0)).toBe('0');
    expect(decimalFromNumber(-1)).toBeNull();
    expect(decimalFromNumber('0.01')).toBeNull();
    expect(decimalFromNumber(undefined)).toBeNull();
    expect(decimalFromNumber(Number.NaN)).toBeNull();
  });

  it('reads the figure off a chunk, and reads nothing off a chunk that carries none', () => {
    expect(costOf({ usage: { cost: 0.002, prompt_tokens: 10 } })).toBe('0.002');
    expect(costOf({ usage: { prompt_tokens: 10 } })).toBeNull();
    expect(costOf({})).toBeNull();
    expect(costOf(null)).toBeNull();
  });

  it('takes the LAST reading of a stream — one request reporting twice is reporting its own running total', () => {
    const stream = reportedCostExtractor().createStreamExtractor();
    stream.processChunk({ choices: [] });
    stream.processChunk({ usage: { cost: 0.001 } });
    stream.processChunk({ usage: { cost: 0.0025 } });
    stream.processChunk({ choices: [] });
    expect(reportedCostFrom(stream.buildMetadata())).toBe('0.0025');
  });

  it('builds no metadata at all when the provider reported no cost, which is not the same as zero', () => {
    const stream = reportedCostExtractor().createStreamExtractor();
    stream.processChunk({ usage: { prompt_tokens: 7, completion_tokens: 2 } });
    expect(stream.buildMetadata()).toBeUndefined();
    expect(reportedCostFrom(undefined)).toBeNull();
    expect(reportedCostFrom({ other: { reportedCost: '0.01' } })).toBeNull();
  });

  it('reads a whole non-streamed body the same way', async () => {
    await expect(reportedCostExtractor().extractMetadata({ parsedBody: { usage: { cost: 0.5 } } })).resolves.toEqual({ rotaris: { reportedCost: '0.5' } });
  });
});
