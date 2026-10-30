import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DICTATION_CONFIG_DEFAULT } from '@rotaris/contracts';
import { endpointTranscriber } from './endpoint.js';
import { audioExtension } from './port.js';
import { transcriberFor } from './select.js';
import { findWhisperProgram, transcriptOf, whisperCliTranscriber, whisperModelFile, type SpawnPort, type WhisperChild } from './whisper-cli.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
/**
 * The name the program has on the platform this suite runs on — not the POSIX spelling, which
 * `findWhisperProgram` seeks as `whisper.exe` under Windows (`process.platform`). The suite is the
 * same on every host; the fixture has to be.
 */
const WHISPER_EXE = process.platform === 'win32' ? 'whisper.exe' : 'whisper';
const scratchHome = (models: readonly string[]): string => {
  const home = mkdtempSync(join(tmpdir(), 'rotaris-dictation-home-'));
  dirs.push(home);
  mkdirSync(join(home, '.cache', 'whisper'), { recursive: true });
  mkdirSync(join(home, '.local', 'bin'), { recursive: true });
  writeFileSync(join(home, '.local', 'bin', WHISPER_EXE), '');
  for (const m of models) writeFileSync(join(home, '.cache', 'whisper', `${m}.pt`), '');
  return home;
};
const request = { audio: new Uint8Array([1, 2, 3]), mimeType: 'audio/webm;codecs=opus', language: null };

/** A child that writes its result as the real program would, then closes. */
function fakeSpawn(act: (args: readonly string[]) => { code: number | null; signal?: string; stderr?: string; hang?: boolean }): { spawn: SpawnPort; calls: (readonly string[])[]; killed: string[] } {
  const calls: (readonly string[])[] = [];
  const killed: string[] = [];
  const spawn: SpawnPort = (_program, args) => {
    calls.push(args);
    const emitter = new EventEmitter();
    const stderr = new EventEmitter();
    const child = { on: (e: string, l: (...a: unknown[]) => void) => { emitter.on(e, l); }, stderr: { on: (e: string, l: (c: Buffer) => void) => { stderr.on(e, l); } }, kill: (s: string) => { killed.push(s); emitter.emit('close', null, s); return true; } } as unknown as WhisperChild;
    const outcome = act(args);
    if (outcome.hang !== true) setImmediate(() => { if (outcome.stderr !== undefined) stderr.emit('data', Buffer.from(outcome.stderr)); emitter.emit('close', outcome.code, outcome.signal ?? null); });
    return child;
  };
  return { spawn, calls, killed };
}
const writesResult = (text: string) => (args: readonly string[]) => { writeFileSync(join(args[args.indexOf('--output_dir') + 1]!, 'recording.json'), JSON.stringify({ text })); return { code: 0 }; };

describe('OQ-457 — the local whisper client', () => {
  it('hands the program the model file itself, so it cannot download one, and reads the transcript back', async () => {
    const home = scratchHome(['small']);
    const fake = fakeSpawn(writesResult(' hello there '));
    const r = await whisperCliTranscriber('small', { env: { PATH: '' }, home, spawn: fake.spawn }).transcribe({ ...request, language: 'de' });
    expect(r).toEqual({ ok: true, value: 'hello there' });
    const args = fake.calls[0]!;
    expect(args[args.indexOf('--model') + 1]).toBe(join(home, '.cache', 'whisper', 'small.pt'));
    expect(args[args.indexOf('--language') + 1]).toBe('de');
    expect(args[0]!.endsWith('recording.webm')).toBe(true);
    expect(existsSync(args[args.indexOf('--output_dir') + 1]!)).toBe(false);
  });

  it('refuses a model that is not on this machine before anything starts', async () => {
    const fake = fakeSpawn(() => ({ code: 0 }));
    const r = await whisperCliTranscriber('tiny', { env: { PATH: '' }, home: scratchHome(['small']), spawn: fake.spawn }).transcribe(request);
    expect(r).toMatchObject({ ok: false, error: { code: 'dictation.model-missing' } });
    expect(!r.ok && r.error.reason).toContain('downloads nothing');
    expect(fake.calls).toEqual([]);
  });

  it('resolves the program\'s own alias, and honours XDG_CACHE_HOME', () => {
    expect(whisperModelFile('turbo', {}, '/h')).toBe(join('/h', '.cache', 'whisper', 'large-v3-turbo.pt'));
    expect(whisperModelFile('small', { XDG_CACHE_HOME: '/c' }, '/h')).toBe(join('/c', 'whisper', 'small.pt'));
  });

  it('finds the program on PATH, then in the per-user directory, and says so when neither has it', async () => {
    const path = `/a${process.platform === 'win32' ? ';' : ':'}/b`;
    expect(findWhisperProgram({ PATH: path }, '/h', (p) => p === join('/b', WHISPER_EXE))).toBe(join('/b', WHISPER_EXE));
    expect(findWhisperProgram({ PATH: '/a' }, '/h', (p) => p === join('/h', '.local', 'bin', WHISPER_EXE))).toBe(join('/h', '.local', 'bin', WHISPER_EXE));
    const home = scratchHome(['small']);
    rmSync(join(home, '.local', 'bin', WHISPER_EXE));
    const r = await whisperCliTranscriber('small', { env: { PATH: '' }, home, spawn: fakeSpawn(() => ({ code: 0 })).spawn }).transcribe(request);
    expect(r).toMatchObject({ ok: false, error: { code: 'dictation.program-missing' } });
  });

  it('reports a failed program with its last line of error, and one that ends with no result', async () => {
    const home = scratchHome(['small']);
    const failed = await whisperCliTranscriber('small', { env: { PATH: '' }, home, spawn: fakeSpawn(() => ({ code: 2, stderr: 'noise\nffmpeg not found\n' })).spawn }).transcribe(request);
    expect(!failed.ok && failed.error.reason).toContain('exit 2): ffmpeg not found');
    const empty = await whisperCliTranscriber('small', { env: { PATH: '' }, home, spawn: fakeSpawn(() => ({ code: 0 })).spawn }).transcribe(request);
    expect(empty).toMatchObject({ ok: false, error: { code: 'dictation.no-result' } });
  });

  it('kills a transcription past its bound and says so', async () => {
    const fake = fakeSpawn(() => ({ code: null, hang: true }));
    const r = await whisperCliTranscriber('small', { env: { PATH: '' }, home: scratchHome(['small']), spawn: fake.spawn, timeoutMs: 5 }).transcribe(request);
    expect(r).toMatchObject({ ok: false, error: { code: 'dictation.timeout' } });
    expect(fake.killed).toEqual(['SIGKILL']);
  });

  it('reads the program\'s result file', () => {
    expect(transcriptOf('{"text":" a "}')).toBe('a');
    expect(transcriptOf('{"segments":[]}')).toBeNull();
    expect(transcriptOf('not json')).toBeNull();
  });

  it('names the file a recorder\'s type implies', () => {
    expect(audioExtension('audio/webm;codecs=opus')).toBe('webm');
    expect(audioExtension('audio/ogg')).toBe('ogg');
    expect(audioExtension('audio/x-unknown')).toBe('audio');
  });
});

