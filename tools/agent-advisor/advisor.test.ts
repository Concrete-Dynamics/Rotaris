/**
 * The agent advisor's tests (R-126, the development-harness half): fixture hook inputs through `handle`, the review
 * replaced by a function, and the real launch against a stand-in for `claude`. No test writes the operator's store:
 * each names its own directory through `ROTARIS_AGENT_ADVISOR_HOME`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DISABLE_ENV,
  EVERY_ENV,
  HOME_ENV,
  MAX_WORDS,
  MODE_ENV,
  MODEL_ENV,
  canonicalJson,
  detect,
  disabled,
  fingerprint,
  handle,
  logPath,
  parseVerdict,
  readLog,
  reviewWithClaude,
  settings,
  storeDir,
  transcriptTail,
} from './advisor.mjs';

type Input = Record<string, unknown>;
type Review = NonNullable<NonNullable<Parameters<typeof handle>[1]>['review']>;
type Request = Parameters<Review>[0];

const ADVISOR = fileURLToPath(new URL('./advisor.mjs', import.meta.url));
const SESSION = 'session-1';

let home = '';
let env: NodeJS.ProcessEnv = {};

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'agent-advisor-'));
  env = { [HOME_ENV]: home, [EVERY_ENV]: '4' };
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const ok = (tool: string, toolInput: Input, extra: Input = {}): Input => ({
  session_id: SESSION,
  transcript_path: join(home, 'missing.jsonl'),
  hook_event_name: 'PostToolUse',
  tool_name: tool,
  tool_input: toolInput,
  tool_response: { stdout: '', stderr: '', interrupted: false },
  ...extra,
});
const failed = (command: string, error: string, extra: Input = {}): Input => ({
  session_id: SESSION,
  hook_event_name: 'PostToolUseFailure',
  tool_name: 'Bash',
  tool_input: { command },
  error,
  ...extra,
});
const prompt = (): Input => ({ session_id: SESSION, hook_event_name: 'UserPromptSubmit', prompt: 'go on' });

/** A review that must not be reached. */
const never: Review = () => Promise.reject(new Error('the review was asked'));
/** A review that fails, as a timeout or a missing `claude` does. */
const broken: Review = () => Promise.resolve(null);
const stuck = (message = 'Change your approach.'): Review => () => Promise.resolve({ progressing: false, message });

const feed = async (inputs: Input[], review: Review, over: NodeJS.ProcessEnv = {}) => {
  const outputs = [];
  for (const input of inputs) outputs.push(await handle(input, { env: { ...env, ...over }, review }));
  return outputs;
};
const context = (output: Record<string, unknown> | null | undefined): string =>
  (output?.hookSpecificOutput as { additionalContext: string } | undefined)?.additionalContext ?? '';
const checks = () => readLog(logPath(home, SESSION)).filter((line) => line.t === 'check');

describe('the store and its switches', () => {
  it('lives under ~/.rotaris/agent-advisor unless the override names another directory', () => {
    expect(storeDir({}, '/home/someone')).toBe(join('/home/someone', '.rotaris', 'agent-advisor'));
    expect(storeDir({ [HOME_ENV]: home }, '/home/someone')).toBe(home);
  });

  it('is switched off by the disable variable, and then writes nothing', async () => {
    expect(disabled({})).toBe(false);
    expect(disabled({ [DISABLE_ENV]: '0' })).toBe(false);
    expect(disabled({ [DISABLE_ENV]: '1' })).toBe(true);
    await feed(Array.from({ length: 8 }, () => failed('pnpm test', 'Exit code 1')), never, { [DISABLE_ENV]: '1' });
    expect(readdirSync(home)).toEqual([]);
  });

  it('reads its settings from the environment and falls back on a value it cannot use', () => {
    expect(settings({})).toEqual({ every: 25, mode: 'signal', model: 'claude-haiku-5-5' });
    expect(settings({ [EVERY_ENV]: '3', [MODE_ENV]: 'periodic', [MODEL_ENV]: 'sonnet' })).toEqual({ every: 3, mode: 'periodic', model: 'sonnet' });
    expect(settings({ [EVERY_ENV]: 'often', [MODE_ENV]: 'sometimes' })).toEqual({ every: 25, mode: 'signal', model: 'claude-haiku-5-5' });
  });

  it('never lets a session id name a path', () => {
    expect(logPath(home, 'abc-123')).toBe(join(home, 'abc-123.jsonl'));
    expect(logPath(home, '../../etc/passwd').startsWith(home)).toBe(true);
    expect(logPath(home, '../../etc/passwd')).not.toContain('..');
  });
});

