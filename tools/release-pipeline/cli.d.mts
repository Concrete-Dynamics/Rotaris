// The types for `cli.mjs`, declared for the tests beside it.

export declare const REPO: string;
export declare const KEY_RECORD: string;
export declare function runPipelineCommand(
  argv: string[],
  options?: {
    env?: NodeJS.ProcessEnv;
    out?: (line: string) => void;
    err?: (line: string) => void;
    keyRecord?: string;
    repo?: string;
    keys?: readonly string[];
  },
): 0 | 1 | 2;
