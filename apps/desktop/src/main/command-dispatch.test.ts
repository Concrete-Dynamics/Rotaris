import { describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import { FREE_TEXT_MAX, NAME_MAX, type CommandOutcome } from '@rotaris/contracts';
import type { AppLogLevel } from './app-log.js';
import { COMMAND_FAILED_DETAIL_MAX, commandFailed, commandRefusals, dispatchCommand, type CommandDispatch } from './command-dispatch.js';
import type { CommandHandlers, MainWindowState } from './commands/context.js';

const WINDOW = { wcId: 7, workspace: 'C:/ws', workspaceId: 'ws-1' } as unknown as MainWindowState;

/** A handler table holding the kinds a case names; a dispatch never reaches a kind the case did not file. */
function deps(handlers: Partial<Record<string, (req: unknown, at: unknown) => CommandOutcome | Promise<CommandOutcome>>>, window: MainWindowState | null = WINDOW) {
  const lines: { message: string; level: AppLogLevel }[] = [];
  const clock = new FakeClock();
  const log = (message: string, level: AppLogLevel): void => { lines.push({ message, level }); };
  const d: CommandDispatch<MainWindowState> = {
    handlers: handlers as unknown as CommandHandlers,
    forCommand: () => window ?? undefined,
    awaitWorkspace: () => Promise.resolve(),
    settle: (outcome) => outcome,
    log,
    refusals: commandRefusals(clock, log),
  };
  return { d, lines, clock };
}

/** Put in every value a malformed request carries: a line that holds it has carried a value. */
const MARKER = 'PAYLOAD-MARKER-485';

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
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case is a reason that is not an Error, on purpose.
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
  it('OQ-467: answers a request past a bound with command.malformed naming the field and the bound, never the value, before any handler', async () => {
    const { d } = deps({ 'session.prompt': () => { throw new Error('reached the handler'); } });
    const prompt = `secret-marker${'x'.repeat(FREE_TEXT_MAX)}`;
    const outcome = await dispatchCommand({ kind: 'session.prompt', sessionId: 's-1', prompt }, 7, d);
    expect(outcome).toEqual({ ok: false, code: 'command.malformed', headline: 'The prompt is longer than 1,048,576 characters' });
    expect(JSON.stringify(outcome)).not.toContain('secret-marker');
  });
});

