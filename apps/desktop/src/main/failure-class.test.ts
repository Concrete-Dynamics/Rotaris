import { describe, expect, it } from 'vitest';
import { AUTHENTICATION_MARKERS, classifyFailure, isAuthenticationFailure } from './failure-class.js';

describe('main/failure-class — REQ-NOTIFY-060\'s order over REQ-NOTIFY-067\'s markers', () => {
  it.each([
    ['scripted authentication failure (HTTP 401) — HTTP 401 — Incorrect API key provided', true],
    ['HTTP 401', true],
    ['401', true],
    ['status=401;', true],
    ['(401)', true],
    ['HTTP 4010', false],
    ['code 14012', false],
    ['E401x', false],
    ['401_error', false],
    ['API key not valid. Please pass a valid API key.', true],
    ['Authentication Error', true],
    ['authentication failed for the request', true],
    ['AuthenticationError: bad key', true],
    ['Incorrect API key provided: sk-…', true],
    ['Invalid API Key', true],
    ['{"error":{"code":"invalid_api_key"}}', true],
    ['Unauthorized', true],
    ['HTTP 403 — Forbidden', false],
    ['The provider rejected the request parameter temperature.', false],
  ])('%s → authentication: %s', (text, expected) => {
    expect(isAuthenticationFailure(text)).toBe(expected);
  });

  it('every marker matches in any case', () => {
    for (const m of AUTHENTICATION_MARKERS) {
      expect(isAuthenticationFailure(`x ${m.toUpperCase()} y`)).toBe(true);
    }
  });

  it('the first class that matches handles the failure: authentication ahead of the sandbox and of a quota marker', () => {
    expect(classifyFailure('HTTP 401 — quota exceeded', { sandboxRefused: true })).toBe('authentication');
    expect(classifyFailure('rate limit', { sandboxRefused: true })).toBe('sandbox');
    expect(classifyFailure('HTTP 429 — Too Many Requests')).toBe('quota');
    expect(classifyFailure('You exceeded your current quota')).toBe('quota');
    expect(classifyFailure('The run failed: 1 task abandoned.')).toBe('generic');
    expect(classifyFailure(null)).toBe('generic');
  });
});
