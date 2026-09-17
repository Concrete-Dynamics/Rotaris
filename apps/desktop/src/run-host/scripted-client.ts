import { millis, ok, type Clocks } from '@rotaris/kernel';
import { type ModelClient, type ModelRequest, type StreamPart } from '@rotaris/model';

/**
 * THE SCRIPTED MODEL CLIENT — verification only, and the reason every proof script in this repository runs
 * without a provider, a key or a network.
 *
 * It answers the shape a real client answers (`ModelClient`) from a STEP LIST read out of the environment:
 * `ROTARIS_SCRIPT` names the orchestrator's steps, comma-separated, one per model call, and
 * `ROTARIS_CHILD_SCRIPT` every child's. `glob`, `read`, `write`, `rm`, `git`, `push`, `edit` request a tool
 * call; `fetch:<url>` a fetch of that URL; `wait:<ms>` holds the call that long ON THE CLOCK PORT and then
 * answers (the Overview proof needs a run longer than one token-sample period); anything else, or the end of
 * the list, answers with a short streamed reply, one delta per 120 ms so the growth tick is visible.
 *
 * Nothing here decides anything about a run: the loop, the permission gate and the store see exactly what they
 * would see from a model that chose the same steps, which is what keeps a proof's assertion about the product
 * rather than about the double.
 *
 * It was two hundred and fifty-seven lines in the middle of the run host's composition root, read past by
 * everyone editing the dispatch and edited by almost no one. Its interface is two dependencies: the clocks it
 * waits on, and the line it writes for a proof to read back.
 */
