import { describe, expect, it } from 'vitest';
import type { CommandOutcome } from '@rotaris/contracts';
import type { AppLogLevel } from './app-log.js';
import { COMMAND_FAILED_DETAIL_MAX, commandFailed, dispatchCommand, type CommandDispatch } from './command-dispatch.js';
import type { CommandHandlers, MainWindowState } from './commands/context.js';

const WINDOW = { wcId: 7, workspace: 'C:/ws', workspaceId: 'ws-1' } as unknown as MainWindowState;

/** A handler table holding the kinds a case names; a dispatch never reaches a kind the case did not file. */
function deps(handlers: Partial<Record<string, (req: unknown, at: unknown) => CommandOutcome | Promise<CommandOutcome>>>, window: MainWindowState | null = WINDOW) {
  const lines: { message: string; level: AppLogLevel }[] = [];
  const d: CommandDispatch<MainWindowState> = {
    handlers: handlers as unknown as CommandHandlers,
    forCommand: () => window ?? undefined,
    awaitWorkspace: () => Promise.resolve(),
    settle: (outcome) => outcome,
    log: (message, level) => { lines.push({ message, level }); },
  };
  return { d, lines };
}

describe('the dispatcher catches what a handler throws (ADR-0019, .claude/rules/contracts-and-ipc.md)', () => {
  it('answers a handler that throws with command.failed and one error line naming the kind and the stack, never the payload', async () => {
    const { d, lines } = deps({ 'theme.set': () => { throw new Error('the theme file is gone'); } });
    const outcome = await dispatchCommand({ kind: 'theme.set', name: 'payload-marker' }, 7, d);
    expect(outcome).toEqual({ ok: false, code: 'command.failed', headline: 'The command failed', detail: 'the theme file is gone' });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.level).toBe('error');
    expect(lines[0]!.message).toContain('command theme.set failed');
    expect(lines[0]!.message).toContain('at '); // the stack's frames
    expect(lines[0]!.message).not.toContain('payload-marker');
  });
  it('answers a handler whose promise rejects the same way, a non-Error reason included', async () => {
    const { d } = deps({ 'theme.get': () => Promise.reject('plain reason') });
    await expect(dispatchCommand({ kind: 'theme.get' }, 7, d)).resolves.toEqual({ ok: false, code: 'command.failed', headline: 'The command failed', detail: 'plain reason' });
  });
  it('passes the detail through the redaction pass and cuts it to its bound', async () => {
    expect(commandFailed(new Error('request failed: api_key=sk-live-0123456789abcdef'))).toMatchObject({ detail: 'request failed: api_key=***' });
    const long = commandFailed(new Error('x'.repeat(5_000)));
    expect(long.ok === false && long.detail?.length).toBe(COMMAND_FAILED_DETAIL_MAX);
    const { d, lines } = deps({ 'theme.get': () => { throw new Error('the provider answered 401 for sk-live-abcdef123456'); } });
    await dispatchCommand({ kind: 'theme.get' }, 7, d);
    expect(lines[0]!.message).not.toContain('sk-live-abcdef123456');
  });
  it('still answers what a handler returns, settled for its window', async () => {
    const { d, lines } = deps({ 'theme.get': (_req, at) => ({ ok: true, value: (at as { w: MainWindowState }).w.wcId }) });
    const settled = await dispatchCommand({ kind: 'theme.get' }, 7, { ...d, settle: (o) => (o.ok ? { ok: true, value: `settled ${String(o.value)}` } : o) });
    expect(settled).toEqual({ ok: true, value: 'settled 7' });
    expect(lines).toEqual([]);
  });
  it('refuses a request that does not parse, and a sender with no main window, before any handler', async () => {
    const { d } = deps({});
    await expect(dispatchCommand({ kind: 'no.such.kind' }, 7, d)).resolves.toMatchObject({ ok: false, code: 'command.malformed' });
    const none = deps({}, null);
    await expect(dispatchCommand({ kind: 'theme.get' }, 7, none.d)).resolves.toMatchObject({ ok: false, code: 'window.notMain' });
  });
});
