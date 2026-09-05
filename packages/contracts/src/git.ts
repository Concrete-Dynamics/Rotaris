/**
 * REQ-GIT-009 and REQ-GIT-115 as pure functions, held here so the workspace service (which creates the branch)
 * and the renderer (which validates the dialog live, REQ-GIT-116) run the SAME rule set: the dialog accepts a
 * name exactly when creation would.
 */

/** REQ-GIT-009's normal form: trim, each space to `-`, each backslash to `/`. */
export function normalBranchForm(value: string): string {
  return value.trim().replace(/ /g, '-').replace(/\\/g, '/');
}

export type BranchCheck = { readonly ok: true; readonly name: string } | { readonly ok: false; readonly error: string; readonly detail: string };

/**
 * REQ-GIT-009: a derived name is transformed into normal form; a supplied one is accepted only when it already is
 * in normal form. The error quotes the value AS SUPPLIED; `detail` names the offending part where one can be
 * identified (REQ-GIT-116's dialog message) and is not part of the fixed error text.
 */
export function validateBranchName(value: string, options: { readonly derived: boolean }): BranchCheck {
  const refuse = (detail: string): BranchCheck => ({ ok: false, error: `Invalid Git branch name: ${value}`, detail });
  const normal = normalBranchForm(value);
  if (!options.derived && normal !== value) return refuse(value.trim() !== value ? 'has leading or trailing whitespace' : value.includes(' ') ? 'contains a space' : 'contains a backslash');
  if (normal === '') return refuse('is empty');
  if (normal === '@') return refuse("is exactly '@'");
  if (/^[-/.]/.test(normal)) return refuse(`starts with '${normal[0]}'`);
  if (normal.endsWith('.lock')) return refuse("ends with '.lock'");
  if (/[/.]$/.test(normal)) return refuse(`ends with '${normal[normal.length - 1]}'`);
  for (const part of ['//', '..', '@{']) if (normal.includes(part)) return refuse(`contains '${part}'`);
  if (/\s/.test(normal)) return refuse('contains whitespace');
  const bad = /[~^:?*[\\]/.exec(normal);
  if (bad) return refuse(`contains '${bad[0]}'`);
  for (const component of normal.split('/')) {
    if (component.startsWith('.')) return refuse(`has a path component starting with '.' (${component})`);
    if (component.endsWith('.lock')) return refuse(`has a path component ending with '.lock' (${component})`);
  }
  return { ok: true, name: normal };
}

/** The directory above a path, by text alone (the renderer has no path module); either separator, trailing ones ignored. */
export function parentDirectory(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return cut <= 0 ? trimmed : trimmed.slice(0, cut);
}

/** REQ-GIT-115: `<parent of the workspace directory>/<branch with each '/' replaced by '-'>`, joined with the workspace's own separator. */
export function derivedWorktreeDirectory(workspaceRoot: string, branch: string): string {
  const separator = workspaceRoot.includes('\\') && !workspaceRoot.includes('/') ? '\\' : '/';
  return `${parentDirectory(workspaceRoot)}${separator}${branch.replace(/\//g, '-')}`;
}
