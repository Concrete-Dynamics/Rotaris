export interface BranchOverlap {
  branch: string;
  worktree: string;
  fork: string | null;
  files: string[];
  movedSinceFork: string[];
  sharedWithMain: string[];
}

export interface OverlapReport {
  main: string;
  branches: BranchOverlap[];
  sharedFiles: Array<{ file: string, branches: string[] }>;
}

export function parseOverlapsArgs(args: string[]): { json: boolean; help: boolean; unknown: string[] };
export function filesChangedBetween(cwd: string, from: string, to: string): string[];
export function touchedFiles(cwd: string, ref: string): string[];
export function overlapWithMain(cwd: string, head?: string, mainRef?: string):
  | { fork: string, mine: string[], theirs: string[], both: string[] }
  | null;
export function branchOverlap(worktree: string, branch: string, mainRef?: string): BranchOverlap;
export function collectOverlaps(cwd: string): OverlapReport | null;
export function renderOverlaps(report: OverlapReport): string[];
export function runOverlaps(options: {
  argv: string[];
  cwd?: string;
  deps?: { log(line: string): void; error(line: string): void };
}): number;
export const USAGE: string;
