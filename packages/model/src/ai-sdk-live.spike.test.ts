import { describe, expect, it } from 'vitest';
import { AiSdkModelClient } from './ai-sdk-client.js';
import type { ModelRequest, StreamPart } from './ports.js';

/**
 * Spike 6 — the Responses dialect against a real, non-vendor base URL with
 * custom headers (ADR-0027 consequence 2). Runs ONLY when the owner supplies
 * an endpoint; otherwise it is skipped and the spike stays owed.
 *
 *   ROTARIS_SPIKE6_BASE_URL=https://host/v1 ROTARIS_SPIKE6_MODEL=<id> \
 *   ROTARIS_SPIKE6_API_KEY_ENV=<name of the variable holding the key> \
 *   pnpm vitest run packages/model/src/ai-sdk-live.spike.test.ts
 *
 * Measures, for `responses` and then `chat` against the same base URL: the
 * streamed deltas, the provider's usage figures, the error on a bad key
 * (status and body preserved), and an abort mid-stream. Report the figures
 * into docs/architecture/spikes/responses-dialect.md.
 */
const baseUrl = process.env['ROTARIS_SPIKE6_BASE_URL'];
const modelId = process.env['ROTARIS_SPIKE6_MODEL'];
const keyEnv = process.env['ROTARIS_SPIKE6_API_KEY_ENV'];
const live = Boolean(baseUrl && modelId);

function req(dialect: 'chat' | 'responses', over: Partial<ModelRequest> = {}): ModelRequest {
  return {
    model: { providerId: 'spike6', modelId: modelId ?? '', dialect }, messages: [{ role: 'user', content: [{ kind: 'text', text: 'Reply with the single word: pong' }] }],
    thinking: 'unset', signal: new AbortController().signal, timeoutMs: 60_000, retries: 0, resolveCredential: async () => (keyEnv ? process.env[keyEnv] ?? '' : ''), ...over,
  };
}

describe.skipIf(!live)('spike 6 — the Responses dialect against a real endpoint (ADR-0027 consequence 2)', () => {
  for (const dialect of ['responses', 'chat'] as const) {
    it(`${dialect}: streams deltas and reports the provider's usage`, async () => {
      const client = new AiSdkModelClient({ baseUrl: baseUrl!, headers: { 'x-rotaris-spike': '6' }, onRequest: (i) => console.log(`[spike6] ${dialect} → ${i.url}`) });
      const parts: StreamPart[] = [];
      let error: unknown = null;
      const t0 = performance.now();
      let firstDelta: number | null = null;
      for await (const r of client.stream(req(dialect))) {
        if (!r.ok) { error = r.error; break; }
        if (r.value.kind === 'text' && firstDelta === null) firstDelta = performance.now() - t0;
        parts.push(r.value);
      }
      console.log(`[spike6] ${dialect}: ${parts.filter((p) => p.kind === 'text').length} deltas, first at ${firstDelta?.toFixed(0)} ms, total ${(performance.now() - t0).toFixed(0)} ms, usage ${JSON.stringify(parts.find((p) => p.kind === 'usage'))}, error ${JSON.stringify(error)}`);
      expect(error).toBeNull();
      expect(parts.some((p) => p.kind === 'text')).toBe(true);
      const usage = parts.find((p) => p.kind === 'usage') as { usage: { input: number } } | undefined;
      expect(usage?.usage.input ?? 0).toBeGreaterThan(0);
    });
  }
  it('responses: a bad key keeps the status and the provider body', async () => {
    const client = new AiSdkModelClient({ baseUrl: baseUrl! });
    let error: { status?: number; providerMessage?: string } | null = null;
    for await (const r of client.stream(req('responses', { resolveCredential: async () => 'not-a-key' }))) { if (!r.ok) { error = r.error; break; } }
    console.log(`[spike6] bad key → ${JSON.stringify(error)}`);
    expect(error?.status).toBeGreaterThanOrEqual(400);
  });
  it('responses: an abort mid-stream ends as aborted', async () => {
    const ac = new AbortController();
    const client = new AiSdkModelClient({ baseUrl: baseUrl! });
    let code: string | null = null;
    let n = 0;
    for await (const r of client.stream(req('responses', { signal: ac.signal, messages: [{ role: 'user', content: [{ kind: 'text', text: 'Count slowly from 1 to 200, one number per line.' }] }] }))) {
      if (!r.ok) { code = r.error.code; break; }
      if (r.value.kind === 'text' && ++n === 3) ac.abort();
    }
    console.log(`[spike6] abort after ${n} deltas → ${code}`);
    expect(code).toBe('aborted');
  });
});
