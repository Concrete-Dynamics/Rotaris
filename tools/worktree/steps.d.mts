export interface StepResult {
  ok: boolean;
  step?: string;
}

export interface Deps {
  log(line: string): void;
  error(line: string): void;
  setup(dir: string): StepResult;
  gate(dir: string): StepResult;
  preflight(dir: string, ids: string[]): StepResult;
  plan(dir: string): { proofs: string[]; review: Array<{ path: string; reason: string }> };
  proofs(dir: string, ids: string[]): StepResult & { failed?: string };
}

export function electronBinary(dir: string): string;
export function needsSetup(dir: string): boolean;
export function defaultDeps(): Deps;
