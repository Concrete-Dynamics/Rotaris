// The types for `ensure.mjs`, plain JavaScript like its siblings; its callers are the desktop build's config and the
// regression beside it (ADR-0056, the build-input bullet).

export interface SymbolArtifactPaths {
  /** Absolute path of `packages/kernel/src/generated/requirements.ts`. */
  readonly artifact: string;
  /** Absolute path of `tools/symbol-artifact/generate.mjs`. */
  readonly generator: string;
}

/** Runs the generator when the artifact does not exist; throws, naming the file and `pnpm symbols`, when it cannot. */
export declare function ensureSymbolArtifact(paths: SymbolArtifactPaths): { generated: boolean };

/** `ensureSymbolArtifact` at a Vite section's `buildStart`. */
export declare function symbolArtifactPlugin(paths: SymbolArtifactPaths): {
  name: 'rotaris:symbol-artifact';
  api: { paths: SymbolArtifactPaths };
  buildStart(): void;
};
