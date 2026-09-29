// @ts-check
/**
 * A raw JSON-RPC client over a child process's standard streams, one message per line — what `code-intel-proof`
 * speaks to the reserved token's branch (ADR-0035 c.1, REQ-MCP-033) before any product code is between them.
 *
 * It exists as a module for one property the inline client lacked: **a request never outlives the child.** Every
 * pending request rejects when the child exits (once its standard output has closed, or a short grace after the exit
 * when a grandchild keeps the pipe open), when the child fails to start or errors, and when the guard timer kills it —
 * each with the exit status and the tail of the child's standard error in the message. A request sent after any of
 * those rejects at once. So a branch that dies, or never becomes the server, fails the proof in seconds with its own
 * reason instead of leaving `await send('initialize', …)` pending for ever
 * (`docs/defects/fixed/code-intel-proofs-branch-client-waits-forever-on-a-child-that-has-exited.md`).
 *
 * It also records what the proof asserts about standard output: the bytes before the first `{` (Electron's CR LF is
 * the one tolerated preamble), the lines that are not JSON, and when the first byte arrived. `exited` resolves with the
 * child's exit however early it happened — the listener is attached when the client is made, so an exit that came
 * before anyone awaited it is not missed.
 *
 * Nothing here is product code. It runs only from the proofs, and its time is the harness's wall clock.
 */

/** How much of the child's standard error a rejection carries: its last characters, enough for a stack or a runtime's refusal. */
export const STDERR_TAIL_CHARS = 2_000;

/**
 * The last `max` characters of a child's standard error, trimmed, or a statement that it wrote none.
 * @param {string} stderr
 * @param {number} [max]
 */
export function stderrTail(stderr, max = STDERR_TAIL_CHARS) {
  const t = stderr.trim();
  if (t === '') return 'standard error was empty';
  return t.length > max ? `standard error (last ${max} of ${t.length} characters): …${t.slice(-max)}` : `standard error: ${t}`;
}

/**
 * @typedef {{ code: number | null, signal: string | null, atMs: number }} ChildExit
 * @typedef {{
 *   stdin: import('node:stream').Writable,
 *   stdout: import('node:stream').Readable,
 *   stderr: import('node:stream').Readable,
 *   kill: (signal?: NodeJS.Signals | number) => boolean,
 *   exitCode: number | null,
 *   signalCode: string | null,
 *   on: (event: string, listener: (...args: any[]) => void) => unknown,
 * }} ChildLike
 */

/**
 * Wraps a spawned child speaking line-delimited JSON-RPC on stdin/stdout.
 * @param {ChildLike} child
 * @param {{ guardMs?: number | null, exitGraceMs?: number, now?: () => number, t0?: number }} [options]
 *   `guardMs`: kill the child and reject every pending request after this long (null: no guard).
 *   `exitGraceMs`: after the exit, how long to wait for standard output to close before the pending requests reject,
 *   so an answer written just before the exit is still read.
 */
