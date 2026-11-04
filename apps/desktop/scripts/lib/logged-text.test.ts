/**
 * Reading a capture step's answer by the echo the application log writes of it (REQ-TOOLS-171, REQ-TOOLS-172): the log
 * masks the value after a secret-looking name, so rows-proof's `[data-call-key="call-ok"]` probes are logged as
 * `[data-call-key="***"]` and the proof read none of REQ-CHAT-060's outcomes
 * (docs/archive/defects/rows-and-git-proofs-read-probe-and-eval-text-the-application-logs-redaction-pass-masks.md). Every log
 * here is written through the product's own pass, not a copy of it, so a change to the pass reaches these cases.
 */
import { describe, expect, it } from 'vitest';
import { redact } from '@rotaris/kernel';
import { answerAfter, loggedAs, readEndProbes, readTimedStep } from './logged-text.mjs';

const W = '[data-testid="proof-workspace"]';
const probe = (selector: string, answer: unknown) => redact(`[main 2026-11-04T17:57:22.795Z] info    capture: probe ${selector} → ${JSON.stringify(answer)}`);
const timed = (kind: string, at: number, selector: string, answer: unknown) => redact(`[main 2026-11-04T17:57:18.885Z] info    capture: ${kind} ${at} ${selector} → ${JSON.stringify(answer)}`);

describe('the echo, as the application log writes it', () => {
  it('the product masks the call key in its echo, so the cases below are not vacuous', () => {
    expect(probe(`${W} [data-call-key="call-ok"]`, [])).toContain('[data-call-key="***"]');
  });

  it('a masked echo is the echo of the text it masked, and of no text the mark could not stand for', () => {
    expect(loggedAs(redact(`${W} [data-call-key="call-ok"]`), `${W} [data-call-key="call-ok"]`)).toBe(true);
    expect(loggedAs(redact(`${W} [data-call-key="call-ok"]`), `${W} [data-call-key="call-ok"] .tool__outcome`)).toBe(false);
    expect(loggedAs(redact('({ key: a.b })'), '({ key: a.b, more: 1 })')).toBe(false);
    expect(loggedAs(redact("x = { key: 'a b' }"), "x = { key: 'a b' }")).toBe(true);
    expect(loggedAs('.row', '.row')).toBe(true);
    expect(loggedAs('.row', '.rows')).toBe(false);
  });

  it('the answer starts after the echo, and an arrow inside the answer does not cut it', () => {
    const rest = `${redact('({ key: a.b })')} → {"message":"a → b"}`;
    expect(answerAfter(rest, '({ key: a.b })')).toBe('{"message":"a → b"}');
    expect(answerAfter(rest, '({ other: a.b })')).toBeNull();
  });
});

describe('rows-proof\'s end probes, keyed by the selector given (REQ-CHAT-060)', () => {
  const selectors = [
    `${W} .row`,
    `${W} [data-call-key="call-ok"]`,
    `${W} [data-call-key="call-failed"] .tool__outcome`,
    `${W} [data-call-key="call-blocked"] .tool__outcome`,
    `${W} [data-call-key="call-running"] .tool__outcome`,
  ];
  const log = [
    'unrelated line',
    probe(selectors[0]!, [{ text: 'a row' }]),
    timed('probe-at', 2100, '[data-testid="acknowledgement-title"]', [{ text: 'not an end probe' }]),
    probe(selectors[1]!, [{ text: 'Reads README.mdok · 3.2s' }]),
    probe(selectors[2]!, [{ text: 'failed' }]),
    probe(selectors[3]!, [{ text: 'blocked · 0.0s' }]),
    `${probe(selectors[4]!, [{ text: '◉ running…' }])}\r`,
  ].join('\n');

  it('each probe reads its own answer, the three outcomes that echo alike told apart by the order the seam logs them', () => {
    const probes = readEndProbes(log, selectors);
    expect(probes[selectors[0]!]).toEqual([{ text: 'a row' }]);
    expect(probes[selectors[1]!]).toEqual([{ text: 'Reads README.mdok · 3.2s' }]);
    expect(probes[selectors[2]!]).toEqual([{ text: 'failed' }]);
    expect(probes[selectors[3]!]).toEqual([{ text: 'blocked · 0.0s' }]);
    expect(probes[selectors[4]!]).toEqual([{ text: '◉ running…' }]);
  });

  it('a probe the log does not carry is absent, and an answer that is not JSON reads as none', () => {
    const probes = readEndProbes(`${probe(selectors[0]!, [])}\n${redact(`capture: probe ${selectors[1]} → not json`)}`, selectors);
    expect(probes[selectors[0]!]).toEqual([]);
    expect(probes[selectors[1]!]).toEqual([]);
    expect(probes[selectors[2]!]).toBeUndefined();
  });
});

describe('rows-proof\'s timed readings, by offset and echo', () => {
  const blocked = `${W} [data-call-key="call-blocked"] [data-testid="tool-header"]`;
  const ok = `${W} [data-call-key="call-ok"]`;
  const log = [
    timed('inspect-at', 5000, `${W} .row`, { matches: [] }),
    timed('inspect-at', 5000, blocked, { matches: [{ attrs: { 'aria-description': 'Blocked: a recursive delete' } }] }),
    timed('inspect-at', 7600, ok, { matches: [{ attrs: { 'aria-expanded': 'false' } }] }),
    timed('probe-at', 2100, '[data-testid="acknowledgement-title"]', [{ text: 'Opened in your browser' }]),
  ].join('\n');

  it('the blocked header and the collapsed card are read from their masked echoes', () => {
    expect(readTimedStep(log, 'inspect-at', 5000, blocked)).toEqual({ matches: [{ attrs: { 'aria-description': 'Blocked: a recursive delete' } }] });
    expect(readTimedStep(log, 'inspect-at', 7600, ok)).toEqual({ matches: [{ attrs: { 'aria-expanded': 'false' } }] });
    expect(readTimedStep(log, 'probe-at', 2100, '[data-testid="acknowledgement-title"]')).toEqual([{ text: 'Opened in your browser' }]);
  });

  it('a reading at another offset, of another kind, or never logged is null', () => {
    expect(readTimedStep(log, 'inspect-at', 5000, ok)).toBeNull();
    expect(readTimedStep(log, 'probe-at', 5000, blocked)).toBeNull();
    expect(readTimedStep(log, 'inspect-at', 9999, `${W} .row`)).toBeNull();
  });

  it('two steps that echo alike at one offset are ambiguous and throw rather than choose', () => {
    const twice = [timed('inspect-at', 5000, `${W} [data-call-key="a"]`, {}), timed('inspect-at', 5000, `${W} [data-call-key="b"]`, {})].join('\n');
    expect(() => readTimedStep(twice, 'inspect-at', 5000, `${W} [data-call-key="a"]`)).toThrow(/2 inspect-at lines at 5000 ms echo one selector/);
  });
});