describe('the fingerprint', () => {
  it('is the tool name plus the input as canonical JSON, keys sorted at every depth', () => {
    expect(canonicalJson({ b: [{ d: 1, c: 2 }], a: { z: null, y: 'x' } })).toBe('{"a":{"y":"x","z":null},"b":[{"c":2,"d":1}]}');
    const one = fingerprint(ok('Grep', { pattern: 'x', path: { b: 1, a: 2 } }));
    const two = fingerprint(ok('Grep', { path: { a: 2, b: 1 }, pattern: 'x' }));
    expect(one.key).toBe(two.key);
    expect(fingerprint(ok('Glob', { pattern: 'x', path: { b: 1, a: 2 } })).key).not.toBe(one.key);
    expect(fingerprint(ok('Grep', { pattern: 'y', path: { b: 1, a: 2 } })).key).not.toBe(one.key);
  });

  it('says whether the call errored, and levels what varies in an error text', () => {
    expect(fingerprint(ok('Bash', { command: 'ls' }))).toMatchObject({ err: false, ek: null, edit: false });
    const first = fingerprint(failed('pnpm test', 'Exit code 1\n 3 failed in 1204ms'));
    const second = fingerprint(failed('pnpm test --bail', 'Exit code 1\n 3 failed   in 998ms'));
    expect(fingerprint(failed('pnpm test', '')).ek).toBeNull();
    expect(first.err).toBe(true);
    expect(first.ek).toBe(second.ek);
    expect(fingerprint(failed('pnpm test', 'Exit code 127\ncommand not found')).ek).not.toBe(first.ek);
    expect(fingerprint(ok('Edit', { file_path: 'a.ts' })).edit).toBe(true);
  });

  it('leaves Bash’s description out of the identity, and no other tool’s', () => {
    const bash = (description: string) => fingerprint(ok('Bash', { command: 'pnpm test', description })).key;
    expect(bash('Run tests (1 of 12)')).toBe(bash('Run tests (2 of 12)'));
    const agent = (description: string) => fingerprint(ok('Agent', { prompt: 'look', description })).key;
    expect(agent('one')).not.toBe(agent('two'));
  });

  it('is appended on every call', async () => {
    await feed([ok('Read', { file_path: 'a.ts' }), failed('pnpm test', 'Exit code 1')], never);
    const lines = readLog(logPath(home, SESSION));
    expect(lines.map((line) => line.t)).toEqual(['call', 'call']);
    expect(lines[0]).toMatchObject({ tool: 'Read', err: false, s: 'main' });
    expect(lines[1]).toMatchObject({ tool: 'Bash', err: true });
  });
});

describe('a healthy session', () => {
  it('is checked every N calls, never nudged and never reviewed', async () => {
    const inputs = Array.from({ length: 12 }, (_, i) => (i % 3 === 2 ? ok('Edit', { file_path: `f${i}.ts` }) : ok('Read', { file_path: `f${i}.ts` })));
    const outputs = await feed(inputs, never);
    expect(outputs.every((output) => output === null)).toBe(true);
    expect(checks().map((line) => [line.at, line.verdict])).toEqual([[4, 'ok'], [8, 'ok'], [12, 'ok']]);
  });

  it('is left alone when a heuristic fires and the review says the agent is progressing', async () => {
    const outputs = await feed(Array.from({ length: 4 }, () => ok('Bash', { command: 'gh run view 7' })), () => Promise.resolve({ progressing: true, message: '' }));
    expect(outputs.every((output) => output === null)).toBe(true);
    expect(checks().map((line) => [line.verdict, line.kind])).toEqual([['ok', 'repeat']]);
  });
});

