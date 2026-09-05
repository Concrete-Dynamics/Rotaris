import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { findExecutable } from '@rotaris/platform';
import { info, warn, type Diagnostic, type Staged } from './diagnostics.js';
import type { McpServerEntry } from './entry.js';

/**
 * REQ-MCP-028..037: command resolution and the ONE availability rule. Pure over its inputs; the PATH lookup is an
 * injected function so the stage is testable and so no surface can disagree with another (REQ-MCP-037: every
 * surface calls `availability()` with the same lookup).
 */
export const CODE_INTELLIGENCE_TOKEN = 'builtin:code-intelligence' as const;

/** REQ-MCP-029: the fixed known-executable set, passed through unchanged. */
export const KNOWN_EXECUTABLES: ReadonlySet<string> = new Set(['npx', 'npm', 'node', 'uvx', 'uv', 'pipx', 'pip', 'python', 'python3', 'deno', 'bun', 'docker', 'podman', 'bash', 'sh', 'zsh', 'fish', 'cmd', 'powershell', 'pwsh', 'go', 'cargo', 'java']);

/** REQ-MCP-035: the two recognised filesystem-server package identifiers. */
export const FILESYSTEM_PACKAGES: ReadonlySet<string> = new Set(['@modelcontextprotocol/server-filesystem', 'filesystem-mcp']);

export interface ResolvedCommand {
  readonly command: string;
  readonly args: readonly string[];
  /** True when the command is REQ-MCP-033's reserved token (never PATH-looked-up; resolved by the launch path). */
  readonly builtin: boolean;
}

/** REQ-MCP-028: path-like commands are never rewritten. */
export function isPathLike(command: string): boolean {
  return command.startsWith('/') || command.startsWith('./') || command.startsWith('../') || command.startsWith('~') || command.includes('\\') || /^[A-Za-z]:/.test(command);
}

export interface ResolveCommandInput {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly workspaceRoot: string | null;
  readonly onPath: (executable: string) => boolean;
  /**
   * REQ-MCP-034: the runtime's launch subcommand and the two project-selection options, from ADR-0035's manifest.
   * Null until that manifest exists — the binding stage is present and inert.
   */
  readonly binding: { readonly launchSubcommand: string; readonly projectPathOption: string; readonly projectFromCwdOption: string } | null;
}

/** REQ-MCP-033 first, then 028, 029, 030/031, 032, then 034 and 035. Side-effect free on its inputs (REQ-MCP-009). */
export function resolveCommand(input: ResolveCommandInput): Staged<ResolvedCommand> {
  const diagnostics: Diagnostic[] = [];
  const { command } = input;
  let out: ResolvedCommand;
  if (command === CODE_INTELLIGENCE_TOKEN) out = { command, args: [...input.args], builtin: true };
  else if (command.trim() === '' || isPathLike(command) || KNOWN_EXECUTABLES.has(command)) out = { command, args: [...input.args], builtin: false };
  else if (command.startsWith('uvx:')) {
    const pkg = command.slice('uvx:'.length);
    if (pkg === '') out = { command, args: [...input.args], builtin: false };
    else {
      if (!input.onPath('uvx')) diagnostics.push(warn(`mcp ${input.name}: '${command}' resolves to uvx, which is not on PATH; the server will be unavailable until it is installed (REQ-MCP-030)`, 'process', `mcp.runner.uvx.${input.name}`, { server: input.name, channels: 'log' }));
      out = { command: 'uvx', args: [pkg, ...input.args], builtin: false };
    }
  } else if (command.startsWith('npm:') || command.startsWith('@')) {
    const pkg = command.startsWith('npm:') ? command.slice('npm:'.length) : command;
    if (pkg === '') out = { command, args: [...input.args], builtin: false };
    else {
      if (!input.onPath('npx')) diagnostics.push(warn(`mcp ${input.name}: '${command}' resolves to npx, which is not on PATH; the server will be unavailable until it is installed (REQ-MCP-031)`, 'process', `mcp.runner.npx.${input.name}`, { server: input.name, channels: 'log' }));
      out = { command: 'npx', args: ['-y', pkg, ...input.args], builtin: false };
    }
  } else out = { command, args: [...input.args], builtin: false };

  // REQ-MCP-034: the workspace binding, matched on the launch subcommand alone; inert until the manifest exists.
  if (input.binding && input.workspaceRoot !== null && out.args.includes(input.binding.launchSubcommand)) {
    const hasSelection = out.args.includes(input.binding.projectPathOption) || out.args.includes(input.binding.projectFromCwdOption);
    if (!hasSelection) out = { ...out, args: [...out.args, input.binding.projectPathOption, input.workspaceRoot] };
  }
  // REQ-MCP-035: the filesystem-server path fill-in.
  if (input.workspaceRoot !== null) {
    const at = out.args.findIndex((a) => FILESYSTEM_PACKAGES.has(a));
    if (at !== -1) {
      const paths = out.args.slice(at + 1);
      if (paths.length === 0) out = { ...out, args: [...out.args, input.workspaceRoot] };
      else if (paths.length === 1 && input.name === 'filesystem' && !existsSync(paths[0]!)) {
        diagnostics.push(warn(`mcp ${input.name}: the configured path ${paths[0]} does not exist; the workspace root ${input.workspaceRoot} is used instead (REQ-MCP-035)`, 'process', `mcp.fs-fill.${input.name}`, { server: input.name }));
        out = { ...out, args: [...out.args.slice(0, at + 1), input.workspaceRoot] };
      }
    }
  }
  return { value: out, diagnostics };
}

/** REQ-MCP-037's PATH lookup is the platform's one implementation (`findExecutable`), so no surface can disagree with the launch. */
export function findOnPath(command: string, env: Readonly<Record<string, string | undefined>>, platform: NodeJS.Platform = process.platform): string | null {
  return findExecutable(command, env, platform);
}

export type Availability = { readonly available: true; readonly why: 'remote' | 'builtin' | 'on-path' } | { readonly available: false; readonly why: 'empty-command' | 'not-on-path'; readonly detail: string };

/** REQ-MCP-037: the single rule for every surface. Supplying a workspace root never changes the answer. */
export function availability(entry: Pick<McpServerEntry, 'type' | 'command'>, resolved: ResolvedCommand | null, onPath: (executable: string) => boolean): Availability {
  if (entry.type !== 'stdio') return { available: true, why: 'remote' };
  if (entry.command === CODE_INTELLIGENCE_TOKEN || resolved?.builtin) return { available: true, why: 'builtin' };
  const command = resolved?.command ?? entry.command ?? '';
  if (command.trim() === '') return { available: false, why: 'empty-command', detail: 'the entry has no command' };
  if (onPath(command)) return { available: true, why: 'on-path' };
  return { available: false, why: 'not-on-path', detail: `the command '${basename(command)}' was not found on the executable search path` };
}

/** REQ-MCP-041's detailed line, once per server per process. */
export function unavailableDetail(name: string, raw: string, resolved: ResolvedCommand | null): Diagnostic {
  return info(`mcp ${name}: unavailable — raw command '${raw}', resolved command '${resolved?.command ?? raw}'${resolved ? ` with arguments [${resolved.args.join(' ')}]` : ''} was not found on PATH (REQ-MCP-041)`, 'process', `mcp.unavailable-detail.${name}`, { server: name });
}
