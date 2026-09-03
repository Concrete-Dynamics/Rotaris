import { err, ok, type Result } from '@rotaris/kernel';
import { modelError, type ModelClient, type ModelError, type ModelRequest, type StreamPart } from './ports.js';

/**
 * A `ModelClient` that plays a script: one entry per call, in order. Every
 * engine test runs against this with the controlled clock, so a run's every
 * path — a clean answer, a length stop, a transient failure then success, an
 * abort mid-stream — is a script and not a network.
 *
 * `hold` on a part makes the stream wait on a promise the test resolves, so a
 * cancel can be delivered while the model is "still streaming".
 */
export interface ScriptedPart {
  readonly part?: StreamPart;
  readonly error?: ModelError;
  /** Resolve to let the stream continue past this part. */
  readonly hold?: Promise<void>;
}

export interface ScriptedCall {
  readonly parts: readonly ScriptedPart[];
}

export const ABORTED: ModelError = modelError({ code: 'aborted', headline: 'the call was aborted', transient: false });

export class ScriptedModelClient implements ModelClient {
  readonly requests: ModelRequest[] = [];
  private calls: ScriptedCall[];

  constructor(calls: readonly ScriptedCall[]) {
    this.calls = [...calls];
  }

  /** Append a call's script; a stream that finds no script fails as `unknown`. */
  push(call: ScriptedCall): void {
    this.calls.push(call);
  }

  async *stream(req: ModelRequest): AsyncIterable<Result<StreamPart, ModelError>> {
    this.requests.push(req);
    await req.resolveCredential();
    const call = this.calls.shift();
    if (!call) {
      yield err(modelError({ code: 'unknown', headline: 'no scripted call remains', transient: false }));
      return;
    }
    for (const p of call.parts) {
      if (p.hold) {
        await Promise.race([p.hold, abortPromise(req.signal)]);
      }
      if (req.signal.aborted) {
        yield err(ABORTED);
        return;
      }
      if (p.error) {
        yield err(p.error);
        return;
      }
      if (p.part) yield ok(p.part);
    }
  }
}

function abortPromise(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
}

/** A script that answers `text` in `chunks` deltas with `usage`. */
export function answer(text: string, usage = { input: 10, output: 5 }, chunks = 3): ScriptedCall {
  const size = Math.max(1, Math.ceil(text.length / chunks));
  const parts: ScriptedPart[] = [];
  for (let i = 0; i < text.length; i += size) parts.push({ part: { kind: 'text', delta: text.slice(i, i + size) } });
  parts.push({ part: { kind: 'usage', usage } });
  parts.push({ part: { kind: 'finish', reason: 'stop' } });
  return { parts };
}

/** A script that requests tool calls (after optional `text`), finishing `other` as a provider does on a tool step. */
export function toolCalls(calls: readonly { callId: string; name: string; args: Record<string, unknown> | string }[], text = '', usage = { input: 10, output: 5 }): ScriptedCall {
  const parts: ScriptedPart[] = [];
  if (text) parts.push({ part: { kind: 'text', delta: text } });
  for (const c of calls) parts.push({ part: { kind: 'tool-call', callId: c.callId, name: c.name, argsDelta: typeof c.args === 'string' ? c.args : JSON.stringify(c.args) } });
  parts.push({ part: { kind: 'usage', usage } });
  parts.push({ part: { kind: 'finish', reason: 'other' } });
  return { parts };
}