describe('signal mode', () => {
  it('nudges on the same call four times in a row, with the review’s message', async () => {
    const seen: Request[] = [];
    const outputs = await feed(Array.from({ length: 4 }, () => ok('Bash', { command: 'pnpm test' })), (request) => {
      seen.push(request);
      return Promise.resolve({ progressing: false, message: 'Read the failing assertion first.' });
    });
    expect(outputs.slice(0, 3)).toEqual([null, null, null]);
    expect(context(outputs[3])).toContain('Read the failing assertion first.');
    expect((outputs[3]?.hookSpecificOutput as Input).hookEventName).toBe('PostToolUse');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ model: 'claude-haiku-5-5', signal: { kind: 'repeat' } });
  });

  it('nudges on a cycle two to four calls wide seen three times', async () => {
    const lap = [ok('Edit', { file_path: 'a.ts', old_string: 'x', new_string: 'y' }), ok('Bash', { command: 'pnpm test' })];
    const outputs = await feed([...lap, ...lap, ...lap, ok('Read', { file_path: 'b.ts' }), ok('Read', { file_path: 'c.ts' })], stuck());
    expect(context(outputs[7])).toContain('Change your approach.');
    expect(checks().map((line) => [line.at, line.verdict, line.kind])).toEqual([[4, 'ok', null], [8, 'nudge', 'cycle']]);
  });

  it('nudges on the same error text three times, on the failure event’s own name', async () => {
    const outputs = await feed(
      [failed('pnpm test a', 'Exit code 1\nboom'), ok('Read', { file_path: 'a.ts' }), failed('pnpm test b', 'Exit code 1\nboom'), failed('pnpm test c', 'Exit code 1\nboom')],
      stuck(),
    );
    expect(context(outputs[3])).toContain('Change your approach.');
    expect((outputs[3]?.hookSpecificOutput as Input).hookEventName).toBe('PostToolUseFailure');
    expect(checks()[0]).toMatchObject({ verdict: 'nudge', kind: 'error' });
  });

  it('nudges when nothing was edited in the last 2N calls while Bash failures repeat', async () => {
    const inputs = Array.from({ length: 8 }, (_, i) => (i % 3 === 0 ? failed(`pnpm test ${i}`, `Exit code 1\nfailure ${'x'.repeat(i + 1)}`) : ok('Read', { file_path: `f${i}.ts` })));
    const outputs = await feed(inputs, broken);
    expect(context(outputs[7])).toContain('edited no file in the last 8 calls');
    expect(checks().map((line) => [line.verdict, line.kind])).toEqual([['ok', null], ['nudge', 'stall']]);
  });

  it('does not count a stall once a file was edited', () => {
    const call = (tool: string, err: boolean, n: number) => ({ t: 'call' as const, id: `${n}`, s: 'main', tool, key: `k${n}`, err, ek: err ? `e${n}` : null, brief: tool, edit: tool === 'Edit' });
    const calls = Array.from({ length: 8 }, (_, i) => call(i === 1 ? 'Edit' : 'Bash', i !== 1, i));
    expect(detect(calls, 4)).toBeNull();
  });

  it('falls back on the heuristic’s fixed nudge when the review fails', async () => {
    const outputs = await feed(Array.from({ length: 4 }, () => ok('Bash', { command: 'pnpm test' })), broken);
    expect(context(outputs[3])).toContain('You made the same call 4 times in a row with identical input (Bash pnpm test)');
    expect(checks()[0]).toMatchObject({ verdict: 'nudge', kind: 'repeat' });
  });

  it('falls back the same way when the review throws', async () => {
    const outputs = await feed(Array.from({ length: 4 }, () => ok('Bash', { command: 'pnpm test' })), never);
    expect(context(outputs[3])).toContain('You made the same call 4 times');
  });

  it('does not report again a loop the agent has left', async () => {
    const loop = Array.from({ length: 4 }, () => ok('Bash', { command: 'pnpm test' }));
    const after = Array.from({ length: 4 }, (_, i) => ok('Read', { file_path: `f${i}.ts` }));
    const outputs = await feed([...loop, ...after], broken);
    expect(outputs[3]).not.toBeNull();
    expect(outputs[7]).toBeNull();
    expect(checks().map((line) => line.verdict)).toEqual(['nudge', 'ok']);
  });
});