export function lineRpcClient(child, { guardMs = null, exitGraceMs = 1_000, now = Date.now, t0 = now() } = {}) {
  /** @type {Map<number, { method: string, res: (v: any) => void, rej: (e: Error) => void }>} */
  const pending = new Map();
  let nextId = 0;
  let stderr = '';
  let out = Buffer.alloc(0);
  /** @type {string | null} */ let preamble = null;
  /** @type {number | null} */ let firstByteAt = null;
  /** @type {string[]} */ const nonJson = [];
  let lateAnswers = 0;
  /** Set once: why no request can be answered any more. */
  /** @type {string | null} */ let ended = null;
  /** @type {ChildExit | null} */ let exit = null;
  /** @type {string | null} */ let stdinError = null;
  /** @type {(e: ChildExit) => void} */ let resolveExited = () => {};
  /** @type {Promise<ChildExit>} */
  const exited = new Promise((res) => { resolveExited = res; });

  const describeExit = () => (exit ? `exited with ${exit.signal ? `signal ${exit.signal}` : `code ${exit.code}`} at ${exit.atMs} ms` : 'has not exited');

  /** @param {string} reason */
  const end = (reason) => {
    if (ended !== null) return;
    ended = reason;
    const tail = stderrTail(stderr);
    for (const [id, p] of pending) p.rej(new Error(`${p.method} (#${id}) got no answer: ${reason}${stdinError ? `; writing to it failed: ${stdinError}` : ''}; ${tail}`));
    pending.clear();
  };

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (/** @type {string} */ d) => { stderr += d; });
  // A child that died leaves stdin a broken pipe: the write's error is part of the reason, never an unhandled event.
  child.stdin.on('error', (/** @type {Error} */ e) => { stdinError ??= e.message; });

  child.stdout.on('data', (/** @type {Buffer} */ d) => {
    if (firstByteAt === null) firstByteAt = now() - t0;
    out = Buffer.concat([out, d]);
    for (;;) {
      const nl = out.indexOf(10);
      if (nl === -1) return;
      const text = out.subarray(0, nl).toString('utf8');
      out = out.subarray(nl + 1);
      // The preamble is the first line up to its first `{` — or, when that line has none, the whole line and its LF
      // (Electron's CR LF reads `0d0a`). Read exactly as the inline client read it.
      if (preamble === null) {
        const b = text.indexOf('{');
        if (b === -1) { preamble = text + '\n'; continue; }
        preamble = text.slice(0, b);
      }
      if (text.trim() === '') continue;
      let m;
      try { m = JSON.parse(text); } catch { nonJson.push(text.slice(0, 200)); continue; }
      if (m.id === undefined || m.id === null) continue;
      const p = pending.get(m.id);
      if (!p) { lateAnswers += 1; continue; }
      pending.delete(m.id);
      if (m.error) p.rej(new Error(`${p.method} (#${m.id}) answered with an error: ${JSON.stringify(m.error)}`));
      else p.res(m.result);
    }
  });

  /** @type {ReturnType<typeof setTimeout> | null} */ let grace = null;
  const onExit = (/** @type {number | null} */ code, /** @type {string | null} */ signal) => {
    if (exit) return;
    exit = { code, signal, atMs: now() - t0 };
    resolveExited(exit);
    if (grace === null) grace = setTimeout(() => end(`the child ${describeExit()} before answering`), exitGraceMs);
  };
  child.on('exit', onExit);
  child.on('close', (/** @type {number | null} */ code, /** @type {string | null} */ signal) => {
    onExit(code, signal);
    if (grace) clearTimeout(grace);
    end(`the child ${describeExit()} before answering`);
  });
  child.on('error', (/** @type {Error} */ e) => {
    end(`the child failed: ${e.message}`);
    // A child that never started emits no exit; `exited` must still settle.
    if (!exit && child.exitCode === null && child.signalCode === null) { exit = { code: null, signal: null, atMs: now() - t0 }; resolveExited(exit); }
  });
  // Spawned and already gone before this client was made: the events are past, the codes are not.
  if (child.exitCode !== null || child.signalCode !== null) onExit(child.exitCode, child.signalCode);

  /** @type {ReturnType<typeof setTimeout> | null} */
  const guard = guardMs === null ? null : setTimeout(() => {
    child.kill();
    end(`the guard killed the child after ${guardMs} ms (it ${describeExit()})`);
  }, guardMs);

  /** @param {object} message */
  const write = (message) => { child.stdin.write(`${JSON.stringify(message)}\n`); };

  return {
    /**
     * One request; resolves with its result, rejects with its error, or with why the child can no longer answer.
     * @param {string} method
     * @param {unknown} [params]
     * @returns {Promise<any>}
     */
    send(method, params) {
      const id = ++nextId;
      if (ended !== null) return Promise.reject(new Error(`${method} (#${id}) was not sent: ${ended}; ${stderrTail(stderr)}`));
      return new Promise((res, rej) => {
        pending.set(id, { method, res, rej });
        try { write({ jsonrpc: '2.0', id, method, params }); } catch (e) { stdinError ??= String(/** @type {Error} */ (e).message ?? e); }
      });
    },
    /** A notification: no id, no answer. @param {string} method @param {unknown} [params] */
    notify(method, params) {
      if (ended !== null) return;
      try { write({ jsonrpc: '2.0', method, params }); } catch (e) { stdinError ??= String(/** @type {Error} */ (e).message ?? e); }
    },
    /** Ends the child's standard input (the server's cue to exit) and stops the guard. */
    close() {
      if (guard) clearTimeout(guard);
      try { child.stdin.end(); } catch { /* already closed */ }
    },
    /** Stops the guard without touching the child. */
    disarm() { if (guard) clearTimeout(guard); },
    /** Resolves with the child's exit, whenever it happened. */
    exited,
    /** What the proof reads off standard output and standard error. */
    get stderr() { return stderr; },
    get preamble() { return preamble; },
    get firstByteAt() { return firstByteAt; },
    get nonJsonLines() { return nonJson; },
    /** Answers that arrived for a request no longer pending (after the guard, or never sent). */
    get lateAnswers() { return lateAnswers; },
    /** Why requests can no longer be answered, or null while they can. */
    get ended() { return ended; },
    get pendingCount() { return pending.size; },
  };
}