export function scriptedClient(c: Clocks, log: (message: string) => void): ModelClient {
  const parse = (v: string | undefined) => (v ?? '').split(',').map((x) => x.trim()).filter((x) => x.length > 0);
  // ROTARIS_SCRIPT drives the orchestrator; ROTARIS_CHILD_SCRIPT every child (a `delegate:<persona>:<name>` step delegates).
  const loopScript = /^loop:([^:]+):(\d+)$/.exec(process.env['ROTARIS_SCRIPT'] ?? '');
  const scripts: Record<string, string[]> = { orchestrator: loopScript ? Array.from({ length: Number(loopScript[2]) }, () => loopScript[1]!) : parse(process.env['ROTARIS_SCRIPT']), child: parse(process.env['ROTARIS_CHILD_SCRIPT']) };
  const calls: Record<string, number> = { orchestrator: 0, child: 0, summariser: 0, compressor: 0, 'loop-classifier': 0 };
  let call = 0;
  const TOOL_STEPS: Record<string, { name: string; args: Record<string, unknown> }> = {
    glob: { name: 'glob', args: { pattern: '**/*.md' } },
    read: { name: 'read_file', args: { path: 'README.md' } },
    // Part P: the checkpoint proof edits NOTES.md in a later launch, and the edit tool wants the file read in this process first.
    readnotes: { name: 'read_file', args: { path: 'NOTES.md' } },
    write: { name: 'write_file', args: { operation: 'create', path: 'NOTES.md', content: '# Notes\n\nWritten by the scripted agent through the gate.\n' } },
    edit: { name: 'write_file', args: { operation: 'edit', path: 'NOTES.md', old_string: 'scripted agent', new_string: 'scripted agent (edited)' } },
    rm: { name: 'terminal', args: { command: 'rm -rf build' } },
    git: { name: 'terminal', args: { command: 'git status' } },
    push: { name: 'terminal', args: { command: 'git push origin main' } },
    todo: { name: 'todo', args: { operation: 'add_phase', name: 'main' } },
  };
  return {
    async *stream(req: ModelRequest) {
      await req.resolveCredential();
      const system = req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '';
      const who = /^You are the orchestrator/.test(system) ? 'orchestrator' : /summarise a finished agent transcript/i.test(system) ? 'summariser' : /^You condense an agent conversation/.test(system) ? 'compressor' : /^You classify a user request/.test(system) ? 'classifier' : /^You classify an agent conversation/.test(system) ? 'loop-classifier' : 'child';
      call += 1;
      // Part S: every child instance follows the child script from its own first call (keyed by its TASK line), so a fan-out of
      // three children each takes the same steps; a single child reads exactly as before.
      const firstUser = req.messages.find((m) => m.role === 'user')?.content.find((p) => p.kind === 'text');
      const taskName = who === 'child' && firstUser && firstUser.kind === 'text' ? /TASK: ([^\n]+)/.exec(firstUser.text)?.[1] ?? '' : '';
      const counterKey = who === 'child' ? `child:${taskName}` : who;
      calls[counterKey] = (calls[counterKey] ?? 0) + 1;
      calls[who] = calls[counterKey]!;
      // Verification only: the model each call went to, so a proof can read a fallback or an override from the log (Part Q).
      log(`scripted model call: ${req.model.providerId}/${req.model.modelId} (${who})`);
      if (who === 'classifier') {
        // ROTARIS_INTENT_SCRIPT: <category> | garbage | timeout | reject (the two JSON rungs refused, then text) — verification only.
        const want = (process.env['ROTARIS_INTENT_SCRIPT'] ?? 'moderate_feature').trim();
        if (want === 'timeout') { await new Promise<void>((resolve) => req.signal.addEventListener('abort', () => resolve(), { once: true })); yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } }; return; }
        if (want === 'reject' && req.output !== undefined) { yield { ok: false as const, error: { code: 'http' as const, headline: 'response_format is not supported by this model', status: 400, transient: false } }; return; }
        const text = want === 'garbage' ? 'lol no' : want === 'reject' ? 'small_feature\nfrom the text rung' : req.output === undefined ? `${want}\nscripted` : JSON.stringify({ intent: want, confidence: 0.75, reason: 'scripted classification' });
        yield ok<StreamPart>({ kind: 'text', delta: text });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 12, output: 8 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
        return;
      }
      if (who === 'loop-classifier') {
        const want = (process.env['ROTARIS_LOOP_SCRIPT'] ?? 'detected').trim();
        if (want === 'timeout') { await new Promise<void>((resolve) => req.signal.addEventListener('abort', () => resolve(), { once: true })); yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } }; return; }
        const loop_detected = want !== 'clear';
        yield ok<StreamPart>({ kind: 'text', delta: JSON.stringify({ loop_detected, reason: loop_detected ? 'scripted repeated work' : 'scripted progress', corrective_message: 'Pause and reassess the current path. Choose a different concrete approach and verify its viability first.' }) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 12, output: 12 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
        return;
      }
      if (who === 'compressor') {
        // ROTARIS_COMPRESSOR_SCRIPT=fail — the compressing pass itself failing, so REQ-ORCH-093's "the original
        // rejection is surfaced unchanged" has a producer. Verification only.
        // Part AO: `fail-if:<text>` fails only the pass whose compressible slice mentions the text — one agent of a
        // concurrent manual pass, so REQ-MONITOR-094's per-agent listing has a producer while the others succeed.
        const compressorScript = (process.env['ROTARIS_COMPRESSOR_SCRIPT'] ?? '').trim();
        const failIf = /^fail-if:(.+)$/.exec(compressorScript);
        const slice = req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
        if (compressorScript === 'fail' || (failIf !== null && slice.includes(failIf[1]!))) {
          yield { ok: false as const, error: { code: 'http' as const, headline: 'scripted compressor failure (HTTP 500)', status: 500, transient: false } };
          return;
        }
        // Part AH: the compressing pass's scripted answer. It states the three things REQ-MONITOR-082 asks for,
        // so the proof can assert the summary reached the rebuilt conversation rather than a placeholder.
        yield ok<StreamPart>({ kind: 'text', delta: ['Work performed: the scripted agent read the repository and wrote NOTES.md.', 'Findings reached: the transcript renderer draws one row per event.', 'Questions left open: none.'].join(String.fromCharCode(10)) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 40, output: 24 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
        return;
      }
      if (who === 'summariser') {
        yield ok<StreamPart>({ kind: 'text', delta: JSON.stringify({ summary: 'The child carried out its task (scripted summary).', key_findings: ['scripted'], tags: ['implementation'] }) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 20, output: 10 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
        return;
      }
      let step = scripts[who]?.[(calls[who] ?? 1) - 1] ?? 'answer';
      const wait = /^wait:(\d+)$/.exec(step);
      if (wait) {
        // The wait is a prefix on this call, not a call of its own: the step after it answers in the same call.
        await new Promise<void>((resolve) => { const t = c.timers.after(millis(Number(wait[1])), resolve); req.signal.addEventListener('abort', () => { t.cancel(); resolve(); }, { once: true }); });
        if (req.signal.aborted) { yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } }; return; }
        scripts[who]?.splice((calls[who] ?? 1) - 1, 1);
        step = scripts[who]?.[(calls[who] ?? 1) - 1] ?? 'answer';
      }
      if (step === 'fail') {
        yield { ok: false as const, error: { code: 'http' as const, headline: 'scripted failure (HTTP 400)', status: 400, transient: false } };
        return;
      }
      if (step === 'fail:context') {
        // Part AH (REQ-ORCH-093): the context-window rejection, in one of the eight phrasings `classifyFailure` knows.
        yield { ok: false as const, error: { code: 'http' as const, headline: 'scripted rejection: prompt is too long', status: 400, providerMessage: 'The maximum context length of this model is 8192 tokens; reduce the length of the messages.', transient: false } };
        return;
      }
      // Part Q's fault steps (REQ-ORCH-088/090/091/092): `fail:429[:retry-after=<s>]`, `fail:quota`, `fail:503`, `fail:401`;
      // tokens:<n> — Part AH: a step that REPORTS n prompt tokens and then calls a tool so the turn goes round
      // again. REQ-MONITOR-081 prefers the provider's own figure, so this is how a scripted run crosses the
      // automatic threshold without composing a genuinely enormous conversation. Verification only.
      const tokenStep = /^tokens:(\d+)$/.exec(step);
      if (tokenStep) {
        yield ok<StreamPart>({ kind: 'text', delta: 'Working, with a large reported prompt. ' });
        if ((req.tools ?? []).some((t) => t.name === 'glob')) yield ok<StreamPart>({ kind: 'tool-call', callId: `call-${call}`, name: 'glob', argsDelta: JSON.stringify({ pattern: '**/*.md' }) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: Number(tokenStep[1]), output: 12 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'other' });
        return;
      }
      // `hang` streams nothing until the caller aborts (the unresponsive-model timer or the child timeout).
      const fault = /^fail:(429|quota|503|401)(?::retry-after=(\d+))?$/.exec(step);
      if (fault) {
        const retry = fault[2] === undefined ? {} : { retryAfterMs: Number(fault[2]) * 1000, retryAfter: fault[2] };
        const error = fault[1] === '429' ? { code: 'http' as const, status: 429, headline: 'scripted rate limit (HTTP 429)', providerMessage: 'Too Many Requests', transient: false, ...retry }
          : fault[1] === 'quota' ? { code: 'http' as const, status: 429, headline: 'scripted quota exhaustion (HTTP 429)', providerMessage: '{"error":{"code":"insufficient_quota","message":"You exceeded your current quota, please check your plan and billing details."}}', transient: false }
            : fault[1] === '503' ? { code: 'http' as const, status: 503, headline: 'scripted service unavailable (HTTP 503)', providerMessage: 'Service Unavailable', transient: true }
              : { code: 'http' as const, status: 401, headline: 'scripted authentication failure (HTTP 401)', providerMessage: 'Incorrect API key provided', transient: false };
        yield { ok: false as const, error };
        return;
      }
      // Part Z (REQ-CHAT-163/062): `think` streams deliberation on the reasoning channel before the answer, so the
      // streamed-reasoning ROW has a producer in a scripted run. The three provider SHAPES that carry deliberation
      // are normalised inside the AI SDK client and are proven there; this proves what the engine does with one.
      if (step === 'think') {
        yield ok<StreamPart>({ kind: 'reasoning', delta: 'Weighing the request. ' });
        yield ok<StreamPart>({ kind: 'reasoning', delta: 'Two options remain, and the second is cheaper.' });
        yield ok<StreamPart>({ kind: 'text', delta: 'The scripted answer, after deliberating.' });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 18, output: 9 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
        return;
      }
      if (step === 'hang') {
        await new Promise<void>((resolve) => { if (req.signal.aborted) resolve(); else req.signal.addEventListener('abort', () => resolve(), { once: true }); });
        yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } };
        return;
      }
      // delegate:<persona>:<name>[:after] — `after` depends on the last task id a tool result reported.
      const delegate = /^delegate:([a-z-]+):([^:]+)(:after)?$/.exec(step);
      if (delegate && (req.tools ?? []).some((t) => t.name === 'delegate')) {
        const lastId = delegate[3] ? [...req.messages].reverse().flatMap((m) => [...m.content] as { kind: string; result?: string }[]).map((p) => (p.kind === 'tool-result' && p.result ? /task_id: (bg_[0-9a-f]{8})/.exec(p.result)?.[1] : undefined)).find((x) => x !== undefined) : undefined;
        yield ok<StreamPart>({ kind: 'text', delta: `Delegating to ${delegate[1]}. ` });
        yield ok<StreamPart>({ kind: 'tool-call', callId: `call-${call}`, name: 'delegate', argsDelta: JSON.stringify({ persona: delegate[1], task_name: delegate[2], task: `TASK: ${delegate[2]}\nEXPECTED OUTCOME: done\nMUST DO: use your tools\nMUST NOT DO: nothing else\nCONTEXT: scripted`, ...(lastId ? { depends_on: [lastId] } : {}) }) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'other' });
        return;
      }
      // artifact:<tool>[:<key>] — Part Y's proof: one of the three artifact tools, with arguments taken from
      // ROTARIS_SCRIPT_ARTIFACT_ARGS by key (a JSON map) or the defaults below. Verification only.
      const artifactStep = /^artifact:(artifact_write|artifact_read|artifact_list)(?::([\w-]+))?$/.exec(step);
      if (artifactStep) {
        const toolName = artifactStep[1]!;
        if ((req.tools ?? []).some((t) => t.name === toolName)) {
          let scripted: Record<string, unknown> = {};
          try { scripted = JSON.parse(process.env['ROTARIS_SCRIPT_ARTIFACT_ARGS'] ?? '{}') as Record<string, unknown>; } catch { scripted = {}; }
          const key = artifactStep[2] ?? toolName;
          const fallback = toolName === 'artifact_write'
            ? { slug: 'scripted-plan', title: 'The scripted plan', body: 'The first line of the scripted body.\n\nA second paragraph with `code` and **bold**.', tags: ['research'] }
            : toolName === 'artifact_read' ? { id_or_slug: 'scripted-plan' } : {};
          const args = key in scripted ? scripted[key] : fallback;
          yield ok<StreamPart>({ kind: 'text', delta: `Calling ${toolName}. ` });
          yield ok<StreamPart>({ kind: 'tool-call', callId: `call-${call}`, name: toolName, argsDelta: JSON.stringify(args) });
          yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
          yield ok<StreamPart>({ kind: 'finish', reason: 'other' });
          return;
        }
        log(`scripted: the step ${step} names no callable tool (the listing holds ${(req.tools ?? []).map((t) => t.name).join(', ')}); answering instead`);
      }
      // terminal:<key> — PD-LIBRARY-001's proof: one `terminal` call, with the arguments taken from
      // ROTARIS_SCRIPT_TERMINAL_ARGS by key (a JSON map) or the `git status` default below. Verification only,
      // in the shape of the artifact and MCP argument maps above: the proof needs a child that runs ordered
      // terminal commands whose exit statuses the command ledger can record, and the scripted dialect had no
      // deterministic terminal step.
      const terminalStep = /^terminal:([\w-]+)$/.exec(step);
      if (terminalStep) {
        if ((req.tools ?? []).some((t) => t.name === 'terminal')) {
          let scripted: Record<string, unknown> = {};
          try { scripted = JSON.parse(process.env['ROTARIS_SCRIPT_TERMINAL_ARGS'] ?? '{}') as Record<string, unknown>; } catch { scripted = {}; }
          const key = terminalStep[1]!;
          const args = key in scripted ? scripted[key] : { command: 'git status' };
          yield ok<StreamPart>({ kind: 'text', delta: `Running the terminal command for ${key}. ` });
          yield ok<StreamPart>({ kind: 'tool-call', callId: `call-${call}`, name: 'terminal', argsDelta: JSON.stringify(args) });
          yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
          yield ok<StreamPart>({ kind: 'finish', reason: 'other' });
          return;
        }
        log(`scripted: the step ${step} names no callable tool (the listing holds ${(req.tools ?? []).map((t) => t.name).join(', ')}); answering instead`);
      }
      // ask[:<key>] — Part AC's step: one `ask_questions` call, with the steps taken from ROTARIS_SCRIPT_QUESTIONS by
      // key (a JSON map) or the two-step default below. Verification only.
      const askStep = /^ask(?::([\w-]+))?$/.exec(step);
      if (askStep) {
        if ((req.tools ?? []).some((t) => t.name === 'ask_questions')) {
          let scripted: Record<string, unknown> = {};
          try { scripted = JSON.parse(process.env['ROTARIS_SCRIPT_QUESTIONS'] ?? '{}') as Record<string, unknown>; } catch { scripted = {}; }
          const key = askStep[1] ?? 'ask';
          const fallback = {
            steps: [
              { id: 'scope', title: 'Which scope should this change cover?', description: 'Pick the narrowest that still solves the problem.', options: [{ label: 'This file only' }, { label: 'The whole package', description: 'Slower, but consistent.' }] },
              { id: 'notes', title: 'Anything else the agent should know?', options: [], allow_freeform: true },
            ],
          };
          const args = key in scripted ? scripted[key] : fallback;
          yield ok<StreamPart>({ kind: 'text', delta: 'Asking the user. ' });
          yield ok<StreamPart>({ kind: 'tool-call', callId: `call-${call}`, name: 'ask_questions', argsDelta: JSON.stringify(args) });
          yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
          yield ok<StreamPart>({ kind: 'finish', reason: 'other' });
          return;
        }
        log(`scripted: the step ${step} names no callable tool (the listing holds ${(req.tools ?? []).map((t) => t.name).join(', ')}); answering instead`);
      }
      // mcp:<server>.<tool> — the MCP proof's step: the callable name after `.` (a renamed tool by its replacement name); fixed arguments per tool.
      const mcpStep = /^mcp:([^.]+)\.(.+)$/.exec(step);
      if (mcpStep) {
        const toolName = mcpStep[2]!;
        if ((req.tools ?? []).some((t) => t.name === toolName)) {
          // ROTARIS_SCRIPT_MCP_ARGS: a JSON map from callable name to the arguments the scripted agent sends (Part T's proof; verification only).
          let scripted: Record<string, unknown> = {};
          try { scripted = JSON.parse(process.env['ROTARIS_SCRIPT_MCP_ARGS'] ?? '{}') as Record<string, unknown>; } catch { scripted = {}; }
          const args = toolName in scripted ? scripted[toolName] : toolName === 'echo' ? { text: 'hello from the scripted agent' } : toolName === 'slow' ? { ms: 4_000 } : {};
          yield ok<StreamPart>({ kind: 'text', delta: `Calling ${toolName} on ${mcpStep[1]}. ` });
          yield ok<StreamPart>({ kind: 'tool-call', callId: `call-${call}`, name: toolName, argsDelta: JSON.stringify(args) });
          yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
          yield ok<StreamPart>({ kind: 'finish', reason: 'other' });
          return;
        }
        log(`scripted: the step ${step} names no callable tool (the listing holds ${(req.tools ?? []).map((t) => t.name).join(', ')}); answering instead`);
      }
      // fetch:<url> — everything after the first `fetch:` is the URL (the fetch proof's step).
      const tool = step.startsWith('fetch:') ? { name: 'fetch', args: { url: step.slice('fetch:'.length) } } : TOOL_STEPS[step];
      if (tool && (req.tools ?? []).some((t) => t.name === tool.name)) {
        yield ok<StreamPart>({ kind: 'text', delta: `Calling ${tool.name}. ` });
        yield ok<StreamPart>({ kind: 'tool-call', callId: `call-${call}`, name: tool.name, argsDelta: JSON.stringify(tool.args) });
        yield ok<StreamPart>({ kind: 'usage', usage: { input: 30, output: 12 } });
        yield ok<StreamPart>({ kind: 'finish', reason: 'other' });
        return;
      }
      const last = req.messages.filter((m) => m.role === 'tool').at(-1)?.content[0];
      const seen = last && last.kind === 'tool-result' ? ` The last tool said: "${last.result.slice(0, 60).replace(/\s+/g, ' ')}".` : '';
      const first = req.messages.find((m) => m.role === 'user')?.content.find((p) => p.kind === 'text');
      const task = first && first.kind === 'text' ? first.text : '';
      const words = `I read your request — "${task.slice(0, 60)}" — and this is the scripted reply from the run loop.${seen}`.split(' ');
      for (const w of words) {
        if (req.signal.aborted) { yield { ok: false as const, error: { code: 'aborted' as const, headline: 'aborted', transient: false } }; return; }
        await new Promise<void>((resolve) => c.timers.after(millis(120), resolve));
        yield ok<StreamPart>({ kind: 'text', delta: `${w} ` });
      }
      yield ok<StreamPart>({ kind: 'usage', usage: { input: 24, output: words.length } });
      yield ok<StreamPart>({ kind: 'finish', reason: 'stop' });
    },
  };
}