describe('periodic mode', () => {
  it('asks the review every N calls regardless, and nudges on its word alone', async () => {
    let asked = 0;
    const review: Review = () => {
      asked += 1;
      return Promise.resolve(asked === 2 ? { progressing: false, message: 'You are wandering.' } : { progressing: true, message: '' });
    };
    const outputs = await feed(Array.from({ length: 8 }, (_, i) => ok('Read', { file_path: `f${i}.ts` })), review, { [MODE_ENV]: 'periodic' });
    expect(asked).toBe(2);
    expect(outputs[3]).toBeNull();
    expect(context(outputs[7])).toContain('You are wandering.');
  });

  it('says nothing when the review fails, even on a heuristic hit', async () => {
    const outputs = await feed(Array.from({ length: 8 }, () => ok('Bash', { command: 'pnpm test' })), broken, { [MODE_ENV]: 'periodic' });
    expect(outputs.every((output) => output === null)).toBe(true);
    expect(checks().map((line) => line.verdict)).toEqual(['skip', 'skip']);
  });
});

describe('escalation', () => {
  const loop = (n: number) => Array.from({ length: n }, () => failed('pnpm test', 'Exit code 1\nboom'));
  const before = (extra: Input = {}): Input => ({ session_id: SESSION, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'pnpm test' }, ...extra });

  it('stops the session on the third consecutive nudge, with a reason naming the loop', async () => {
    const outputs = await feed(Array.from({ length: 12 }, () => ok('Bash', { command: 'pnpm test' })), stuck());
    expect(context(outputs[3])).not.toBe('');
    expect(context(outputs[3])).not.toContain('the next one stops the session');
    expect(context(outputs[7])).toContain('nudge 2 in a row; the next one stops the session');
    expect(outputs[11]).toMatchObject({ continue: false });
    expect(String(outputs[11]?.stopReason)).toContain('the same call 12 times in a row (Bash pnpm test)');
    expect(outputs[11]?.hookSpecificOutput).toBeUndefined();
    expect(checks().map((line) => line.verdict)).toEqual(['nudge', 'nudge', 'halt']);
  });

  it('delivers a stop earned on a failed call before the next call, since the failure event cannot stop a session', async () => {
    expect(await feed([before()], never)).toEqual([null]);
    const outputs = await feed(loop(12), stuck());
    // The failure event says it to the model; it carries no `continue: false`, which Claude Code ignores there.
    expect(outputs[11]?.continue).toBeUndefined();
    expect(context(outputs[11])).toContain('Agent advisor stopped this session');
    expect(await feed([before({ agent_id: 'agent-7' })], never)).toEqual([null]);
    const [stop] = await feed([before()], never);
    expect(stop).toMatchObject({ continue: false });
    expect(String(stop?.stopReason)).toContain('the same call 12 times in a row (Bash pnpm test)');
    expect(checks().map((line) => line.verdict)).toEqual(['nudge', 'nudge', 'halt', 'stopped']);
    // Said once: the next call is not stopped again, and a user prompt clears a stop that was never delivered.
    expect(await feed([before()], never)).toEqual([null]);
  });

  it('never stops a session on a heuristic alone: with the review failing, the third check nudges again', async () => {
    const outputs = await feed(loop(16), broken);
    expect(outputs.some((output) => output?.continue === false)).toBe(false);
    expect(context(outputs[11])).toContain('You made the same call 12 times');
    expect(checks().map((line) => line.verdict)).toEqual(['nudge', 'nudge', 'skip', 'skip']);
    expect(await feed([before()], never)).toEqual([null]);
  });

  it('drops an undelivered stop on a user prompt', async () => {
    await feed(loop(12), stuck());
    expect(await feed([prompt(), before()], never)).toEqual([null, null]);
  });

  it('starts the series over on a user prompt', async () => {
    const outputs = await feed([...loop(8), prompt(), ...loop(8)], broken);
    expect(outputs[8]).toBeNull();
    // After the prompt the evidence starts over too: four more failures are the first nudge again, not the third.
    expect(context(outputs[12])).not.toBe('');
    expect(context(outputs[12])).not.toContain('the next one stops the session');
    expect(context(outputs[16])).toContain('nudge 2 in a row');
    expect(outputs.some((output) => output?.continue === false)).toBe(false);
  });

  it('starts the series over on a healthy check', async () => {
    const healthy = Array.from({ length: 4 }, (_, i) => ok('Edit', { file_path: `f${i}.ts` }));
    const outputs = await feed([...loop(8), ...healthy, ...loop(8)], broken);
    expect(outputs.some((output) => output?.continue === false)).toBe(false);
    expect(checks().map((line) => line.verdict)).toEqual(['nudge', 'nudge', 'ok', 'nudge', 'nudge']);
  });
});

