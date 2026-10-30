/**
 * The dictation proof (OQ-455..459): the composer's microphone in the built application, against a scratch profile.
 *
 * Chromium's fake device stands in for a microphone, so `getUserMedia`, the permission handlers, `MediaRecorder`, the command and
 * main's choice of client are the product's own; `ROTARIS_DICTATION_SCRIPT` stands in for the transcriber, so no model is needed
 * and the text is known. Whether whisper itself transcribes is `dictation.test.ts`'s port and a demo's, not this proof's.
 *
 *   off        the default: the control refuses, naming the setting, in its tooltip and its accessible description
 *   grants     a secure page on `file:`; audio granted; video and notifications refused; the clipboard write the copy buttons use kept
 *   dictate    idle → recording → idle: text at the caret between what was typed, the composer focused, no run started, the draft kept
 *   missing    a local model absent from this machine: the specific refusal, the composer's text untouched, nothing started
 *
 * Evidence under `.proof/dictation-proof/`. `--skip-build` skips the build.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDesktop, evidenceDirectory } from './lib/harness.mjs';
import { startApp, stopApp, until } from './lib/driver.mjs';

const output = evidenceDirectory('dictation-proof');
rmSync(output, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
mkdirSync(output, { recursive: true });
if (!process.argv.includes('--skip-build')) buildDesktop(output);

const FAKE_DEVICE = ['--use-fake-device-for-media-stream'];
const TRANSCRIPT = 'scripted transcript';
const results = {};
const expect = (condition, message) => { if (!condition) throw new Error(message); };

function scratchWorkspace(name, dictation) {
  const root = mkdtempSync(join(tmpdir(), `rotaris-dictation-proof-${name}-`));
  mkdirSync(join(root, '.rotaris'), { recursive: true });
  writeFileSync(join(root, '.rotaris', 'agents.yaml'), [
    'models:', '  scripted: { provider: scripted, model_id: scripted, max_input_tokens: 100000 }',
    'small_model: scripted', 'medium_model: scripted', 'large_model: scripted', 'default_persona: orchestrator',
    'mcp_servers:', '  code_intelligence: { enabled: false }',
    'initialization:', '  completed: []', '  skipped: [code-intelligence-setup]', "  last_run: '2026-09-29T00:00:00.000Z'",
    ...dictation, '',
  ].join('\n'));
  return root;
}

const READ = `(() => {
  const b = document.querySelector('[data-testid=composer-dictate]');
  const c = document.querySelector('textarea.composer__input');
  const described = document.getElementById(b.getAttribute('aria-describedby'));
  const e = document.querySelector('.composer__error');
  return { phase: b.dataset.dictation, name: b.getAttribute('aria-label'), disabled: b.disabled, title: b.title, description: described && described.textContent,
    status: document.querySelector('[data-testid=dictation-status]').textContent, text: c.value, caret: c.selectionStart, focused: document.activeElement === c, error: e && e.textContent,
    rows: document.querySelectorAll('[data-testid=transcript-row], .row').length };
})()`;

async function scenario(name, { dictation, extra = {}, electronArgs = FAKE_DEVICE }, body) {
  const workspace = scratchWorkspace(name, dictation);
  const root = join(output, name);
  const started = await startApp({ root, workspace, extra, electronArgs });
  const { driver } = started;
  try {
    await until(() => driver.eval(`[...document.querySelectorAll('.nav-item')].length`), (n) => n > 0, { what: 'the shell', timeoutMs: 30_000 });
    await driver.click('.nav-item', { text: 'Workspace' });
    await driver.waitFor('[data-testid=composer-dictate]', { timeout: 15_000 });
    const read = () => driver.eval(READ);
    results[name] = await body(driver, read);
    await driver.screenshot(join(output, `${name}.png`));
  } finally {
    await stopApp(started);
    rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

await scenario('off', { dictation: [] }, async (_driver, read) => {
  const s = await read();
  expect(s.disabled, 'the control should be disabled while the backend is off');
  expect(s.title.includes('Settings › Models'), `the tooltip should name the setting: ${s.title}`);
  expect(s.description === s.title, `the accessible description should carry the reason: ${s.description}`);
  return s;
});

await scenario('grants', { dictation: ['dictation:', '  backend: local'] }, async (driver) => {
  const answer = (expression) => driver.eval(`Promise.resolve().then(() => ${expression}).then((v) => String(v), (e) => e.name)`);
  const out = {
    secure: await driver.eval('isSecureContext'), protocol: await driver.eval('location.protocol'),
    audio: await answer(`navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => { s.getTracks().forEach((t) => t.stop()); return 'granted'; })`),
    video: await answer(`navigator.mediaDevices.getUserMedia({ video: true }).then(() => 'granted')`),
    notifications: await answer('Notification.requestPermission()'),
    clipboard: await answer(`navigator.clipboard.writeText('dictation-proof').then(() => 'granted')`),
  };
  expect(out.secure === true && out.protocol === 'file:', `the built page should be a secure context on file: ${JSON.stringify(out)}`);
  expect(out.audio === 'granted', `audio should be granted: ${out.audio}`);
  expect(out.video === 'NotAllowedError', `video should be refused: ${out.video}`);
  expect(out.notifications === 'denied', `notifications should be refused: ${out.notifications}`);
  expect(out.clipboard === 'granted', `the clipboard write should be kept: ${out.clipboard}`);
  return out;
});

await scenario('dictate', { dictation: ['dictation:', '  backend: local'], extra: { ROTARIS_DICTATION_SCRIPT: TRANSCRIPT } }, async (driver, read) => {
  await driver.click('textarea.composer__input');
  await driver.type('before after');
  await driver.eval(`(() => { const c = document.querySelector('textarea.composer__input'); c.setSelectionRange(7, 7); })()`);
  const idle = await read();
  expect(!idle.disabled && idle.name === 'Dictate', `the control should be ready: ${JSON.stringify(idle)}`);
  await driver.click('[data-testid=composer-dictate]');
  const recording = await until(read, (s) => s.phase === 'recording', { what: 'recording', timeoutMs: 10_000 });
  expect(recording.name === 'Stop dictating' && recording.status === 'Recording.' && !recording.disabled, `recording should be stated and stoppable: ${JSON.stringify(recording)}`);
  await driver.eval('new Promise((r) => setTimeout(r, 800))');
  await driver.click('[data-testid=composer-dictate]');
  const done = await until(read, (s) => s.phase === 'idle' && s.text !== idle.text, { what: 'the transcript', timeoutMs: 10_000 });
  expect(done.text === `before ${TRANSCRIPT} after`, `the transcript should land at the caret: ${done.text}`);
  expect(done.focused && done.caret === `before ${TRANSCRIPT}`.length, `the composer should hold focus after the text: ${JSON.stringify(done)}`);
  expect(done.error === null, `no error should stand: ${done.error}`);
  expect(done.rows === 0, `the microphone must not submit: ${done.rows} rows`);
  return { idle, recording, done };
});

await scenario('missing', { dictation: ['dictation:', '  backend: local', '  local_model: proof-absent-model'] }, async (driver, read) => {
  await driver.click('textarea.composer__input');
  await driver.type('kept');
  await driver.click('[data-testid=composer-dictate]');
  await until(read, (s) => s.phase === 'recording', { what: 'recording', timeoutMs: 10_000 });
  await driver.eval('new Promise((r) => setTimeout(r, 500))');
  await driver.click('[data-testid=composer-dictate]');
  const s = await until(read, (r) => r.phase === 'idle' && r.error !== null, { what: 'the refusal', timeoutMs: 10_000 });
  expect(s.error.includes('proof-absent-model') && s.error.includes('downloads nothing'), `the refusal should be specific: ${s.error}`);
  expect(s.text === 'kept', `the composer's text should be untouched: ${s.text}`);
  return s;
});

results.passed = true;
writeFileSync(join(output, 'results.json'), JSON.stringify(results, null, 2));
console.log(`dictation-proof PASSED ${join(output, 'results.json')}`);
