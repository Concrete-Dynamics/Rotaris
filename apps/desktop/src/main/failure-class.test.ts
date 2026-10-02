import { describe, expect, it } from 'vitest';
import { AUTHENTICATION_MARKERS, classifyRunFailure, isAuthenticationFailure } from './failure-class.js';

describe('main/failure-class — REQ-NOTIFY-060\'s order over REQ-NOTIFY-067\'s markers', () => {
  it('counts every marker, ignoring case, and `401` only standing alone', () => {
    for (const marker of AUTHENTICATION_MARKERS) {
      expect(isAuthenticationFailure(`provider said: ${marker}`)).toBe(true);
      expect(isAuthenticationFailure(`PROVIDER SAID: ${marker.toUpperCase()}`)).toBe(true);
    }
    expect(isAuthenticationFailure('scripted authentication failure (HTTP 401) — HTTP 401 — Incorrect API key provided')).toBe(true);
    expect(isAuthenticationFailure('HTTP 401')).toBe(true);
    expect(isAuthenticationFailure('status=401;')).toBe(true);
    expect(isAuthenticationFailure('error 4010 from the gateway')).toBe(false);
    expect(isAuthenticationFailure('E401x')).toBe(false);
    expect(isAuthenticationFailure('code 1401')).toBe(false);
    expect(isAuthenticationFailure('The model timed out')).toBe(false);
  });

  it('matches authentication first, then sandbox, then quota, then generic', () => {
    expect(classifyRunFailure('HTTP 401 Unauthorized: rate limit')).toBe('authentication');
    expect(classifyRunFailure('invalid api key', { sandboxRefused: true })).toBe('authentication');
    expect(classifyRunFailure('quota exceeded', { sandboxRefused: true })).toBe('sandbox');
    expect(classifyRunFailure('HTTP 429 Too Many Requests')).toBe('quota');
    expect(classifyRunFailure('You exceeded your current quota')).toBe('quota');
    expect(classifyRunFailure('scripted failure (HTTP 400)')).toBe('generic');
    expect(classifyRunFailure(null)).toBe('generic');
  });
});
