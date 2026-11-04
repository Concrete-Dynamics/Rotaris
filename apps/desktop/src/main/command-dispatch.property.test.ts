/**
 * OQ-485 (ruled 2026-11-04; PD-MONITOR-002, OQ-467) as a property: whatever a renderer sends that the command union refuses,
 * the one `warning` line the dispatcher writes for it carries no substring of the request's values. `command-dispatch.test.ts`
 * holds the worked examples; this file holds what must be true of every malformed input.
 *
 * Every string of a generated request — every value, and every key but the request's own `kind` and the contract's field
 * names — begins with `MARKER`, which holds characters no identifier has, so a key echoed by a path would be written `[key]`
 * and a value echoed anywhere would carry the marker. The request is a kind of the union with fields of any shape (some past
 * their bound), a kind the union does not have, or no object at all. Each case runs over a fresh fold, so its refusal is
 * written in full and never folded away.
 *
 * Seeded: `numRuns: 300` from `SEED`, the same cases every run; a failure prints its seed and path to replay it alone.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import { CommandRequestSchema, NAME_MAX, type CommandOutcome } from '@rotaris/contracts';
import type { AppLogLevel } from './app-log.js';
import { commandRefusals, dispatchCommand, type CommandDispatch } from './command-dispatch.js';
import type { CommandHandlers, MainWindowState } from './commands/context.js';

const SEED = 20261104;
const RUNS = { seed: SEED, numRuns: 300 } as const;
const MARKER = 'Ω-payload-485§';
const KINDS = CommandRequestSchema.options.map((option) => option.shape.kind.value);
const FIELDS = ['prompt', 'sessionId', 'name', 'path', 'workspace', 'text', 'value', 'key', 'patch', 'ids', 'request', 'command', 'attachments', 'apiKey', 'url'];

const marked = fc.string({ maxLength: 16 }).map((s) => `${MARKER}${s}`);
/** Sometimes past `NAME_MAX`, the bound of every id and name, so the bound's class is met too. */
const markedLong = fc.integer({ min: NAME_MAX - 16, max: NAME_MAX + 64 }).map((n) => `${MARKER}${'v'.repeat(n)}`);
const value: fc.Arbitrary<unknown> = fc.letrec<{ v: unknown }>((tie) => ({
  v: fc.oneof(
    { depthSize: 'small' },
    marked,
    markedLong,
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.array(tie('v'), { maxLength: 3 }),
    fc.dictionary(marked, tie('v'), { maxKeys: 3 }),
  ),
})).v;
const fields = fc.dictionary(fc.oneof(fc.constantFrom(...FIELDS), marked), value, { maxKeys: 4 });
const malformed: fc.Arbitrary<unknown> = fc
  .oneof(
    fc.tuple(fc.constantFrom(...KINDS), fields).map(([kind, rest]) => ({ ...rest, kind })),
    fc.tuple(marked, fields).map(([kind, rest]) => ({ ...rest, kind })),
    fields,
    marked,
    fc.array(value, { maxLength: 3 }),
  )
  .filter((input) => !CommandRequestSchema.safeParse(input).success);

const WINDOW = { wcId: 7, workspace: 'C:/ws', workspaceId: 'ws-1' } as unknown as MainWindowState;

describe('OQ-485: no value of a malformed request reaches the log (property)', () => {
  it('every refusal leaves exactly one warning line, and no line holds the marker every value carries', async () => {
    await fc.assert(
      fc.asyncProperty(malformed, async (input) => {
        const lines: { message: string; level: AppLogLevel }[] = [];
        const log = (message: string, level: AppLogLevel): void => { lines.push({ message, level }); };
        const d: CommandDispatch<MainWindowState> = {
          handlers: {} as CommandHandlers,
          forCommand: () => WINDOW,
          awaitWorkspace: () => Promise.resolve(),
          settle: (outcome: CommandOutcome) => outcome,
          log,
          refusals: commandRefusals(new FakeClock(), log),
        };
        const outcome = await dispatchCommand(input, 7, d);
        expect(outcome).toMatchObject({ ok: false, code: 'command.malformed' });
        expect(lines).toHaveLength(1);
        expect(lines[0]!.level).toBe('warn');
        expect(lines[0]!.message).toMatch(/^refused a command from window 7 \((unknown kind|past a bound|unreadable)(, kind [A-Za-z0-9._-]+)?\): The /);
        expect(lines[0]!.message).not.toContain('Ω');
        expect(lines[0]!.message).not.toContain('payload-485');
        expect(JSON.stringify(outcome)).not.toContain('payload-485');
      }),
      RUNS,
    );
  });
});
