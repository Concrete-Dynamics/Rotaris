import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { resolveUserDirs } from '@rotaris/platform';

/**
 * ADR-0035's pre-bootstrap branch (REQ-MCP-033, REQ-STARTUP-002/015; ADR-0055 — this precedes the instance claim).
 *
 * THE FIRST MODULE MAIN IMPORTS, and it must stay so: if the first argument is the reserved token, the remaining
 * arguments are handed to the bundled runtime and its exit status is propagated — and NOTHING ELSE HAPPENS FIRST. No
 * `app` use, no window, no instance claim, no write to standard output, no data directory created (main's own top level
 * mints the machine id and creates the data directory; that code never runs on this path because this module exits
 * before main's body is evaluated). Standard input, output and error are the parent's pipes and are handed to the
 * runtime AS THEY ARE (`stdio: 'inherit'`): the JSON-RPC stream is framed by the runtime alone and re-framed by nothing.
 *
 * The runtime's location is resolved HERE, not by command resolution (ADR-0035): the packaged resources under
 * `process.resourcesPath` (electron-builder's `extraResources`), else the source tree's `apps/desktop/resources/` so the
 * development entry (`electron out/main/index.js builtin:code-intelligence …`) and the packaged binary run one code path.
 *
 * OQ-23's reading, taken: the branch is a GENERAL PASS-THROUGH. `start-mcp-server …` makes it the server of REQ-MCP-033;
 * the setup subcommands of REQ-MCP-099 reach the runtime unchanged through the same branch. Consequence 3: undocumented,
 * unadvertised, inert if discovered — the worst outcome is a process speaking a protocol on its streams.
 *
 * Measured on first execution (spikes/code-intelligence-branch.md, 2026-09-06): the synchronous spawn is what makes
 * "do nothing else first" true without restructuring main — the module's evaluation blocks in the child and main's
 * body is never reached. It forwards no signal; on Windows there is none to forward (a termination is TerminateProcess,
 * and the runtime ends on standard input's end-of-file, which the parent's pipe delivers to both processes at once).
 * When a Linux or macOS build exists (IC-3) the asynchronous form with signal forwarding replaces this, and that is the
 * one thing this file will then change.
 */

/** REQ-MCP-033's one literal — the same token `@rotaris/mcp` and `@rotaris/config` recognise; restated here so this module imports nothing that could initialise before it. */
const CODE_INTELLIGENCE_TOKEN = 'builtin:code-intelligence';
/** The bundled interpreter's module entry (the console-script launchers are trimmed from the bundle: each embeds a build-time path). */
const RUNTIME_ENTRY = 'from serena.cli import top_level; top_level()';

function runtimeExecutable(): string | null {
  const candidates: string[] = [];
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resources) candidates.push(join(resources, 'code-intelligence', 'runtime', 'python.exe'));
  candidates.push(join(__dirname, '..', '..', 'resources', 'code-intelligence', 'runtime', 'python.exe'));
  return candidates.find((c) => existsSync(c)) ?? null;
}

/**
 * The runtime's per-user home (REQ-STARTUP-145: under the product's own data directory, never `~/.serena`): its global
 * configuration, its memories shared across projects, the language servers it provisions. Seeded ONCE with the runtime's
 * own configuration template, three values changed so that a process started with the token presents no user interface
 * of any kind (REQ-MCP-033): no dashboard server, no browser tab, no log window. The file is the user's afterwards.
 */
function runtimeHome(python: string): string {
  const home = join(resolveUserDirs().data, 'code-intelligence');
  const config = join(home, 'serena_config.yml');
  if (!existsSync(config)) {
    mkdirSync(home, { recursive: true });
    let text = '';
    try {
      const template = join(python, '..', 'Lib', 'site-packages', 'serena', 'resources', 'serena_config.template.yml');
      text = readFileSync(template, 'utf8')
        .replace(/^gui_log_window:.*$/m, 'gui_log_window: False')
        .replace(/^web_dashboard:.*$/m, 'web_dashboard: False')
        .replace(/^web_dashboard_open_on_launch:.*$/m, 'web_dashboard_open_on_launch: False');
    } catch {
      // Measured 2026-09-06: the runtime refuses a configuration without its `projects` key, so the fallback carries it.
      text = 'gui_log_window: False\nweb_dashboard: False\nweb_dashboard_open_on_launch: False\nprojects: []\n';
    }
    writeFileSync(config, `# Written once by Rotaris when the bundled code-intelligence runtime first started (ADR-0035, REQ-MCP-033):\n# the runtime presents no user interface — no dashboard, no browser tab, no log window. Yours to edit; Rotaris rewrites nothing here.\n${text}`);
  }
  return home;
}

const tokenAt = process.defaultApp || process.env['ELECTRON_RUN_AS_NODE'] ? 2 : 1;
if (process.argv[tokenAt] === CODE_INTELLIGENCE_TOKEN) {
  const python = runtimeExecutable();
  if (python === null) {
    // A synchronous write: `process.stderr.write` on a pipe is asynchronous here and an exit right after it loses the line.
    writeSync(2, 'rotaris: the bundled code-intelligence runtime is not present in this installation (build it with pnpm code-intel:bundle)\n');
    process.exit(127);
  }
  // Measured 2026-09-06 (spikes/code-intelligence-branch.md): Electron's binary exits -1 about 50 ms after start, before
  // any JavaScript runs, when the command line holds a scheme-looking positional (the token's colon) FOLLOWED BY another
  // positional — `Rotaris.exe builtin:code-intelligence start-mcp-server` never reaches this file; the same line with `--`
  // after the token does, and the token is still the first argument. The launch of the token (packages/config) therefore
  // puts `--` second; it is dropped here so the runtime sees its own arguments only.
  const rest = process.argv.slice(tokenAt + 1);
  if (rest[0] === '--') rest.shift();
  const env: Record<string, string> = { ...(process.env as Record<string, string>), SERENA_HOME: runtimeHome(python), PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' };
  delete env['ELECTRON_RUN_AS_NODE'];
  const r = spawnSync(python, ['-c', RUNTIME_ENTRY, ...rest], { stdio: 'inherit', env, windowsHide: true, maxBuffer: Number.MAX_SAFE_INTEGER });
  if (r.error) {
    writeSync(2, `rotaris: the bundled code-intelligence runtime could not be started: ${r.error.message}\n`);
    process.exit(126);
  }
  // The runtime's own exit status, whatever it is (REQ-MCP-033): a signal death is reported the shell's way.
  process.exit(r.status ?? (r.signal ? 128 + 15 : 1));
}

/** Present so the import has a name to bind; the branch above never returns when taken. */
export const SENTINEL_CHECKED = true;
