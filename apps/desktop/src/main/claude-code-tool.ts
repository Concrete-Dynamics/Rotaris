import { execFile, spawn } from 'node:child_process';
import { findExecutable } from '@rotaris/platform';
import { LOCAL_TOOL_MODELS_REQUEST, localToolModelsOf, localToolStateOf, type DiscoveredModel, type LocalToolState } from '@rotaris/providers';

/**
 * PD-PROVIDER-002 / PD-PROVIDER-003 — the Claude Code tool the user installed, as main asks about it. Whether it is
 * there is read off the search path without starting anything. What it says of its own sign-in is its `auth status`
 * answer, of which only three facts are kept (`localToolStateOf`); what it offers the account is its answer to one
 * control request that carries no prompt (`localToolModelsOf`). The account either answer names is never logged,
 * stored or sent anywhere.
 *
 * Both command lines are FIXED: nothing of them is read from the environment, and the search path only decides whether
 * the Windows form — the command interpreter running the tool's shim — is needed.
 */
const STATUS_TIMEOUT_MS = 15_000;
const MODELS_TIMEOUT_MS = 20_000;
const MODELS_OUTPUT_LIMIT = 4 * 1024 * 1024;

const STATUS_ARGS = ['auth', 'status'] as const;
const STATUS_SHIM_LINE = '"claude auth status"';
/** The tool as a model only, as the run host starts it: no built-in tools, no settings of the user's, no tool servers, nothing kept. */
const MODELS_ARGS = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence'] as const;
const MODELS_SHIM_LINE = '"claude -p --input-format stream-json --output-format stream-json --verbose --tools "" --strict-mcp-config --setting-sources "" --no-session-persistence"';

export interface ClaudeCodeTool {
  installed(): boolean;
  state(): Promise<LocalToolState>;
  models(): Promise<readonly DiscoveredModel[] | null>;
}

export function claudeCodeTool(opts: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv; readonly platform?: NodeJS.Platform }): ClaudeCodeTool {
  const base = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const located = (): string | null => findExecutable('claude', base, platform);
  const shim = (): boolean => platform === 'win32' && /\.(cmd|bat)$/i.test(located() ?? '');
  /** The tool must not take itself for a session nested in another Claude Code session. */
  const environment = (): NodeJS.ProcessEnv => {
    const env = { ...base };
    delete env['CLAUDECODE'];
    delete env['CLAUDE_CODE_ENTRYPOINT'];
    return env;
  };
  return {
    installed: () => located() !== null,
    state: () => new Promise((resolve) => {
      const target = shim() ? { command: 'cmd.exe', args: ['/d', '/s', '/c', STATUS_SHIM_LINE], verbatim: true } : { command: 'claude', args: [...STATUS_ARGS], verbatim: false };
      execFile(target.command, target.args, { env: environment(), timeout: STATUS_TIMEOUT_MS, windowsHide: true, ...(target.verbatim ? { windowsVerbatimArguments: true } : {}) }, (error, stdout) => {
        const text = String(stdout).trim();
        resolve(localToolStateOf(text.startsWith('{') ? text : error && (error as NodeJS.ErrnoException).code === 'ENOENT' ? null : '{}'));
      });
    }),
    models: () => new Promise((resolve) => {
      if (located() === null) { resolve(null); return; }
      const target = shim() ? { command: 'cmd.exe', args: ['/d', '/s', '/c', MODELS_SHIM_LINE], verbatim: true } : { command: 'claude', args: [...MODELS_ARGS], verbatim: false };
      let settled = false;
      let buffer = '';
      let read = 0;
      const child = spawn(target.command, target.args, { cwd: opts.cwd, env: environment(), stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, ...(target.verbatim ? { windowsVerbatimArguments: true } : {}) });
      const finish = (models: readonly DiscoveredModel[] | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.stdin.on('error', () => undefined);
        if (child.stdin.writable) child.stdin.end();
        child.kill();
        resolve(models);
      };
      // rotaris/no-bare-timers binds engine code; this is main's own bound on a child process, as `execFile`'s timeout is.
      const timer = setTimeout(() => finish(null), MODELS_TIMEOUT_MS);
      child.on('error', () => finish(null));
      child.on('exit', () => finish(null));
      child.stdin.on('error', () => undefined);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        read += chunk.length;
        if (read > MODELS_OUTPUT_LIMIT) { finish(null); return; }
        buffer += chunk;
        for (let i = buffer.indexOf('\n'); i >= 0; i = buffer.indexOf('\n')) {
          const answer = localToolModelsOf(buffer.slice(0, i));
          buffer = buffer.slice(i + 1);
          if (answer !== null) { finish(answer.length > 0 ? answer : null); return; }
        }
      });
      child.stdin.write(LOCAL_TOOL_MODELS_REQUEST);
    }),
  };
}
