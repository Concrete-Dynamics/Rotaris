import { describe, expect, it } from 'vitest';
import { isDefiniteStartRefusal } from './start-refusal.js';

/**
 * REQ-MCP-124/126 (MAJOR 2, REWORK 8): the ONE rule that decides whether a start refusal proves no run exists, walked
 * code by code against the run host's own `refused` set. The classification asks ONE question — was the refusal raised
 * BEFORE the session record is created, or can it come back AFTER it? — and every code is placed accordingly:
 *
 *  - `request.malformed` is raised in `run-host/index.ts` BEFORE `dispatch`, so it proves no run was started for this
 *    request id — it must be DEFINITE (the slot is free, the tree may go);
 *  - `session.history-failed` is raised only AFTER the session record is opened, so a session (and the worktree it
 *    names) may already exist — it must be NOT definite;
 *  - `session.attachment-invalid` can be raised from the attachment gate that persists the attachments AFTER
 *    `SessionWriter.create` (`sessions.ts`), so the session may already exist — NOT definite;
 *  - `session.lock-held` can come back after the session row was upserted in the same transaction (`session-writer.ts`)
 *    — NOT definite;
 *  - `runHost.gone` replaces an outstanding `session.start` answer when the host exits (`process-link.ts`), so the run
 *    may have been born — NOT definite.
 */

describe('REQ-MCP-124/126 (MAJOR 2, REWORK 8): every start-refusal code is classified by "before or after the session record"', () => {
  it('`request.malformed` is DEFINITE — it is raised before dispatch, so it proves no run for this request id', () => {
    expect(isDefiniteStartRefusal('request.malformed')).toBe(true);
  });

  it('`session.history-failed` is NOT definite — the session record exists before its first row is written', () => {
    expect(isDefiniteStartRefusal('session.history-failed')).toBe(false);
  });

  it('`session.attachment-invalid` is NOT definite — the attachment gate can fail AFTER the session record is created', () => {
    expect(isDefiniteStartRefusal('session.attachment-invalid')).toBe(false);
  });

  it('`session.lock-held` is NOT definite — it can come back after the session row was already upserted', () => {
    expect(isDefiniteStartRefusal('session.lock-held')).toBe(false);
  });

  it('`runHost.gone` is NOT definite — it can replace an outstanding start answer after the run was created', () => {
    expect(isDefiniteStartRefusal('runHost.gone')).toBe(false);
  });

  it('`runHost.notStarted` is DEFINITE — a request before the hello is HELD, never delivered, so no run could exist', () => {
    expect(isDefiniteStartRefusal('runHost.notStarted')).toBe(true);
  });

  it('the "proves nothing" codes stay not definite', () => {
    for (const code of [
      'run-host.unreachable', 'reply.unexpected', 'request.failed',
      'runHost.gone', 'session.history-failed', 'session.lock-held', 'session.attachment-invalid',
    ]) {
      expect(isDefiniteStartRefusal(code), code).toBe(false);
    }
  });

  it('validation and fence refusals raised before anything is created are DEFINITE', () => {
    for (const code of [
      'session.no-model', 'session.confinement', 'session.configuration', 'session.provider-auth',
      'session.workspace-none', 'session.empty', 'session.sandbox-mode', 'session.workspace-changed',
      'session.worktree', 'session.worktree-options', 'session.store-failed', 'session.image-input-unsupported',
      'request.malformed', 'workspace.refusing', 'workspace.not-open',
    ]) {
      expect(isDefiniteStartRefusal(code), code).toBe(true);
    }
  });
});
