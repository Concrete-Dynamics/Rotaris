/**
 * `pnpm app:drive` — the built application, kept alive, driven one command at a time from a shell.
 *
 * This is the debugging half of the driver seam. `start` launches the app against a scratch profile and
 * returns while it keeps running; every later command connects to that same window, does one thing and prints
 * what the seam answered. That is the loop the proofs could not give: reading one rectangle used to mean
 * editing a proof script and waiting out a launch.
 *
 *   pnpm app:drive start [--workspace=PATH] [--dialect=scripted|...] [--fresh]
 *   pnpm app:drive start --env=ROTARIS_CAPTURE_PROJECT_FOLDER=D:\a\folder   (repeatable; hands a seam over)
 *   pnpm app:drive waitFor ".board" [--timeout=15000]
 *   pnpm app:drive click ".nav-item" --text=Overview
 *   pnpm app:drive type "hello" --enter
 *   pnpm app:drive chord Ctrl+K
 *   pnpm app:drive inspect ".composer"
 *   pnpm app:drive probe "[data-testid=session-row]"
 *   pnpm app:drive eval "document.title"
 *   pnpm app:drive shot screen.png
 *   pnpm app:drive resize 1000 680
 *   pnpm app:drive command '{"kind":"theme.set","name":"nocturne"}'
 *   pnpm app:drive windows
 *   pnpm app:drive log [--tail=40]
 *   pnpm app:drive stop
 *
 * Nothing here is product code, and nothing here is evidence: a proof asserts, this reports.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { connect, startApp } from './lib/driver.mjs';
import { evidenceDirectory } from './lib/harness.mjs';

const root = evidenceDirectory('.drive');
const endpointFile = join(root, 'endpoint.json');
const logFile = join(root, 'app.log');

const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';
const positional = argv.slice(1).filter((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
  const found = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (found === undefined) return fallback;
  return found.includes('=') ? found.slice(found.indexOf('=') + 1) : true;
};

const print = (value) => console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));

async function client() {
  if (!existsSync(endpointFile)) throw new Error('no app is being driven — run `pnpm app:drive start` first');
  return connect(endpointFile, { timeoutMs: 5_000 });
}

async function withClient(fn) {
  const driver = await client();
  try { print(await fn(driver)); } finally { driver.close(); }
}

switch (command) {
  case 'start': {
    if (flag('fresh', false)) rmSync(root, { recursive: true, force: true });
    if (existsSync(endpointFile)) {
      const live = await connect(endpointFile, { timeoutMs: 2_000 }).then((d) => { d.close(); return true; }).catch(() => false);
      if (live) { print('an app is already being driven; `pnpm app:drive stop` first'); break; }
      rmSync(endpointFile, { force: true });
    }
    const workspace = flag('workspace', undefined);
    /*
     * `--env=KEY=VALUE`, repeatable, handed to the launch as `startApp`'s `extra`.
     *
     * It exists because an exported variable does NOT reach a driven app: `startApp` builds the child's
     * environment from `cleanEnvironment()`, which deletes every `ROTARIS_*` name on purpose, so that a proof
     * measures the product rather than the shell it was started from. Without a way through, a flow whose seam
     * is the only thing standing in for a person — the native folder chooser — cannot be driven at all: it
     * opens the real dialog, nothing appears in the document, and the debugging session reads that as the
     * product doing nothing. The seam is handed over explicitly and named back in the reply, so a session can
     * never be confused about which seams were armed.
     */
    const extra = Object.fromEntries(
      argv.filter((a) => a.startsWith('--env=')).map((a) => {
        const pair = a.slice('--env='.length);
        const eq = pair.indexOf('=');
        return eq === -1 ? [pair, ''] : [pair.slice(0, eq), pair.slice(eq + 1)];
      }),
    );
    const started = await startApp({
      root,
      ...(typeof workspace === 'string' ? { workspace } : {}),
      dialect: typeof flag('dialect', 'scripted') === 'string' ? flag('dialect', 'scripted') : 'scripted',
      detached: true,
      extra,
    });
    print({ pid: started.child.pid, endpoint: started.endpointFile, log: started.logFile, seams: Object.keys(extra), ...(await started.driver.ping()) });
    started.driver.close();
    break;
  }
  case 'stop': {
    if (!existsSync(endpointFile)) { print('nothing to stop'); break; }
    const driver = await connect(endpointFile, { timeoutMs: 5_000 }).catch(() => null);
    if (driver) { await driver.quit(); driver.close(); print('quit sent'); }
    else {
      const pidFile = join(root, 'app.pid');
      const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8').trim()) : 0;
      if (pid) { try { process.kill(pid); print(`killed ${pid}`); } catch { print(`no process ${pid}`); } }
      else print('no endpoint and no pid');
    }
    rmSync(endpointFile, { force: true });
    break;
  }
  case 'log': {
    if (!existsSync(logFile)) { print('no log yet'); break; }
    const tail = Number(flag('tail', 40));
    print(readFileSync(logFile, 'utf8').split('\n').slice(-tail).join('\n'));
    break;
  }
  case 'waitFor':
    await withClient((d) => d.waitFor(positional[0], { ...(flag('text', undefined) === undefined ? {} : { text: String(flag('text')) }), ...(flag('timeout', undefined) === undefined ? {} : { timeoutMs: Number(flag('timeout')) }) }));
    break;
  case 'click':
    await withClient((d) => d.click(positional[0], { ...(flag('text', undefined) === undefined ? {} : { text: String(flag('text')) }), ...(flag('timeout', undefined) === undefined ? {} : { timeoutMs: Number(flag('timeout')) }) }));
    break;
  case 'type':
    await withClient((d) => d.type(positional[0] ?? '', { enter: flag('enter', false) === true }));
    break;
  case 'chord':
    await withClient((d) => d.chord(positional[0]));
    break;
  case 'inspect':
    await withClient((d) => d.inspect(positional[0]));
    break;
  case 'probe':
    await withClient((d) => d.probe(positional[0]));
    break;
  case 'eval':
    await withClient((d) => d.eval(positional[0]));
    break;
  case 'shot':
    await withClient((d) => d.screenshot(join(process.cwd(), positional[0] ?? 'drive.png')));
    break;
  case 'resize':
    await withClient((d) => d.resize(Number(positional[0]), Number(positional[1])));
    break;
  case 'maximize':
    await withClient((d) => d.send('maximize'));
    break;
  case 'command':
    await withClient((d) => d.command(JSON.parse(positional[0] ?? '{}')));
    break;
  // The main windows, most recently focused first. `{ windows, selected }` — an envelope, not a bare list.
  case 'windows':
    await withClient((d) => d.windows());
    break;
  case 'ping':
    await withClient((d) => d.ping());
    break;
  default:
    print(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 26).map((l) => l.replace(/^ \* ?/, '')).join('\n'));
}
