import { describe, expect, it } from 'vitest';
import { APP_LOG_LEVEL_VARIABLE, appLogThreshold, createAppLog, formatAppLogLine, type AppLogLevel } from './app-log.js';

const LEVELS: readonly AppLogLevel[] = ['debug', 'info', 'warn', 'error'];
const AT = '2026-09-27T10:00:00.000Z';

/** The logger at one threshold, with every written line collected and every stamp counted. */
function harness(threshold: AppLogLevel) {
  const written: string[] = [];
  let stamps = 0;
  const log = createAppLog({ threshold, now: () => { stamps += 1; return AT; }, write: (line) => written.push(line) });
  return { log, written, stamps: () => stamps };
}

describe('PD-MONITOR-002: the threshold is ROTARIS_APP_LOG_LEVEL, read as the directive lists it', () => {
  it('names the variable the directive names', () => {
    expect(APP_LOG_LEVEL_VARIABLE).toBe('ROTARIS_APP_LOG_LEVEL');
  });

  it('accepts debug, info, warning and error in any casing', () => {
    for (const [value, threshold] of [
      ['debug', 'debug'], ['DEBUG', 'debug'], ['Debug', 'debug'],
      ['info', 'info'], ['INFO', 'info'], ['iNfO', 'info'],
      ['warning', 'warn'], ['WARNING', 'warn'], ['Warning', 'warn'],
      ['error', 'error'], ['ERROR', 'error'], ['Error', 'error'],
    ] as const) {
      expect(appLogThreshold(value), value).toEqual({ threshold, warning: null });
    }
  });

  it('is info when the variable is unset or empty, and says nothing about it', () => {
    expect(appLogThreshold(undefined)).toEqual({ threshold: 'info', warning: null });
    expect(appLogThreshold('')).toEqual({ threshold: 'info', warning: null });
  });

  it('is info for any other value — the protocol\'s own `warn` among them — and says which value it did not take', () => {
    for (const value of ['warn', 'verbose', 'trace', '10', ' debug', 'debug ']) {
      const parsed = appLogThreshold(value);
      expect(parsed.threshold, value).toBe('info');
      expect(parsed.warning, value).toBe(`ROTARIS_APP_LOG_LEVEL '${value}' is not one of debug, info, warning or error; recording info and above`);
    }
  });
});

describe('PD-MONITOR-002: a line carries its level as a field', () => {
  it('writes main\'s own line with the level in a column of its own, ahead of the message', () => {
    expect(formatAppLogLine(AT, 'info', null, 'instance claimed (pid 1, host h)')).toBe('[main 2026-09-27T10:00:00.000Z] info    instance claimed (pid 1, host h)');
  });

  it('writes a forwarded line with the same column, and the source after it rather than the level inside the message', () => {
    expect(formatAppLogLine(AT, 'debug', 'run host', 'mcp code_intelligence stderr: INFO starting'))
      .toBe('[main 2026-09-27T10:00:00.000Z] debug   run host: mcp code_intelligence stderr: INFO starting');
    expect(formatAppLogLine(AT, 'warn', 'workspace service', "improvement 'a' version recording failed: disk full"))
      .toBe("[main 2026-09-27T10:00:00.000Z] warning workspace service: improvement 'a' version recording failed: disk full");
  });

  it('starts the message at the same column whatever the level', () => {
    const columns = LEVELS.map((level) => formatAppLogLine(AT, level, null, 'm').indexOf(' m'));
    expect(new Set(columns).size).toBe(1);
  });

  it('writes the level with the word the variable accepts for it, so a reader can set the variable to what they read', () => {
    for (const level of LEVELS) {
      const word = /^\[main \S+\] (\S+) /.exec(formatAppLogLine(AT, level, null, 'm'))?.[1];
      expect(appLogThreshold(word), level).toEqual({ threshold: level, warning: null });
    }
  });

  it('gives every line of a message of several lines its stamp, level and source', () => {
    expect(formatAppLogLine(AT, 'error', null, 'UNCAUGHT in main: Error: boom\n    at a (a.js:1:1)\r\n    at b (b.js:2:2)').split('\n')).toEqual([
      '[main 2026-09-27T10:00:00.000Z] error   UNCAUGHT in main: Error: boom',
      '[main 2026-09-27T10:00:00.000Z] error       at a (a.js:1:1)',
      '[main 2026-09-27T10:00:00.000Z] error       at b (b.js:2:2)',
    ]);
    expect(formatAppLogLine(AT, 'info', 'run host', 'one\ntwo').split('\n')).toEqual([
      '[main 2026-09-27T10:00:00.000Z] info    run host: one',
      '[main 2026-09-27T10:00:00.000Z] info    run host: two',
    ]);
  });
});

describe('PD-MONITOR-002: a line is recorded only at or above the threshold', () => {
  const each = (log: ReturnType<typeof harness>['log']) => { for (const level of LEVELS) log(level, null, level); };
  const recorded = (written: readonly string[]) => written.map((line) => line.slice(line.lastIndexOf(' ') + 1));

  it('records info and above by default — the threshold an unset variable gives', () => {
    const h = harness(appLogThreshold(undefined).threshold);
    each(h.log);
    expect(recorded(h.written)).toEqual(['info', 'warn', 'error']);
  });

  it('records every level at debug, warning and error only at warning, error only at error', () => {
    const at = (threshold: AppLogLevel) => { const h = harness(threshold); each(h.log); return recorded(h.written); };
    expect(at('debug')).toEqual(['debug', 'info', 'warn', 'error']);
    expect(at('warn')).toEqual(['warn', 'error']);
    expect(at('error')).toEqual(['error']);
  });

  it('filters a line forwarded from a child by the level the child gave it, like any other line', () => {
    const quiet = harness('info');
    quiet.log('debug', 'run host', 'mcp code_intelligence stderr: INFO serena starting');
    quiet.log('info', 'run host', 'confinement: available (bubblewrap)');
    quiet.log('warn', 'workspace service', "improvement 'a' version recording failed: disk full");
    expect(quiet.written).toEqual([
      '[main 2026-09-27T10:00:00.000Z] info    run host: confinement: available (bubblewrap)',
      "[main 2026-09-27T10:00:00.000Z] warning workspace service: improvement 'a' version recording failed: disk full",
    ]);
    const loud = harness('debug');
    loud.log('debug', 'run host', 'mcp code_intelligence stderr: INFO serena starting');
    expect(loud.written).toEqual(['[main 2026-09-27T10:00:00.000Z] debug   run host: mcp code_intelligence stderr: INFO serena starting']);
  });

  it('does not stamp or format a line it leaves out', () => {
    const h = harness('info');
    for (let i = 0; i < 141; i += 1) h.log('debug', 'run host', `mcp code_intelligence stderr: line ${i}`);
    expect(h.written).toEqual([]);
    expect(h.stamps()).toBe(0);
  });
});
