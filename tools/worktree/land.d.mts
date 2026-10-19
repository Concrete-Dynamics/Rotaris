import type { Deps } from './steps.mjs';

export const USAGE: string;
export function parseLandArgs(args: string[]): {
  skipProofs: boolean;
  reviewed: boolean;
  keep: boolean;
  maxAttempts: number | null;
  worktree: string | null;
  help: boolean;
  unknown: string[];
};
export function runLand(options: { argv: string[]; cwd?: string; deps?: Deps }): number;