describe('streams', () => {
  it('counts and judges a subagent apart from the main conversation', async () => {
    const main = Array.from({ length: 3 }, () => ok('Bash', { command: 'pnpm test' }));
    const sub = Array.from({ length: 4 }, (_, i) => ok('Read', { file_path: `f${i}.ts` }, { agent_id: 'agent-7', agent_type: 'Explore' }));
    const outputs = await feed([...main, ...sub, ok('Bash', { command: 'pnpm test' })], broken);
    expect(outputs[6]).toBeNull();
    expect(context(outputs[7])).toContain('same call 4 times');
    expect(checks().map((line) => [line.s, line.verdict])).toEqual([['agent-7', 'ok'], ['main', 'nudge']]);
  });

  it('makes exactly one of a turn’s parallel calls the Nth', async () => {
    const outputs = await Promise.all(Array.from({ length: 8 }, () => handle(ok('Bash', { command: 'pnpm test' }), { env, review: broken })));
    expect(outputs.filter((output) => output !== null)).toHaveLength(2);
    expect(checks().map((line) => line.at).sort()).toEqual([4, 8]);
  });
});

describe('the transcript tail', () => {
  it('renders what was said, each call and the start of each result, newest kept', () => {
    const file = join(home, 'transcript.jsonl');
    const entries = [
      { type: 'user', message: { content: 'fix the test' } },
      { type: 'summary', message: { content: 'not part of the conversation' } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Running it.' }, { type: 'tool_use', name: 'Bash', input: { command: 'pnpm test' } }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', is_error: true, content: 'Exit code 1' }] } },
    ];
    writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\nnot json\n`);
    expect(transcriptTail(file)).toBe('USER: fix the test\nASSISTANT: Running it.\nCALL Bash: {"command":"pnpm test"}\nERROR: Exit code 1');
    expect(transcriptTail(file, 20)).toBe('}\nERROR: Exit code 1');
    expect(transcriptTail(join(home, 'absent.jsonl'))).toBe('');
    expect(transcriptTail(undefined)).toBe('');
  });
});

describe('the review', () => {
  it('reads a verdict out of the answer and holds the message to its length', () => {
    expect(parseVerdict('Sure.\n{"progressing": true, "message": ""}')).toEqual({ progressing: true, message: '' });
    expect(parseVerdict('```json\n{"progressing": false, "message": "Stop  retrying."}\n```')).toEqual({ progressing: false, message: 'Stop retrying.' });
    const long = parseVerdict(JSON.stringify({ progressing: false, message: Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ') }));
    expect(long?.message.split(' ')).toHaveLength(MAX_WORDS);
    expect(parseVerdict('{"progressing": false, "message": ""}')).toBeNull();
    expect(parseVerdict('{"progressing": "no"}')).toBeNull();
    expect(parseVerdict('no object here')).toBeNull();
  });

  const standIn = (body: string) => {
    const file = join(home, 'stand-in.mjs');
    writeFileSync(file, body);
    return { command: process.execPath, args: [file] };
  };
  const request: Request = { model: 'claude-haiku-5-5', tail: 'CALL Bash: pnpm test', signal: null };

  it('hands the transcript to the child on stdin and launches it with the advisor disabled', async () => {
    const launch = standIn(`
      let text = '';
      process.stdin.on('data', (chunk) => { text += chunk; });
      process.stdin.on('end', () => {
        const message = [process.env.${DISABLE_ENV}, text.includes('CALL Bash: pnpm test')].join(' ');
        process.stdout.write(JSON.stringify({ progressing: false, message }));
      });
    `);
    expect(await reviewWithClaude(request, { ...launch, env: { ...process.env, [DISABLE_ENV]: '' } })).toEqual({ progressing: false, message: '1 true' });
  });

  it('is no verdict when the child fails, cannot be started or answers nonsense', async () => {
    expect(await reviewWithClaude(request, standIn('process.exit(3);'))).toBeNull();
    expect(await reviewWithClaude(request, { command: join(home, 'no-such-binary'), args: [] })).toBeNull();
    expect(await reviewWithClaude(request, standIn('process.stdout.write("I think it is fine");'))).toBeNull();
  });

  it('is bounded: an overrunning child is killed with its process group', async () => {
    const pidFile = join(home, 'grandchild.pid');
    const launch = standIn(`
      import { spawn } from 'node:child_process';
      import { writeFileSync } from 'node:fs';
      const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      writeFileSync(${JSON.stringify(pidFile)}, String(grandchild.pid));
      setInterval(() => {}, 1000);
    `);
    const started = Date.now();
    const pending = reviewWithClaude(request, { ...launch, timeoutMs: 1500 });
    expect(await pending).toBeNull();
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(existsSync(pidFile)).toBe(true);
    if (process.platform === 'win32') return;
    const pid = Number(readFileSync(pidFile, 'utf8'));
    const alive = () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (let i = 0; i < 50 && alive(); i += 1) await new Promise((r) => setTimeout(r, 100));
    expect(alive()).toBe(false);
  }, 20_000);
});

describe('the hook process', () => {
  const run = (stdin: string, over: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, [ADVISOR], { input: stdin, encoding: 'utf8', env: { ...process.env, ...env, [EVERY_ENV]: '2', [MODEL_ENV]: 'unused', PATH: home, ...over } });

  it('prints the nudge as JSON on stdout and exits 0', () => {
    // PATH holds no `claude`, so the review fails and the heuristic's fixed nudge answers.
    const inputs = Array.from({ length: 4 }, () => JSON.stringify(ok('Bash', { command: 'pnpm test' })));
    const results = inputs.map((input) => run(input));
    expect(results.map((result) => result.status)).toEqual([0, 0, 0, 0]);
    expect(results.slice(0, 3).map((result) => result.stdout)).toEqual(['', '', '']);
    expect(context(JSON.parse(results[3]!.stdout) as Record<string, unknown>)).toContain('same call 4 times');
  });

  it('exits 0 and says nothing on input it cannot read, a store it cannot write, or when disabled', () => {
    for (const result of [
      run('not json'),
      run(''),
      run('[]'),
      run(JSON.stringify({ hook_event_name: 'PostToolUse' })),
      run(JSON.stringify(ok('Bash', { command: 'ls' })), { [HOME_ENV]: join(ADVISOR, 'not-a-directory') }),
      run(JSON.stringify(ok('Bash', { command: 'ls' })), { [DISABLE_ENV]: '1' }),
    ]) {
      expect([result.status, result.stdout, result.stderr]).toEqual([0, '', '']);
    }
  });
});
