/**
 * R-062: the driver client's waiting and ending, pinned without the app. `stopApp` and `connectOrEnd` are pinned
 * against REAL child processes and a REAL socket that accepts and never answers — the shape of a main process that
 * has stopped serving its driver — because what is pinned is that no step of ending a driven launch waits without a
 * bound; and that a store wait a proof has given up on stops polling. `until` and `choose` are pinned against a fake
 * driver: the controlled native select that snaps back before it shows the choice (what mcp-proof's secrets select
 * did), and the design system's chooser driven by two clicks.
 * No product code runs here.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error — the module is plain ESM beside the scripts that run it.
import { choose, clickLanded, connect, connectOrEnd, stopApp, stopOverrunMessage, until, within } from './driver.mjs';

const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch { return false; } };
const cleanups: (() => void)[] = [];
afterEach(() => { while (cleanups.length > 0) cleanups.pop()!(); });

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'driver-test-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A node child that stays up until signalled; `onTerm` is what it does with SIGTERM. */
function sleeper(onTerm = 'process.exit(0)'): ChildProcess {
  const child = spawn(process.execPath, ['-e', `process.on('SIGTERM', () => { ${onTerm} }); setInterval(() => {}, 1000);`], { stdio: 'ignore' });
  cleanups.push(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } });
  return child;
}

/**
 * A loopback driver endpoint. `answer` null: it accepts and never replies (a main process that stopped serving).
 * Otherwise it replies `{ ok: true }` to every request.
 */
