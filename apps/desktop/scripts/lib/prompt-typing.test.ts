/**
 * The live run's kill limit for a launch leaves room for typing its prompt, because the capture's own bound counts from the
 * prompt's submission (live-run finding P6 at a68f121; `docs/defects/fixed/a-captures-wait-starts-before-its-prompt-is-typed.md`).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the helper is plain ESM beside the live run that uses it.
import { TYPING_MS_PER_CHAR, typingAllowanceMs } from './prompt-typing.mjs';

describe("the live run's kill limit leaves room for typing the prompt (finding P6)", () => {
  it("a launch that types a prompt under a capture bound gets the prompt's length times the per-character allowance", () => {
    const prompt = 'x'.repeat(5_755);
    const allowance = typingAllowanceMs({ ROTARIS_CAPTURE_PROMPT: prompt, ROTARIS_CAPTURE_WAIT_MS: '420000' }) as number;
    expect(allowance).toBe(5_755 * (TYPING_MS_PER_CHAR as number));
    // More than the 27.4 s the terminal scenario's prompt took to type at a68f121, so that time no longer eats the margin.
    expect(allowance).toBeGreaterThan(27_400);
  });

  it('a launch with no prompt, or no capture bound, gets none', () => {
    expect(typingAllowanceMs({ ROTARIS_CAPTURE_WAIT_MS: '420000' })).toBe(0);
    expect(typingAllowanceMs({ ROTARIS_CAPTURE_PROMPT: 'hello' })).toBe(0);
    expect(typingAllowanceMs({ ROTARIS_CAPTURE_PROMPT: 'hello', ROTARIS_CAPTURE_WAIT_MS: '0' })).toBe(0);
  });
});
