import { describe, expect, it } from 'vitest';
import { AUTHENTICATION_MARKERS, classifyRunFailure, isAuthenticationFailure, isQuotaFailure } from './failure-class.js';

describe('main/failure-class — REQ-NOTIFY-060\'s order over REQ-NOTIFY-067\'s markers', () => {
  it.each([
    ['scripted authentication failure (HTTP 401) — HTTP 401 — Incorrect API key provided', true],
    ['HTTP 401', true],
    ['401', true],
    ['status=401;', true],
    ['(401)', true],
    ['HTTP 4010', false],
    ['error 4010 from the gateway', false],
    ['code 14012', false],
    ['code 1401', false],
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
    ['The model timed out', false],
    ['The provider rejected the request parameter temperature.', false],
  ])('%s → authentication: %s', (text, expected) => {
    expect(isAuthenticationFailure(text)).toBe(expected);
  });

  it('every marker matches in any case', () => {
    for (const marker of AUTHENTICATION_MARKERS) {
      expect(isAuthenticationFailure(`provider said: ${marker}`)).toBe(true);
      expect(isAuthenticationFailure(`PROVIDER SAID: ${marker.toUpperCase()}`)).toBe(true);
    }
  });

  it('the first class that matches handles the failure: authentication, then sandbox, then quota, then generic', () => {
    expect(classifyRunFailure('HTTP 401 Unauthorized: rate limit')).toBe('authentication');
    expect(classifyRunFailure('HTTP 401 — quota exceeded', { sandboxRefused: true })).toBe('authentication');
    expect(classifyRunFailure('invalid api key', { sandboxRefused: true })).toBe('authentication');
    expect(classifyRunFailure('quota exceeded', { sandboxRefused: true })).toBe('sandbox');
    expect(classifyRunFailure('rate limit', { sandboxRefused: true })).toBe('sandbox');
    expect(classifyRunFailure('HTTP 429 Too Many Requests')).toBe('quota');
    expect(classifyRunFailure('You exceeded your current quota')).toBe('quota');
    expect(classifyRunFailure('scripted failure (HTTP 400)')).toBe('generic');
    expect(classifyRunFailure('The run failed: 1 task abandoned.')).toBe('generic');
    expect(classifyRunFailure(null)).toBe('generic');
  });

  it('REQ-NOTIFY-062/063/093: the quota marker reads whatever the run\'s class', () => {
    expect(isQuotaFailure('HTTP 429 — Too Many Requests')).toBe(true);
    expect(isQuotaFailure('rate-limit reached')).toBe(true);
    expect(isQuotaFailure('scripted failure (HTTP 400)')).toBe(false);
  });
});