async function endpoint(dir: string, { answer }: { answer: boolean }): Promise<string> {
  const sockets: Socket[] = [];
  const server: Server = createServer((socket) => {
    sockets.push(socket);
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      for (let nl = buffer.indexOf('\n'); nl !== -1; nl = buffer.indexOf('\n')) {
        const request = JSON.parse(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (answer) socket.write(`${JSON.stringify({ id: request.id, ok: true, value: null })}\n`);
      }
    });
    socket.on('error', () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => { for (const s of sockets) s.destroy(); server.close(); });
  const file = join(dir, 'endpoint.json');
  writeFileSync(file, JSON.stringify({ port: (server.address() as { port: number }).port, token: 't' }));
  return file;
}

describe('R-062: a driven launch ends within a bound', () => {
  it('within answers null when the request is not answered in time, and the value or the error when it is', async () => {
    expect(await within(new Promise(() => undefined), 50)).toBeNull();
    expect(await within(Promise.resolve(7), 50)).toEqual({ value: 7 });
    const refused = await within(Promise.reject(new Error('no')), 50);
    expect((refused as { error: Error }).error.message).toBe('no');
  });

  it('stopApp ends a launch whose driver accepts and never answers — the picture, the quit, SIGTERM — and says so', async () => {
    const dir = scratch();
    const driver = await connect(await endpoint(dir, { answer: false }), { timeoutMs: 5_000 });
    const child = sleeper();
    const started = Date.now();
    const stopped = await stopApp({ child, driver }, { graceMs: 300, quitMs: 300, screenshot: join(dir, 'end.png') });
    // 300 (picture) + 300 (quit) + 300 (exit) + SIGTERM's answer: bounded, where the first form waited on the quit forever.
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(stopped.screenshot).toBe('unanswered within 300 ms');
    expect(stopped.quitAnswered).toBe(false);
    expect(stopped.overran).toMatchObject({ quitAnswered: false, quitMs: 300, afterQuitMs: 300, endedBy: 'SIGTERM' });
    expect(alive(child.pid!)).toBe(false);
    expect(stopOverrunMessage('override', stopped, 'first\nlast words\n')).toMatch(/^override did not answer the driver's quit within 300 ms, nor exit 300 ms after it: SIGTERM ended it after \d+ ms\.\n--- the launch's last words ---\nfirst\nlast words$/);
  });

  it.skipIf(process.platform === 'win32')('stopApp SIGKILLs a launch that neither answers nor takes SIGTERM', async () => {
    const dir = scratch();
    const driver = await connect(await endpoint(dir, { answer: false }), { timeoutMs: 5_000 });
    const child = sleeper('/* ignored */');
    await new Promise((r) => setTimeout(r, 200)); // the handler in place before the signal
    const started = Date.now();
    const stopped = await stopApp({ child, driver }, { graceMs: 300, quitMs: 300 });
    expect(Date.now() - started).toBeLessThan(8_000);
    expect(stopped.overran).toMatchObject({ endedBy: 'SIGKILL' });
    expect(stopped.exit).toEqual({ code: null, signal: 'SIGKILL' });
    expect(stopOverrunMessage('launch', stopped, 'x')).toContain('SIGTERM did not end it within');
  });

  it('stopApp reports nothing overrun for a launch that answers the quit and exits', async () => {
    const dir = scratch();
    const driver = await connect(await endpoint(dir, { answer: true }), { timeoutMs: 5_000 });
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 100);'], { stdio: 'ignore' });
    const stopped = await stopApp({ child, driver }, { graceMs: 5_000, quitMs: 1_000, screenshot: join(dir, 'end.png') });
    expect(stopped).toMatchObject({ overran: null, quitAnswered: true, screenshot: 'taken', exit: { code: 0, signal: null } });
  });

  it('connectOrEnd ends a launch that writes no endpoint, before the failure is thrown, and names what ended it', async () => {
    const dir = scratch();
    const log = join(dir, 'app.log');
    writeFileSync(log, 'booting\nstill booting\n');
    const child = sleeper();
    await new Promise((r) => setTimeout(r, 200));
    const failure = await connectOrEnd(child, join(dir, 'endpoint.json'), log, { timeoutMs: 300, graceMs: 2_000 }).then(() => null, (e: Error) => e);
    expect(failure?.message).toMatch(/wrote no driver endpoint .* within 300 ms; the launch was ended: SIGTERM ended it after \d+ ms\n--- the app's last words ---\nbooting\nstill booting$/);
    // Ended BEFORE the throw: nothing is left holding the proof's event loop open.
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  });
});

describe('R-062: waiting on a condition, and choosing in either chooser kind', () => {
  it('until returns the first accepted value, and at its bound names what it waited for and the last value seen', async () => {
    let n = 0;
    expect(await until(async () => ++n, (v: number) => v === 3, { intervalMs: 5 })).toBe(3);
    await expect(until(async () => 'draft', (v: string) => v === 'done', { timeoutMs: 60, intervalMs: 10, what: 'the store row' }))
      .rejects.toThrow(/^the store row did not hold within 60 ms; last seen "draft"$/);
  });

  it('until stops at its next poll once its signal is aborted', async () => {
    const controller = new AbortController();
    const waiting = until(async () => 'draft', () => false, { timeoutMs: 60_000, intervalMs: 10, what: 'the session settling', signal: controller.signal });
    controller.abort(new Error('the launch was given up'));
    await expect(waiting).rejects.toThrow('the session settling: abandoned (the launch was given up)');
  });

  /** A fake driver over one control: `kind` decides what the page says it is; `shown` is what the select shows, read by read. */
  function fake(kind: 'native' | 'design-system', { shown = [] as (string | null)[], options = ['alpha', 'beta'] } = {}) {
    const calls: string[] = [];
    let reads = 0;
    return {
      calls,
      reads: () => reads,
      driver: {
        waitFor: async (selector: string) => { calls.push(`waitFor ${selector}`); },
        click: async (selector: string) => {
          calls.push(`click ${selector}`);
          const wanted = /data-value="([^"]*)"/.exec(selector)?.[1];
          if (wanted !== undefined && !options.includes(wanted)) throw new Error(`nothing matched ${selector}`);
        },
        eval: async (expression: string) => {
          if (expression.includes('instanceof HTMLSelectElement')) return kind;
          if (expression.includes('dispatchEvent')) return options.some((o) => expression.includes(JSON.stringify(o)) && expression.includes(`o.value === ${JSON.stringify(o)}`)) ? 'dispatched' : 'no such option';
          reads += 1;
          return shown[Math.min(reads - 1, shown.length - 1)] ?? null;
        },
      },
    };
  }

  it('choose waits, on a controlled native select, until the control shows the choice — through its snap-back', async () => {
    const f = fake('native', { shown: ['alpha', 'alpha', 'beta'] });
    expect(await choose(f.driver, '#secret', 'beta', { timeoutMs: 2_000 })).toEqual({ kind: 'native', value: 'beta' });
    expect(f.reads()).toBe(3);
  });

  it('choose refuses a native select that offers no such value, and one that never shows the choice', async () => {
    await expect(choose(fake('native').driver, '#secret', 'gamma', { timeoutMs: 200 })).rejects.toThrow('#secret offers no "gamma"');
    await expect(choose(fake('native', { shown: ['alpha'] }).driver, '#secret', 'beta', { timeoutMs: 200 })).rejects.toThrow(/#secret showing "beta" did not hold within 200 ms; last seen "alpha"/);
  });

  it('choose drives the design system\'s chooser by two clicks, the trigger then the option, and fails when the option never appears', async () => {
    const f = fake('design-system');
    expect(await choose(f.driver, '.wait-header button[aria-label="Change model"]', 'beta')).toEqual({ kind: 'design-system', value: 'beta' });
    expect(f.calls).toEqual([
      'waitFor .wait-header button[aria-label="Change model"]',
      'click .wait-header button[aria-label="Change model"]',
      'click [role="option"][data-value="beta"]',
    ]);
    await expect(choose(fake('design-system').driver, '.chooser', 'gamma')).rejects.toThrow('nothing matched [role="option"][data-value="gamma"]');
  });
});

