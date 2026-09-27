// The types for `build-id.mjs`. That module is plain JavaScript on purpose — its callers are `pnpm build-id` and
// `pnpm package`, neither of which compiles TypeScript — so its contract is declared here for the tests beside it
// (REQ-SHELL-140, REQ-STARTUP-149).

/** REQ-SHELL-140's bundled text asset: `build-id.txt`. */
export declare const BUILD_ID_FILE: string;
/** The output, relative to the repository root. */
export declare const PATHS: Readonly<{ output: string }>;

export interface BuildIdOptions {
  /** The repository root whose HEAD the build is made from. */
  readonly root: string;
  /** The git executable; `git` on the PATH by default. */
  readonly git?: string;
  /** The environment git runs with; the variables that redirect git to another repository are removed from it. */
  readonly env?: NodeJS.ProcessEnv;
}

/** The commit's full object name, `-dirty` appended when the working tree differs from it; or why there is none. */
export declare function identifyBuild(options: BuildIdOptions): { id: string; commit: string; dirty: boolean } | { problem: string };
/** REQ-STARTUP-149: 0 written, 1 a handled error (every line `error: …`); on 1 no file is left behind. */
export declare function runBuildIdStep(options: BuildIdOptions): { code: 0 | 1; stdout: string[]; stderr: string[] };
