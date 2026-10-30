import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { err, ok, type Result } from '@rotaris/kernel';
import { audioExtension, TRANSCRIPTION_TIMEOUT_MS, type Transcriber, type TranscriptionRefusal } from './port.js';

/**
 * The local client (OQ-457): the `whisper` command-line program over a model already on this machine.
 *
 * The program downloads any model it does not find, and OQ-457 says nothing is downloaded unasked, so the name is resolved to
 * its file first, an absent file is refused here, and the program is handed that file's path, which it loads without asking
 * the network. A configuration names neither the program nor a path.
 */
export interface WhisperCliDeps {
  readonly env: NodeJS.ProcessEnv;
  readonly home?: string | undefined;
  readonly exists?: ((path: string) => boolean) | undefined;
  readonly spawn?: SpawnPort | undefined;
  readonly timeoutMs?: number | undefined;
}

/** The part of a child process this reads. */
export interface WhisperChild {
  on(event: 'error', listener: (cause: Error) => void): void;
  on(event: 'close', listener: (code: number | null, signal: string | null) => void): void;
  readonly stderr: { on(event: 'data', listener: (chunk: Buffer) => void): void } | null;
  kill(signal: NodeJS.Signals): boolean;
}
export type SpawnPort = (program: string, args: readonly string[], env: NodeJS.ProcessEnv) => WhisperChild;

const defaultSpawn: SpawnPort = (program, args, env) => nodeSpawn(program, [...args], { env, shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });

/** The names the program itself gives another file. */
const MODEL_FILE_NAMES: Readonly<Record<string, string>> = { turbo: 'large-v3-turbo', 'large': 'large-v3' };

/** `<cache>/whisper/<name>.pt`, where the program keeps what it downloaded. */
export function whisperModelFile(name: string, env: NodeJS.ProcessEnv, home: string): string {
  const cache = env['XDG_CACHE_HOME'] !== undefined && env['XDG_CACHE_HOME'] !== '' ? env['XDG_CACHE_HOME'] : join(home, '.cache');
  return join(cache, 'whisper', `${MODEL_FILE_NAMES[name] ?? name}.pt`);
}

/** The program, from `PATH` and then the per-user install directory a desktop launch's `PATH` often lacks; null when neither has it. */
export function findWhisperProgram(env: NodeJS.ProcessEnv, home: string, exists: (path: string) => boolean): string | null {
  const name = process.platform === 'win32' ? 'whisper.exe' : 'whisper';
  const dirs = [...(env['PATH'] ?? '').split(delimiter).filter((d) => d !== ''), join(home, '.local', 'bin')];
  for (const dir of dirs) { const candidate = join(dir, name); if (exists(candidate)) return candidate; }
  return null;
}

/** What the program prints as its result file: `{ "text": … }`. */
export function transcriptOf(json: string): string | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed === 'object' && parsed !== null && typeof (parsed as { text?: unknown }).text === 'string') return (parsed as { text: string }).text.trim();
  } catch { /* the caller reports it */ }
  return null;
}

export function whisperCliTranscriber(modelName: string, deps: WhisperCliDeps): Transcriber {
  const home = deps.home ?? homedir();
  const exists = deps.exists ?? existsSync;
  const spawnPort = deps.spawn ?? defaultSpawn;
  return {
    transcribe: async ({ audio, mimeType, language }) => {
      const model = whisperModelFile(modelName, deps.env, home);
      if (!exists(model)) return err({ code: 'dictation.model-missing', reason: `The dictation model "${modelName}" is not on this machine (${model}). Rotaris downloads nothing by itself: fetch it with the whisper program, or choose another model in Settings › Models.` });
      const program = findWhisperProgram(deps.env, home, exists);
      if (program === null) return err({ code: 'dictation.program-missing', reason: 'The whisper program was not found on PATH or in ~/.local/bin. Install it, or choose an endpoint in Settings › Models.' });
      const dir = mkdtempSync(join(tmpdir(), 'rotaris-dictation-'));
      try {
        const input = join(dir, `recording.${audioExtension(mimeType)}`);
        writeFileSync(input, audio);
        const args = [input, '--model', model, '--output_format', 'json', '--output_dir', dir, '--verbose', 'False', '--fp16', 'False', ...(language === null ? [] : ['--language', language])];
        const ended = await runBounded(spawnPort, program, args, deps.env, deps.timeoutMs ?? TRANSCRIPTION_TIMEOUT_MS);
        if (!ended.ok) return ended;
        const output = join(dir, 'recording.json');
        const text = exists(output) ? transcriptOf(readFileSync(output, 'utf8')) : null;
        return text === null ? err({ code: 'dictation.no-result', reason: 'The whisper program ended without a transcript.' }) : ok(text);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

function runBounded(spawnPort: SpawnPort, program: string, args: readonly string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<Result<void, TranscriptionRefusal>> {
  return new Promise((resolve) => {
    let stderr = '';
    let cut = false;
    let child: WhisperChild;
    try { child = spawnPort(program, args, env); }
    catch (cause) { resolve(err({ code: 'dictation.spawn-failed', reason: `The whisper program could not be started: ${String(cause)}` })); return; }
    const timer = setTimeout(() => { cut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stderr?.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(-800); });
    child.on('error', (cause) => { clearTimeout(timer); resolve(err({ code: 'dictation.spawn-failed', reason: `The whisper program could not be started: ${cause.message}` })); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (cut) { resolve(err({ code: 'dictation.timeout', reason: `The transcription was stopped after ${Math.round(timeoutMs / 60_000)} minutes.` })); return; }
      if (code === 0) { resolve(ok(undefined)); return; }
      resolve(err({ code: 'dictation.program-failed', reason: `The whisper program failed (${signal ?? `exit ${String(code)}`}): ${stderr.trim().split('\n').at(-1) ?? ''}`.trim() }));
    });
  });
}
