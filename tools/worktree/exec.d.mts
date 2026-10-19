export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface Command {
  file: string;
  args: string[];
  pretty: string;
  shell?: boolean;
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
  stdio?: 'inherit' | 'capture';
}

export function run(file: string, args: string[], opts?: RunOptions): RunResult;
export function shellCommand(tokens: string[], platform?: NodeJS.Platform): Command;
export function pnpmCommand(argv: string[], env?: NodeJS.ProcessEnv): Command;
export function runPnpm(argv: string[], opts?: RunOptions): RunResult;
export function oneLine(text: string): string;
export function seconds(ms: number): string;
export function isMainModule(argv1: string | undefined, metaUrl: string): boolean;
