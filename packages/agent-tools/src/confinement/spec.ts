/**
 * ADR-0022's shared core: the confinement *specification*, computed once and identically on every
 * platform. The two renderers consume this and decide nothing, which is how REQ-SANDBOX-061's
 * backend parity is obtained rather than hoped for — the parts most likely to diverge (which roots
 * are writable, which names are protected, whether each protected name exists) are shared logic,
 * not platform mechanism.
 *
 * Pure apart from one existence check per protected name, which REQ-SANDBOX-077 requires be taken
 * at render time and re-taken for the next command.
 */
import { existsSync } from 'node:fs';
import type { SandboxModeName } from '@rotaris/contracts';

/** REQ-SANDBOX-056: fixed, and no setting or combination of settings removes either name. */
export const PROTECTED_SUBPATHS: readonly string[] = Object.freeze(['.git', '.rotaris']);

/**
 * REQ-SANDBOX-077's three cases for a protected name. `outside` is case (a) — the name lies
 * outside every writable root, the read-only root already refuses the write, and nothing extra is
 * rendered. It is carried rather than dropped so a renderer's input states every protected name
 * the specification considered.
 */
export type CarveOutCase = 'outside' | 'exists' | 'absent';

export interface CarveOut {
  readonly path: string;
  readonly kase: CarveOutCase;
}

/** The mode of a specification is never `off`: REQ-SANDBOX-074 renders no confinement at all for it. */
export type ActiveSandboxMode = Exclude<SandboxModeName, 'off'>;

export interface ConfinementSpec {
  readonly mode: ActiveSandboxMode;
  /** REQ-SANDBOX-058: ordered, de-duplicated keeping the first occurrence, missing roots already dropped. */
  readonly writableRoots: readonly string[];
  /** One entry per protected name per writable root, plus case (a) when no root holds them. */
  readonly carveOuts: readonly CarveOut[];
  /** REQ-SANDBOX-059: closed unless the opt-in grants it. */
  readonly allowNetwork: boolean;
  /** REQ-SANDBOX-058: a configured root absent at render time, named for the log entry it owes. */
  readonly skippedRoots: readonly string[];
}

export interface SpecInput {
  readonly mode: ActiveSandboxMode;
  /** REQ-SANDBOX-091: the directory the session genuinely executes in — the worktree, else the workspace. */
  readonly executionRoot: string;
  readonly writableRoots: readonly string[];
  readonly allowNetwork: boolean;
}

export interface SpecDeps {
  /**
   * REQ-SANDBOX-078: the check lands on the restrictive side and follows links, so a symlink with
   * no target counts as absent and takes case (c) — the empty read-only mount, under which the
   * name reads as empty and nothing can be created.
   */
  readonly exists: (path: string) => boolean;
}

const REAL: SpecDeps = { exists: (p) => existsSync(p) };

/**
 * The protected name appended to a root, with the POSIX separator both backends speak.
 *
 * ADR-0022's first execution found `node:path`'s `join` here: on a Windows host it returned
 * `\ws\.git` for `/ws` + `.git`, a path meaningless to Seatbelt and to bubblewrap alike. The
 * falsified reason, kept beside its replacement: "the specification is shared, so the host's own
 * path module is the portable choice". It is the opposite — the specification is shared and the
 * two consumers are both POSIX, so the SEPARATOR is part of what is being specified, and
 * REQ-SANDBOX-050 forbids separator rewriting in exactly these words. Joining textually also
 * keeps the root's own spelling, which that requirement requires and `join` normalises away.
 */
function protectedPath(root: string, name: string): string {
  return `${root.replace(/\/+$/, '')}/${name}`;
}

/**
 * REQ-SANDBOX-058: `read-only` grants no writable root; `workspace-write` grants the execution root
 * first and then each configured additional root, duplicates removed keeping the first. A configured
 * root missing at render time is skipped with a log entry rather than treated as an error — a
 * configured root is optional convenience and must not be able to stop a session. The execution root
 * itself is never skipped: it is the directory the session runs in (REQ-SANDBOX-091).
 */
export function computeConfinement(input: SpecInput, deps: SpecDeps = REAL): ConfinementSpec {
  const writableRoots: string[] = [];
  const skippedRoots: string[] = [];
  if (input.mode === 'workspace-write') {
    writableRoots.push(input.executionRoot);
    for (const root of input.writableRoots) {
      if (writableRoots.includes(root)) continue;
      if (!deps.exists(root)) { skippedRoots.push(root); continue; }
      writableRoots.push(root);
    }
  }

  const carveOuts: CarveOut[] = [];
  if (writableRoots.length === 0) {
    // Case (a): no writable root exists, so every protected name is already refused by the
    // read-only root and nothing extra is rendered (REQ-SANDBOX-077 (a)).
    for (const name of PROTECTED_SUBPATHS) carveOuts.push({ path: protectedPath(input.executionRoot, name), kase: 'outside' });
  } else {
    for (const root of writableRoots) {
      for (const name of PROTECTED_SUBPATHS) {
        const path = protectedPath(root, name);
        carveOuts.push({ path, kase: deps.exists(path) ? 'exists' : 'absent' });
      }
    }
  }

  return { mode: input.mode, writableRoots, carveOuts, allowNetwork: input.allowNetwork, skippedRoots };
}

/**
 * REQ-SANDBOX-070's Linux trial specification: a read-only confinement rooted at `/` with no
 * carve-outs and no writable roots, whose network namespace stays separate whatever
 * `runtime.sandbox_allow_network` says. Rendering it reads no path on the filesystem.
 */
export const TRIAL_SPEC: ConfinementSpec = Object.freeze({
  mode: 'read-only' as const,
  writableRoots: Object.freeze([]) as readonly string[],
  carveOuts: Object.freeze([]) as readonly CarveOut[],
  allowNetwork: false,
  skippedRoots: Object.freeze([]) as readonly string[],
});
