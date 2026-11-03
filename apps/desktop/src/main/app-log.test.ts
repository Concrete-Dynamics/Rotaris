import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { APP_LOG_LEVEL_VARIABLE, appLogThreshold, createAppLog, formatAppLogLine, standardStreamWriter, type AppLogLevel, type AppLogRecord } from './app-log.js';

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

  it('ends a message that ends in a line break on its last line, with no line holding only the stamp and level', () => {
    expect(formatAppLogLine(AT, 'warn', 'run host', 'one\ntwo\n').split('\n')).toEqual([
      '[main 2026-09-27T10:00:00.000Z] warning run host: one',
      '[main 2026-09-27T10:00:00.000Z] warning run host: two',
    ]);
    expect(formatAppLogLine(AT, 'info', null, 'one\r\n')).toBe('[main 2026-09-27T10:00:00.000Z] info    one');
    // Only the one final break: a blank line inside a message, or a message of breaks, keeps what it holds.
    expect(formatAppLogLine(AT, 'info', null, 'a\n\nb').split('\n')).toHaveLength(3);
    expect(formatAppLogLine(AT, 'info', null, '\n\n').split('\n')).toHaveLength(2);
    expect(formatAppLogLine(AT, 'info', null, '')).toBe('[main 2026-09-27T10:00:00.000Z] info    ');
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

/**
 * Defect `a-quit-with-its-standard-output-closed-loops-on-its-own-epipe` (R-067): with its reader gone, main's standard
 * output fails every write with EPIPE, reported as an `error` event. Unlistened, that event is an uncaught exception,
 * which main's handler logged through the same stream — without end, so the quit and its 30 s backstop never ran
 * (REQ-MONITOR-131).
 */
/*
 * REQ-TOOLS-171 ("application log files" among the surfaces the one pass backs), REQ-PROVIDER-035: every recorded line
 * passes through `redact()`, main's own and a child's forwarded alike
 * (`docs/archive/defects/mains-application-log-lines-bypass-the-redaction-pass.md`). The shapes are kernel's
 * (`packages/kernel/src/redaction.test.ts`); what is pinned here is that the log applies them, to the message only.
 */
describe('REQ-TOOLS-171: the application log writes every line through the one redaction pass', () => {
  /** A written line less its stamp and level: the source, when there is one, and the message. */
  const message = (line: string) => line.slice(line.indexOf(' ', line.indexOf('] ') + 2)).trimStart();

  it('masks a token-shaped value in main\'s own line and in a line a child forwards', () => {
    const h = harness('debug');
    h.log('warn', null, 'provider refused: Authorization: Bearer sk-live-abc123');
    h.log('info', 'run host', 'export OPENAI_API_KEY=sk-proj-xyz && run');
    h.log('error', 'workspace service', 'clone failed: https://bob:hunter2@example.com/r.git');
    h.log('debug', 'run host', '--api-key shhh ghp_0123456789abcdef');
    expect(h.written.map(message)).toEqual([
      'provider refused: Authorization: Bearer ***',
      'run host: export OPENAI_API_KEY=*** && run',
      'workspace service: clone failed: https://bob:***@example.com/r.git',
      'run host: --api-key *** ***',
    ]);
    for (const secret of ['sk-live-abc123', 'sk-proj-xyz', 'hunter2', 'shhh', 'ghp_0123456789abcdef']) expect(h.written.join('\n')).not.toContain(secret);
  });

  it('masks a key in a URL\'s query and leaves the rest of the URL legible', () => {
    const h = harness('info');
    h.log('warn', 'run host', 'model request GET https://api.example.com/v1/models?api_key=SECRET123 failed: 401');
    expect(h.written.map(message)).toEqual(['run host: model request GET https://api.example.com/v1/models?api_key=*** failed: 401']);
  });

  it('writes a line with nothing secret in it byte for byte as before', () => {
    const plain = 'run 3f2a ended completed after 4 iteration(s): 1,204 tokens in, 88 out; workspace C:\\ws\\a (git=true)';
    const h = harness('info');
    h.log('info', 'run host', plain);
    expect(h.written).toEqual([formatAppLogLine(AT, 'info', 'run host', plain)]);
  });

  it('masks a PEM block spanning several lines whole, before the message is split into lines', () => {
    const h = harness('info');
    h.log('error', null, 'unreadable certificate:\n-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----');
    expect(h.written[0]?.split('\n').map(message)).toEqual(['unreadable certificate:', '-----BEGIN PRIVATE KEY-----', '***', '-----END PRIVATE KEY-----']);
  });

  it('leaves the credential lease\'s report legible: its prefix is not an assignment the pass masks', () => {
    const h = harness('info');
    h.log('info', 'run host', 'credential lease: leased for openai-compatible--katalyst (workspace C:\\w)');
    h.log('info', null, 'credential store: openai.json is unreadable; treated as absent');
    expect(h.written.map(message)).toEqual([
      'run host: credential lease: leased for openai-compatible--katalyst (workspace C:\\w)',
      'credential store: openai.json is unreadable; treated as absent',
    ]);
    // The prefix it replaced: under the pass, `credentials: leased` is an assignment and its value is masked.
    h.log('info', 'run host', 'credentials: leased for x');
    expect(message(h.written[2] as string)).toBe('run host: credentials: *** for x');
  });
});

/**
 * REQ-STARTUP-129's `light` level (hardening D2): the diagnostics captures receive exactly the lines the log records, as
 * records — after the threshold and the redaction pass, with the stamp the written line carries — and nothing else.
 */
describe('REQ-STARTUP-129: a recorded line also reaches the diagnostics captures as a record', () => {
  function recording(threshold: AppLogLevel) {
    const written: string[] = [];
    const records: AppLogRecord[] = [];
    let n = 0;
    const log = createAppLog({ threshold, now: () => `2026-11-03T00:00:0${n++}.000Z`, write: (line) => written.push(line), record: (r) => records.push(r) });
    return { log, written, records };
  }

  it('records each written line once, with its stamp, the written level word, its source and its redacted message', () => {
    const h = recording('info');
    h.log('debug', 'run host', 'left out');
    h.log('info', null, 'a line of main');
    h.log('warn', 'run host', 'token sk-live-abc123 refused');
    expect(h.records).toEqual([
      { at: '2026-11-03T00:00:00.000Z', level: 'info', source: 'main', message: 'a line of main' },
      { at: '2026-11-03T00:00:01.000Z', level: 'warning', source: 'run host', message: 'token *** refused' },
    ]);
    expect(h.written).toHaveLength(2);
    expect(h.written[1]).toContain('2026-11-03T00:00:01.000Z');
  });

  it('keeps a message of several lines whole in one record', () => {
    const h = recording('info');
    h.log('error', null, 'UNCAUGHT\n    at a (a.js:1:1)');
    expect(h.records.map((r) => r.message)).toEqual(['UNCAUGHT\n    at a (a.js:1:1)']);
  });

  it('asks nothing of a log that has no captures to feed', () => {
    const written: string[] = [];
    createAppLog({ threshold: 'info', now: () => AT, write: (line) => written.push(line) })('info', null, 'plain');
    expect(written).toHaveLength(1);
  });
});

describe('REQ-MONITOR-131: a standard stream whose reader has gone never turns the log into a loop of its own failures', () => {
  function stream(opts: { throws?: boolean } = {}) {
    const e = new EventEmitter();
    const written: string[] = [];
    return Object.assign(e, { written, write: (chunk: string) => { if (opts.throws === true) throw new Error('write EPIPE'); written.push(chunk); return true; } });
  }
  const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });

  it('writes each line with its line break while the stream is whole', () => {
    const out = stream();
    const write = standardStreamWriter(out);
    write('one');
    write('two');
    expect(out.written).toEqual(['one\n', 'two\n']);
  });

  it('listens for the stream\'s failure, so an EPIPE is never an uncaught exception, and writes nothing more after it', () => {
    const out = stream();
    // Without a listener an emitted `error` throws: that throw is the uncaught exception the loop was made of.
    expect(() => out.emit('error', epipe)).toThrow('write EPIPE');
    const write = standardStreamWriter(out);
    write('before');
    expect(() => out.emit('error', epipe)).not.toThrow();
    // What the uncaught-exception handler would have written — and every line after it — goes nowhere.
    write('UNCAUGHT in main: Error: write EPIPE');
    write('quit: requested (before-quit)');
    expect(out.written).toEqual(['before\n']);
  });

  it('treats a write that throws at once as the same failure, and does not try again', () => {
    const out = stream({ throws: true });
    let attempts = 0;
    const counting = Object.assign(out, { write: (chunk: string) => { attempts += 1; throw new Error(`write EPIPE ${chunk}`); } });
    const write = standardStreamWriter(counting);
    expect(() => write('one')).not.toThrow();
    write('two');
    expect(attempts).toBe(1);
  });

  it('carries the log\'s own lines, so a logger over a broken stream is silent rather than failing', () => {
    const out = stream();
    const log = createAppLog({ threshold: 'info', now: () => AT, write: standardStreamWriter(out) });
    log('info', null, 'quit: requested (before-quit)');
    out.emit('error', epipe);
    log('error', null, 'UNCAUGHT in main: Error: write EPIPE');
    expect(out.written).toEqual([`${formatAppLogLine(AT, 'info', null, 'quit: requested (before-quit)')}\n`]);
  });
});
