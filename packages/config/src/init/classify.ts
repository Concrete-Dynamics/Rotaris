import { readdirSync, type Dirent } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ignoredHere, loadRules } from './gitignore.js';
import { readWorkspaceDocument, sourceExtensionOverrideOf, type WorkspaceClassification } from './state.js';

/**
 * ADR-0064 — workspace classification (REQ-WORKSPACE-098..100), and the product's **one** answer to
 * "does this workspace contain code".
 *
 * **What this replaces, and why it is not a refinement of it.** The contains-code test that decided
 * whether symbols get indexed lived in `apps/desktop/src/run-host/mcp.ts` and matched against
 * `CODE_INTELLIGENCE_MANIFEST.extensions` — 152 suffixes generated from the bundled runtime's own
 * language-server coverage. REQ-WORKSPACE-099 fixes the set at **exactly 23**, overridable per
 * workspace, and says "the same set SHALL apply everywhere classification is decided"; REQ-WORKSPACE-091
 * binds the indexing and memory stages to "a workspace classified `non-code` (REQ-WORKSPACE-098)". So
 * the runtime's list was answering a question this domain owns. The manifest is not wrong for what it
 * is — it is the runtime's indexing coverage, generated and diff-checked by `pnpm package` — it is
 * simply not this set. Recorded as `docs/defects/fixed/classification-decided-by-the-runtimes-extension-list.md`.
 *
 * The two lists disagree on real trees in both directions: a workspace of `main.tf` and `deploy.sh`
 * is `code` under the manifest and `non-code` here.
 */
export const DEFAULT_SOURCE_EXTENSIONS: readonly string[] = Object.freeze([
  '.py', '.js', '.ts', '.jsx', '.tsx', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp',
  '.rb', '.php', '.swift', '.kt', '.scala', '.cs', '.fs', '.ex', '.exs', '.r', '.jl',
]);

/**
 * REQ-WORKSPACE-098: the only directory not descended into. **Not** `.hg` or `.svn`, which the
 * run host's walk also skipped: the requirement names `.git/` and nothing else, and a subversion
 * pristine store holds copies of the very files the verdict is about, so guessing wider here would
 * make the product and a conformance test disagree on a tree the requirement is explicit about.
 */
const NOT_DESCENDED = '.git';

export interface ClassifyOptions {
  /** Already normalized (lower-cased, leading dot). Defaults to REQ-WORKSPACE-099's 23. */
  readonly extensions?: readonly string[] | undefined;
}

/**
 * REQ-WORKSPACE-098: matching ignores letter case — the candidate's suffix is lower-cased before it
 * is compared against the already-lower-cased set, so `Main.PY` classifies its workspace as `code`.
 * A name that is all extension (`.gitignore`) has no extension: the dot must not be at index 0.
 */
export function extensionOf(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  return dot <= 0 ? null : fileName.slice(dot).toLowerCase();
}

/**
 * REQ-WORKSPACE-098: `code` when at least one file anywhere beneath the root carries an extension
 * from the set, `non-code` in every other case — an empty tree, a root that does not exist and a
 * documentation-only tree alike, none of which is an error.
 *
 * Breadth-first, so a large tree with source near the root answers quickly; no symbolic link is
 * followed at all, which is stricter than the requirement's "no link to a directory" and serves the
 * reason it gives — that files belonging to an unrelated tree can never decide this workspace.
 */
export function classifyWorkspace(root: string, options: ClassifyOptions = {}): WorkspaceClassification {
  const accepted = new Set(options.extensions ?? DEFAULT_SOURCE_EXTENSIONS);
  if (accepted.size === 0) return 'non-code';
  const rules = loadRules(root);
  const queue: string[] = [root];
  while (queue.length > 0) {
    const dir = queue.shift() as string;
    let entries: Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = join(dir, e.name);
      const rel = relative(root, full).split(sep).join('/');
      if (e.isDirectory()) {
        if (e.name === NOT_DESCENDED) continue;
        // Every ancestor was asked before this directory was queued, so the entry's own verdict decides.
        if (ignoredHere(rules, rel, true)) continue;
        queue.push(full);
        continue;
      }
      if (!e.isFile()) continue;
      const ext = extensionOf(e.name);
      if (ext === null || !accepted.has(ext)) continue;
      if (ignoredHere(rules, rel, false)) continue;
      return 'code';
    }
  }
  return 'non-code';
}

/**
 * The verdict for a workspace, reading its own `project_init.source_extensions` override
 * (REQ-WORKSPACE-099). One call, one reading — the recorded `classification` and the setup stages'
 * skip decision are the same value (REQ-WORKSPACE-087, REQ-WORKSPACE-091).
 */
export function classifyWorkspaceRoot(root: string, agentsFile: string): WorkspaceClassification {
  const override = sourceExtensionOverrideOf(readWorkspaceDocument(agentsFile));
  return classifyWorkspace(root, { ...(override === null ? {} : { extensions: override }) });
}
