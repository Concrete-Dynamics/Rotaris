/**
 * PD-WORKSPACE-005's naming rule, shared by every application notice that names the project it is about: the project-setup
 * banners (`initialization.ts`) and, since OQ-293 (ruled 2026-10-14 under R-072), the unreviewed-hooks notice
 * (`hooks-review-notice.ts`). Moved here from `initialization.ts` unchanged.
 */

/**
 * PD-WORKSPACE-005 (OQ-171, ruled 2026-10-06 under R-071): an initialization banner is an application notice, shown in every
 * open window (ADR-0049's one notice store), so it names the project it is about. The project's name is its folder's — the
 * root's last path segment, either separator — and the root itself where it has none (a drive or filesystem root). A
 * Windows drive designator (`C:` of `C:\`) is not a segment, so a drive root reads `C:\`, never the bare letter.
 */
export function projectNameOf(root: string): string {
  const trimmed = root.replace(/[\\/]+$/u, '');
  const name = trimmed.split(/[\\/]/u).pop() ?? '';
  return name === '' || /^[A-Za-z]:$/u.test(name) ? root : name;
}

/**
 * PD-WORKSPACE-005: the banner's title is the requirement's headline followed by the project's name, `{headline}: {name}`,
 * and its detail area (REQ-NOTIFY-005) starts with the project's folder, which tells two projects of one name apart.
 */
export function namedBanner(root: string, headline: string, detail: string): { readonly headline: string; readonly detail: string } {
  const folder = `Project folder: ${root}`;
  return { headline: `${headline}: ${projectNameOf(root)}`, detail: detail === '' ? folder : `${folder}\n\n${detail}` };
}
