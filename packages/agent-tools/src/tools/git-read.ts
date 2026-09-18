import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { isInside, realPathOf } from './fence.js';
import { errorObservation, observation, type ToolExecutor } from './types.js';

/**
 * The repository-identity tool (REQ-TOOLS-193, OQ-61): `git_read` answers what commit and branch the
 * calling run's worktree sits on, without spawning a process and without reading the working tree.
 * A linked worktree's `.git` is a file holding a `gitdir:` pointer, so HEAD, the refs and the
 * worktree's own administrative directory live above the path fence in the base repository — which
 * is why the file tools must keep refusing them and this tool exists at all.
 *
 * Its confinement is its own whitelist, not the fence: resolution follows the `gitdir:` pointer to
 * the git directory and its `commondir`, and reads exactly `HEAD`, loose refs and `packed-refs`.
 * Configuration, hooks, objects, the index and logs are never readable (configuration may carry
 * credentials), and any other repository path is refused. No subprocess is spawned and no command is
 * run, so the tool declares reading and neither writing nor running.
 */
const OPERATIONS = ['head', 'read_ref'] as const;

const gitReadSchema = z.object({
  operation: z.enum(OPERATIONS),
  /** `read_ref` resolves `refs/heads/<ref>`; a branch name, never a path. */
  ref: z.string().optional(),
});

const unsupported = (op: string): string => `Unsupported operation: ${op}. The operations are ${OPERATIONS.join(', ')}.`;

interface GitDirs { readonly gitdir: string; readonly commondir: string }

