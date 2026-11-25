import { describe, expect, it } from 'vitest';
import { isDefiniteStartRefusal } from './start-refusal.js';

/**
 * REQ-MCP-124/126 (MAJOR, REWORK 7): the ONE rule that decides whether a start refusal proves no run exists, walked code
 * by code against the run host's own `refused` set. Two codes were classified wrongly before:
 *
 *  - `request.malformed` is raised in `run-host/index.ts` BEFORE `dispatch`, so it proves no run was started for this
 *    request id — it must be DEFINITE (the slot is free, the tree may go);
 *  - `session.history-failed` is raised only AFTER the session record is opened, so a session (and the worktree it
 *    names) may already exist — it must be NOT definite.
 */

describe('REQ-MCP-124/126 (MAJOR, REWORK 7): every start-refusal code is classified by "before or after dispatch"', () => {
  it('`request.malformed` is DEFINITE — it is raised before dispatch, so it proves no run for this request id', () => {
    expect(isDefiniteStartRefusal('request.malformed')).toBe(true);
  });

  it('`session.history-failed` is NOT definite — the session record exists before its first row is written', () => {
    expect(isDefiniteStartRefusal('session.history-failed')).toBe(false);
  });

  it('the four "proves nothing" codes stay not definite', () => {
    for (const code of ['run-host.unreachable', 'reply.unexpected', 'request.failed', 'session.history-failed']) {
      expect(isDefiniteStartRefusal(code), code).toBe(false);
    }
  });

  it('validation and fence refusals raised before anything is created are DEFINITE', () => {
    for (const code of [
      'session.no-model', 'session.confinement', 'session.configuration', 'session.provider-auth',
      'session.workspace-none', 'session.empty', 'session.sandbox-mode', 'session.workspace-changed',
      'session.worktree', 'session.worktree-options', 'session.store-failed', 'session.image-input-unsupported',
      'session.attachment-invalid', 'workspace.refusing', 'workspace.not-open',
    ]) {
      expect(isDefiniteStartRefusal(code), code).toBe(true);
    }
  });
});