describe('clickLanded (docs/defects/fixed/driver-proof-clicks-pop-out-at-a-box-the-notice-banner-moves.md)', () => {
  /** A driver whose settled clicks answer in turn: a string is the seam's refusal, anything else its reply. */
  function clicking(answers: unknown[]) {
    const sent: Record<string, unknown>[] = [];
    const driver = {
      click: (selector: string, options: Record<string, unknown>) => {
        sent.push({ selector, ...options });
        const next = answers.shift();
        return typeof next === 'string' ? Promise.reject(new Error(next)) : Promise.resolve(next);
      },
    };
    return { driver, sent };
  }
  const miss = 'the click at (1343, 211) on ".x" with text "Pop out" did not land: the press met div.notice';

  it('asks for the settled click, and presses again only after a press that did not land, saying so', async () => {
    const d = clicking([miss, { x: 1343, y: 308, landed: true }]);
    const reply = await clickLanded(d.driver, '.x', { text: 'Pop out', timeoutMs: 9_000 });
    expect(reply).toEqual({ x: 1343, y: 308, landed: true, missed: [miss] });
    expect(d.sent).toEqual([{ selector: '.x', text: 'Pop out', timeoutMs: 9_000, settle: true }, { selector: '.x', text: 'Pop out', timeoutMs: 9_000, settle: true }]);
  });

  it('throws any other refusal at once, without pressing again', async () => {
    const d = clicking(['".x" matched but did not settle within 15000 ms: last covered by div.notice', { landed: true }]);
    await expect(clickLanded(d.driver, '.x')).rejects.toThrow(/did not settle/);
    expect(d.sent).toHaveLength(1);
  });

  it('gives up after its presses all missed, naming each', async () => {
    const d = clicking([miss, miss, { landed: true }]);
    await expect(clickLanded(d.driver, '.x', { attempts: 2 })).rejects.toThrow(`2 press(es) on ".x" did not land: ${miss} / ${miss}`);
    expect(d.sent).toHaveLength(2);
  });
});