describe('OQ-485: a malformed request leaves one warning line, never a value, bursts folded (PD-MONITOR-002)', () => {
  it('an unknown kind: one warning line naming the window, the class and the headline, the kind\'s text never echoed', async () => {
    const { d, lines } = deps({});
    await expect(dispatchCommand({ kind: `${MARKER}.kind`, prompt: MARKER }, 7, d)).resolves.toEqual({ ok: false, code: 'command.malformed', headline: 'The request could not be read: the kind is not valid' });
    expect(lines).toEqual([{ level: 'warn', message: 'refused a command from window 7 (unknown kind): The request could not be read: the kind is not valid; answered command.malformed (OQ-485)' }]);
  });

  it('a request past a bound: one warning line naming the kind of the union and the field and the bound, the value never echoed', async () => {
    const { d, lines } = deps({ 'session.prompt': () => { throw new Error('reached the handler'); } });
    await dispatchCommand({ kind: 'session.prompt', sessionId: 's-1', prompt: `${MARKER}${'x'.repeat(FREE_TEXT_MAX)}` }, 7, d);
    expect(lines).toEqual([{ level: 'warn', message: 'refused a command from window 7 (past a bound, kind session.prompt): The prompt is longer than 1,048,576 characters; answered command.malformed (OQ-485)' }]);
    expect(JSON.stringify(lines)).not.toContain(MARKER);
  });

  it('a shape it cannot read: one warning line naming the field; a sender other than the window is named with it', async () => {
    const { d, lines } = deps({});
    await dispatchCommand({ kind: 'session.resume', sessionId: 42 }, 12, d);
    await dispatchCommand(MARKER, 13, d);
    expect(lines).toEqual([
      { level: 'warn', message: 'refused a command from window 12 for window 7 (unreadable, kind session.resume): The request could not be read: the sessionId is not valid; answered command.malformed (OQ-485)' },
      { level: 'warn', message: 'refused a command from window 13 for window 7 (unreadable): The request could not be read; answered command.malformed (OQ-485)' },
    ]);
  });

  it('a burst is folded per sender and per class into one count line when the 60 s window closes, and a new window opens after it', async () => {
    const { d, lines, clock } = deps({});
    const longId = { kind: 'session.resume', sessionId: `${MARKER}${'i'.repeat(NAME_MAX)}` };
    for (let i = 0; i < 500; i += 1) await dispatchCommand(longId, 7, d);
    await dispatchCommand({ kind: 'no.such.kind' }, 7, d); // another class: a line of its own
    await dispatchCommand(longId, 8, d); // another sender: a window of its own
    expect(lines.map((l) => l.message)).toEqual([
      'refused a command from window 7 (past a bound, kind session.resume): The sessionId is longer than 1,024 characters; answered command.malformed (OQ-485)',
      'refused a command from window 7 (unknown kind): The request could not be read: the kind is not valid; answered command.malformed (OQ-485)',
      'refused a command from window 8 for window 7 (past a bound, kind session.resume): The sessionId is longer than 1,024 characters; answered command.malformed (OQ-485)',
    ]);
    clock.advance(59_999);
    expect(lines).toHaveLength(3);
    clock.advance(1);
    expect(lines.slice(3)).toEqual([{ level: 'warn', message: 'refused 499 more commands from window 7 (past a bound) within 60 s of the first; answered command.malformed (OQ-485)' }]);
    await dispatchCommand(longId, 7, d);
    expect(lines).toHaveLength(5);
    expect(JSON.stringify(lines)).not.toContain(MARKER);
  });

  it('a request that parses leaves no line, and a sender with no main window is refused before the request is read', async () => {
    const { d, lines } = deps({ 'theme.get': () => ({ ok: true, value: 'light' }) });
    await dispatchCommand({ kind: 'theme.get' }, 7, d);
    const none = deps({}, null);
    await dispatchCommand({ kind: MARKER }, 7, none.d);
    expect(lines).toEqual([]);
    expect(none.lines).toEqual([]);
  });
});

/**
 * OQ-475 (ruled 2026-11-04; PD-MONITOR-002): `window.recovered` reaches its handler by the one channel every kind shares, and
 * the dispatcher adds nothing to the one `warning` line it writes. A severity the renderer adds is stripped by the schema,
 * never obeyed — the level is the ruling's — and a detail past its bound is refused before the handler.
 */
describe('window.recovered through the dispatcher (OQ-475)', () => {
  it('a recovered error is one warning line and an ok answer; a severity sent with it changes nothing', async () => {
    const { windowCommands } = await import('./commands/windows.js');
    const lines: { message: string; level: AppLogLevel }[] = [];
    const handlers = windowCommands({ log: (message, level = 'info') => { lines.push({ message, level }); }, windowFor: () => undefined, reloadWindow: () => true });
    const { d } = deps({ 'window.recovered': handlers['window.recovered'] as never });
    await expect(dispatchCommand({ kind: 'window.recovered', error: 'TypeError: drawn again', detail: 'Window: main', severity: 'error' }, 7, d)).resolves.toEqual({ ok: true });
    expect(lines).toEqual([{ level: 'warn', message: 'window 7 recovered from a drawing error; React drew it again and nothing is shown (OQ-475): TypeError: drawn again\nWindow: main' }]);
  });

  it('a detail past FREE_TEXT_MAX, or no error at all, is command.malformed before the handler', async () => {
    const { d } = deps({ 'window.recovered': () => { throw new Error('reached the handler'); } });
    await expect(dispatchCommand({ kind: 'window.recovered', error: 'x', detail: 'y'.repeat(FREE_TEXT_MAX + 1) }, 7, d)).resolves.toMatchObject({ ok: false, code: 'command.malformed' });
    await expect(dispatchCommand({ kind: 'window.recovered', error: '', detail: '' }, 7, d)).resolves.toMatchObject({ ok: false, code: 'command.malformed' });
  });
});