describe('OQ-457, OQ-458 — the endpoint client', () => {
  const respond = (status: number, body: unknown) => vi.fn<typeof fetch>(() => Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })));

  it('posts the OpenAI-compatible form to <base_url>/audio/transcriptions with the bearer', async () => {
    const fetchPort = respond(200, { text: ' hallo welt ' });
    const r = await endpointTranscriber({ baseUrl: 'http://127.0.0.1:8000/v1/', model: 'whisper-1', bearer: 'sk-secret', fetch: fetchPort }).transcribe({ ...request, language: 'de' });
    expect(r).toEqual({ ok: true, value: 'hallo welt' });
    const [url, init] = fetchPort.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:8000/v1/audio/transcriptions');
    expect(init?.headers).toEqual({ Authorization: 'Bearer sk-secret' });
    const form = init?.body as FormData;
    expect([form.get('model'), form.get('language'), form.get('response_format')]).toEqual(['whisper-1', 'de', 'json']);
    const file = form.get('file') as File;
    expect([file.name, file.type, file.size]).toEqual(['recording.webm', 'audio/webm', 3]);
  });

  it('sends no authorization header when it names no provider', async () => {
    const fetchPort = respond(200, { text: 'x' });
    await endpointTranscriber({ baseUrl: 'http://h/v1', model: 'm', bearer: null, fetch: fetchPort }).transcribe(request);
    expect(fetchPort.mock.calls[0]![1]?.headers).toEqual({});
  });

  it('never writes the credential into a refusal', async () => {
    const r = await endpointTranscriber({ baseUrl: 'http://h/v1', model: 'm', bearer: 'sk-secret', fetch: respond(401, 'sk-secret rejected') }).transcribe(request);
    expect(r).toMatchObject({ ok: false, error: { code: 'dictation.endpoint-refused' } });
    expect(JSON.stringify(r)).not.toContain('sk-secret');
    const unreachable = await endpointTranscriber({ baseUrl: 'http://h/v1', model: 'm', bearer: 'sk-secret', fetch: () => Promise.reject(new Error('boom sk-secret')) }).transcribe(request);
    expect(unreachable).toMatchObject({ ok: false, error: { code: 'dictation.unreachable' } });
    expect(JSON.stringify(unreachable)).not.toContain('sk-secret');
  });

  it('reads an answer that is no transcript as a refusal', async () => {
    expect(await endpointTranscriber({ baseUrl: 'http://h/v1', model: 'm', bearer: null, fetch: respond(200, 'not json') }).transcribe(request)).toMatchObject({ ok: false, error: { code: 'dictation.no-result' } });
    expect(await endpointTranscriber({ baseUrl: 'http://h/v1', model: 'm', bearer: null, fetch: respond(200, { result: 'x' }) }).transcribe(request)).toMatchObject({ ok: false, error: { code: 'dictation.no-result' } });
  });
});

describe('OQ-457 — the client a configuration names', () => {
  const deps = { env: {}, bearerOf: () => null };
  it('refuses while off, with what to do about it', () => {
    expect(transcriberFor(DICTATION_CONFIG_DEFAULT, deps)).toMatchObject({ ok: false, error: { code: 'dictation.off' } });
  });
  it('asks for what an endpoint still lacks', () => {
    expect(transcriberFor({ ...DICTATION_CONFIG_DEFAULT, backend: 'endpoint', base_url: 'http://h/v1' }, deps)).toMatchObject({ ok: false, error: { code: 'dictation.endpoint-incomplete' } });
    expect(transcriberFor({ ...DICTATION_CONFIG_DEFAULT, backend: 'endpoint', base_url: 'http://h/v1', model: 'm', provider: 'openai' }, deps)).toMatchObject({ ok: false, error: { code: 'dictation.not-signed-in' } });
    expect(transcriberFor({ ...DICTATION_CONFIG_DEFAULT, backend: 'endpoint', base_url: 'http://h/v1', model: 'm' }, deps).ok).toBe(true);
  });
  it('answers with the seam\'s text only when handed one', async () => {
    const seam = transcriberFor(DICTATION_CONFIG_DEFAULT, { ...deps, scripted: 'scripted' });
    expect(seam.ok && await seam.value.transcribe(request)).toEqual({ ok: true, value: 'scripted' });
  });
});
