import { raiseLightness, themeCustomProperties, type Theme } from '@rotaris/contracts';

/** Project one complete theme onto a document root in one synchronous style update. */
export function applyTheme(theme: Theme, root: HTMLElement): void {
  for (const [name, value] of Object.entries(themeCustomProperties(theme))) root.style.setProperty(name, value);
  root.dataset['theme'] = theme.name;
  root.dataset['dark'] = String(theme.dark);
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
}

/** REQ-SHELL-134's one correction path for persona shades and chips. */
export function deriveShade(base: string, background: string, floor = 4.5): string { return raiseLightness(base, floor, background); }

export function assertDistinctRoleColours(colours: readonly string[]): void {
  if (colours.length !== 4 || new Set(colours).size !== 4) throw new Error('The four slash-role colours must be pairwise distinct');
}
