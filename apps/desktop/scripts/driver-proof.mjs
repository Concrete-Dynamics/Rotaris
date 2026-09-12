/**
 * The driver's first execution (`pnpm driver-proof`).
 *
 * ONE launch of the built application, driven through the seam in `apps/desktop/src/main/driver.ts` and the
 * client in `lib/driver.mjs`: the window found, a view opened by clicking its name, a chord, text typed into the
 * composer, the document inspected and probed, the window resized to REQ-SHELL-022's minimum, a product command
 * sent through main's own `runCommand`, a photograph taken, a request with the wrong secret refused, and the app
 * quit. Every step WAITS for what it needs; no step is scheduled at a wall-clock offset, which is the whole
 * reason the seam exists.
 *
 * What it is evidence of: that the mechanism works against the shipped composition, and that the two claims the
 * design rests on hold — a wait bounded by a deadline reports the selector it gave up on, and a request without
 * the launch secret is refused without taking the window down with it.
 *
 * Evidence under `.proof/driver-proof/`: `app.log`, `screen.png`, `results.json`. `--skip-build` skips the build.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect as connectSocket } from 'node:net';
import { join } from 'node:path';
import { buildDesktop, evidenceDirectory } from './lib/harness.mjs';
import { connect, startApp } from './lib/driver.mjs';

const output = evidenceDirectory('.driver-proof');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
if (!process.argv.includes('--skip-build')) buildDesktop(output);

const workspace = join(output, 'workspace');
mkdirSync(join(workspace, '.rotaris'), { recursive: true });
writeFileSync(join(workspace, 'README.md'), '# driver proof\n');
writeFileSync(join(workspace, '.rotaris', 'agents.yaml'), [
  'models:', '  scripted: { provider: scripted, model_id: scripted }',
  'small_model: scripted', 'medium_model: scripted', 'large_model: scripted',
  'runtime:', '  permission_mode: autonomous',
  // ADR-0035's discovery costs ~4.5 s at every run start; this proof measures the driver, not the run.
  'mcp_servers:', '  code_intelligence: { enabled: false }',
  'rotaris:', '  delegation_strategy: single', '',
].join('\n'));

const results = [];
let failures = 0;
const check = (name, ok, detail) => {
  results.push({ name, verdict: ok ? 'PASS' : 'FAIL', detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
};
const note = (name, detail) => { results.push({ name, verdict: 'NOTE', detail }); console.log(`NOTE  ${name} — ${detail}`); };

const started = await startApp({ root: join(output, 'app'), workspace, timeoutMs: 90_000 });
const d = started.driver;
try {
  const pong = await d.ping();
  check('the seam answers', pong.pid > 0 && pong.window === true, `pid ${pong.pid}, window present`);

  // 1. The wait. The shell is the first thing every other step depends on.
  const shell = await d.waitFor('.app-shell', { timeoutMs: 30_000 });
  check('waitFor finds the shell', shell.width > 0 && shell.height > 0, `${Math.round(shell.width)}×${Math.round(shell.height)} after ${shell.waitedMs} ms`);
  note('what the wait was worth', `the shell arrived ${shell.waitedMs} ms after the connection; a seam scheduled at a fixed offset would have had to guess this number`);

  // 2. The bound. A wait that cannot end must end anyway, and say what it was waiting for.
  const before = Date.now();
  const refused = await d.waitFor('.no-such-element-anywhere', { timeoutMs: 1_000 }).then(() => null).catch((cause) => cause);
  const waited = Date.now() - before;
  check('a wait that cannot succeed ends at its deadline', refused !== null && /no-such-element-anywhere/.test(refused.message) && waited < 4_000, `${refused === null ? 'it resolved' : refused.message} (after ${waited} ms)`);

  // 3. Seven views, by REQ-SHELL-023. The inspect op reads the document the user is looking at.
  const rail = await d.inspect('.nav-item');
  check('the rail carries the seven primary views', rail.matches.length === 7, `${rail.matches.length} items: ${rail.matches.map((m) => m.text).join(', ')}`);

  // 4. A click, located by the name on screen, changes the view (REQ-SHELL-049's views reached by pointer).
  const clicked = await d.click('.nav-item', { text: 'Git' });
  const gitView = await d.waitFor('.app-shell[data-view="git"]', { timeoutMs: 10_000 }).then(() => true).catch(() => false);
  check('a click by name opens that view', gitView, `clicked "${clicked.text}" at ${clicked.x},${clicked.y}; the shell reports data-view="git"`);

  // 5. A chord (REQ-SHELL-049: Ctrl+1 is Overview).
  await d.chord('Ctrl+1');
  const overview = await d.waitFor('.app-shell[data-view="overview"]', { timeoutMs: 10_000 }).then(() => true).catch(() => false);
  check('a chord reaches the shell', overview, 'Ctrl+1 returned the shell to Overview');

  // 6. Typing, into the control the product's own chord focuses (REQ-CHAT-002). No Enter: nothing is submitted.
  await d.chord('Ctrl+2');
  await d.waitFor('.composer__input', { timeoutMs: 10_000 });
  await d.chord('Ctrl+L');
  await d.type('driver proof draft');
  const composer = await d.eval(`document.querySelector('.composer__input')?.value ?? ''`);
  check('typed characters reach the focused control', composer === 'driver proof draft', JSON.stringify(composer));

  // 7. The probe shape the existing proofs read, from the same document.
  const probed = await d.probe('.nav-item');
  check('probe returns the proofs’ own shape', Array.isArray(probed) && probed.length === 7 && typeof probed[0].text === 'string', `${probed.length} rows, first "${probed[0]?.text}"`);

  // 8. REQ-SHELL-022's minimum window size, set and read back.
  const sized = await d.resize(1000, 680);
  check('the window resizes to the stated minimum', sized.width === 1000 && sized.height === 680, `${sized.width}×${sized.height}`);

  // 9. A product command through main's own path — not a shortcut around it.
  const themed = await d.command({ kind: 'theme.set', name: 'nocturne' });
  const applied = await d.eval(`document.documentElement.dataset.theme`);
  check('a command reaches the product’s own handler', themed.ok === true && applied === 'nocturne', `outcome ${JSON.stringify(themed)}, document reports "${applied}"`);

  // 10. The photograph.
  const shot = join(output, 'screen.png');
  await d.screenshot(shot);
  const signature = existsSync(shot) ? readFileSync(shot).subarray(0, 8).toString('hex') : '';
  check('a screenshot is written', signature === '89504e470d0a1a0a', `${shot} (${signature || 'absent'})`);

  // 11. The secret. A request without it is refused, the connection dropped — and the window survives it.
  const endpoint = JSON.parse(readFileSync(started.endpointFile, 'utf8'));
  const intruder = await new Promise((resolve) => {
    const socket = connectSocket({ port: endpoint.port, host: '127.0.0.1' }, () => socket.write(`${JSON.stringify({ id: 1, token: 'wrong', op: 'eval', expression: '1' })}\n`));
    let text = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => { text += chunk; });
    socket.on('close', () => resolve({ text, closed: true }));
    socket.on('error', () => resolve({ text, closed: true }));
    setTimeout(() => { socket.destroy(); resolve({ text, closed: false }); }, 5_000);
  });
  const stillAlive = await d.ping().then((p) => p.window === true).catch(() => false);
  check('a request without the launch secret is refused', /secret/.test(intruder.text) && intruder.closed, `reply ${JSON.stringify(intruder.text.trim())}, connection closed ${intruder.closed}`);
  check('the refusal does not take the window down', stillAlive, 'the seam still answers after dropping the intruder');

  // 12. The quit, and the endpoint file with it.
  await d.quit();
  const gone = await (async () => {
    for (let i = 0; i < 50; i += 1) { if (!existsSync(started.endpointFile)) return true; await new Promise((r) => setTimeout(r, 200)); }
    return !existsSync(started.endpointFile);
  })();
  check('quit closes the app and removes the endpoint', gone, `${started.endpointFile} ${gone ? 'removed' : 'still present'}`);
} finally {
  d.close();
  try { if (started.child.pid) process.kill(started.child.pid); } catch { /* already gone, which is the expected case after `quit` */ }
  const log = existsSync(started.logFile) ? readFileSync(started.logFile, 'utf8') : '';
  writeFileSync(join(output, 'app.log'), log);
  writeFileSync(join(output, 'results.json'), `${JSON.stringify({ checks: results, failures }, null, 2)}\n`);
}

console.log(`\n${results.filter((r) => r.verdict === 'PASS').length} passed, ${failures} failed, ${results.filter((r) => r.verdict === 'NOTE').length} noted — evidence in ${output}`);
process.exit(failures === 0 ? 0 : 1);