function readFirstLine(path: string): string | null {
  try {
    return readFileSync(path, 'utf8').split('\n')[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

/** REQ-TOOLS-193: resolve the worktree root to its git directory and common directory, or refuse. */
function resolveGitDirs(workspaceRoot: string): GitDirs | { error: string } {
  const rootReal = realPathOf(workspaceRoot);
  const dotGit = join(rootReal, '.git');
  let gitdir: string;
  try {
    if (!existsSync(dotGit)) return { error: `Not a git repository: ${workspaceRoot}.` };
    if (statSync(dotGit).isDirectory()) {
      gitdir = dotGit;
    } else {
      const pointer = readFirstLine(dotGit);
      if (pointer === null || !pointer.startsWith('gitdir: ')) return { error: `Not a git repository: ${workspaceRoot}.` };
      const target = resolve(rootReal, pointer.slice('gitdir: '.length).trim());
      if (!existsSync(target) || !statSync(target).isDirectory()) return { error: `Not a git repository: ${workspaceRoot}.` };
      gitdir = realPathOf(target);
    }
  } catch {
    return { error: `Not a git repository: ${workspaceRoot}.` };
  }
  const commonPointer = readFirstLine(join(gitdir, 'commondir'));
  const commondir = commonPointer !== null && commonPointer !== '' && existsSync(resolve(gitdir, commonPointer)) && statSync(resolve(gitdir, commonPointer)).isDirectory()
    ? realPathOf(resolve(gitdir, commonPointer))
    : gitdir;
  return { gitdir, commondir };
}

const SHA = /^[0-9a-f]{4,64}$/i;

/** A whitelisted metadata read: `rel` is `HEAD`, a loose ref, or `packed-refs`, under one of the two dirs. */
function readMeta(dirs: GitDirs, dir: 'gitdir' | 'commondir', rel: string): string | null {
  const base = dir === 'gitdir' ? dirs.gitdir : dirs.commondir;
  if (rel !== 'HEAD' && rel !== 'packed-refs' && !rel.startsWith('refs/')) return null;
  if (rel.includes('\0')) return null;
  const candidate = realPathOf(join(base, rel));
  if (!isInside(base, candidate)) return null;
  return readFirstLine(candidate);
}

function packedLines(dirs: GitDirs, dir: 'gitdir' | 'commondir'): string[] {
  const base = dir === 'gitdir' ? dirs.gitdir : dirs.commondir;
  try {
    return readFileSync(join(base, 'packed-refs'), 'utf8').split('\n');
  } catch {
    return [];
  }
}

function searchPacked(dirs: GitDirs, ref: string): string | null {
  for (const dir of ['gitdir', 'commondir'] as const) {
    for (const line of packedLines(dirs, dir)) {
      if (line.startsWith('#') || line.startsWith('^')) continue;
      const [sha, name] = line.split(' ');
      if (name === ref && sha !== undefined && SHA.test(sha)) return sha.toLowerCase();
    }
  }
  return null;
}

/** Resolve a ref name to a commit SHA, following symbolic refs (bounded) and then packed refs. */
function resolveRef(dirs: GitDirs, ref: string, depth = 0): string | null {
  if (depth > 5) return null;
  for (const dir of ['gitdir', 'commondir'] as const) {
    const line = readMeta(dirs, dir, ref);
    if (line === null) continue;
    if (line.startsWith('ref: ')) {
      const target = line.slice('ref: '.length).trim();
      if (!target.startsWith('refs/')) return null;
      return resolveRef(dirs, target, depth + 1);
    }
    if (SHA.test(line)) return line.toLowerCase();
    return null;
  }
  return searchPacked(dirs, ref);
}

/** REQ-TOOLS-193: a branch name, never a path — traversal and pointer syntax are unresolvable names. */
function validBranchName(ref: string): boolean {
  if (ref === '' || ref.startsWith('/') || ref.startsWith('-') || ref.includes('..') || ref.includes('@{') || ref.includes('\0') || /[\s~^:?*[\]\\]/.test(ref)) return false;
  return /^[A-Za-z0-9._/-]+$/.test(ref);
}

export function gitReadTool(workspaceRoot: string): ToolExecutor<z.infer<typeof gitReadSchema>> {
  return {
    name: 'git_read',
    description: 'Read repository identity for the worktree this run occupies: the HEAD commit and branch, or a named branch ref. Reads git metadata only — configuration, hooks, objects, the index and logs are never readable.',
    schema: gitReadSchema,
    label: (a) => (a.operation === 'read_ref' && a.ref !== undefined ? `git_read read_ref ${a.ref}` : 'git_read head'),
    execute: async (a) => {
      const dirs = resolveGitDirs(workspaceRoot);
      if ('error' in dirs) return errorObservation(dirs.error);
      try {
        if (a.operation === 'head') {
          const head = readMeta(dirs, 'gitdir', 'HEAD');
          if (head === null) return errorObservation(`Could not resolve HEAD in ${workspaceRoot}.`);
          if (head.startsWith('ref: ')) {
            const branch = head.slice('ref: '.length).trim().replace(/^refs\/heads\//, '');
            const commit = resolveRef(dirs, head.slice('ref: '.length).trim());
            if (commit === null) return errorObservation(`Could not resolve HEAD in ${workspaceRoot}.`);
            return observation(`commit: ${commit}\nbranch: ${branch}`);
          }
          if (!SHA.test(head)) return errorObservation(`Could not resolve HEAD in ${workspaceRoot}.`);
          return observation(`commit: ${head.toLowerCase()}\ndetached: true`);
        }
        if (a.operation === 'read_ref') {
          const name = a.ref ?? '';
          if (!validBranchName(name)) return errorObservation(`Unknown ref: ${name}.`);
          const commit = resolveRef(dirs, `refs/heads/${name}`);
          if (commit === null) return errorObservation(`Unknown ref: ${name}.`);
          return observation(`ref ${name} is ${commit}.`);
        }
        // Unreachable through the gate — the schema refuses an operation outside the two before
        // `execute` is called, and `validationError` answers it in REQ-TOOLS-193's words.
        return errorObservation(unsupported(String(a.operation)));
      } catch (cause) {
        return errorObservation(`Could not read git metadata in ${workspaceRoot}: ${String(cause instanceof Error ? cause.message : cause)}`);
      }
    },
    /**
     * REQ-TOOLS-193's mandated refusals, raised where the arguments are now refused: at the schema.
     * Anything else the schema rejects keeps the gate's own detail.
     */
    validationError: (args, detail) => {
      const op = args['operation'];
      if (typeof op === 'string' && !(OPERATIONS as readonly string[]).includes(op)) return errorObservation(unsupported(op));
      if (typeof op !== 'string') return errorObservation(`git_read requires an operation: one of ${OPERATIONS.join(', ')}.`);
      if (op === 'read_ref' && typeof args['ref'] !== 'string') return errorObservation(`read_ref requires a branch name in 'ref' (${detail}).`);
      return errorObservation(`The arguments for '${op}' do not match the git_read schema (${detail}).`);
    },
  };
}
