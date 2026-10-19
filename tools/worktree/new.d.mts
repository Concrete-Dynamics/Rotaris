import type { Deps } from './steps.mjs';

export const USAGE: string;
export function parseNewArgs(args: string[]): { branch: string | null; dir: string | null; help: boolean; unknown: string[] };
export function runNew(options: { argv: string[]; cwd?: string; deps?: Deps }): number;
