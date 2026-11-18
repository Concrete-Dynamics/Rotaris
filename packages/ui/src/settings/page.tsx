import { createContext, useContext, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Button as DesignButton } from '../design-system/index.js';

/**
 * PD-CONFIG-012 (R-105): what a Settings page tells the parts drawn on it.
 *
 * `title` — a part drawn alone is the page, so the page's own title stands for it (`solo`); a part drawn beside others
 * heads itself one level down (`section`). With no page around it (a test, a part mounted alone) a part keeps the
 * first-level title it always had.
 *
 * `explain` — the page's "show every explanation" switch. A row's explanation is closed until its own control or this
 * switch opens it; it stays in the document either way, so an `aria-describedby` that names it still resolves.
 */
export interface SettingsPageState {
  readonly title: 'page' | 'solo' | 'section';
  readonly explain: boolean;
}
export const SettingsPageContext = createContext<SettingsPageState>({ title: 'page', explain: true });

/** A part's own title: the view's title when nothing stands around the part, a section's heading on a shared page, nothing on a page it has alone. */
export function SettingsTitle({ children }: { readonly children: ReactNode }) {
  const { title } = useContext(SettingsPageContext);
  if (title === 'solo') return null;
  if (title === 'section') return <h2 className="settings__subtitle">{children}</h2>;
  return <h1 className="display">{children}</h1>;
}

/**
 * A row's explanation, behind its control (PD-CONFIG-012 clause 4). The control is a button of the design system
 * carrying the information glyph; it says in words what it opens, and whether it is open (`aria-expanded`). The text is
 * the same element it always was — same classes, same attributes — hidden while closed.
 */
export function Hint({ about, always = false, children, className, ...rest }: HTMLAttributes<HTMLSpanElement> & { readonly about?: string; /** What an act does to the user's data is never closed. */ readonly always?: boolean }) {
  const { explain } = useContext(SettingsPageContext);
  const [open, setOpen] = useState(false);
  // The class stands first, as it did when the element was written out: tests and proofs read the attributes in that order.
  if (always) return <span className={className ?? 'text-secondary settings__hint'} {...rest}>{children}</span>;
  const shown = explain || open;
  const name = about === undefined ? 'Explanation' : `Explanation of ${about}`;
  return (
    <>
      <DesignButton type="button" className="btn btn-ghost btn-icon settings__info" aria-label={name} title={name} aria-expanded={shown} aria-pressed={shown} disabled={explain} onClick={() => setOpen((v) => !v)}>
        <i className="ph ph-info" aria-hidden="true" />
      </DesignButton>
      <span className={className ?? 'text-secondary settings__hint'} {...rest} hidden={!shown}>{children}</span>
    </>
  );
}

/** Where a value comes from, as a glyph with its words (PD-CONFIG-012 clause 5): nothing for a built-in default. */
export type ValueOrigin = 'workspace' | 'global' | 'yours' | 'fixed' | 'default';
const ORIGIN: Readonly<Record<Exclude<ValueOrigin, 'default'>, { readonly glyph: string; readonly words: string }>> = {
  workspace: { glyph: 'ph-folder', words: 'Set for this workspace' },
  global: { glyph: 'ph-user', words: 'Set in your global configuration' },
  yours: { glyph: 'ph-user', words: 'Yours, kept on this machine' },
  fixed: { glyph: 'ph-lock', words: 'Fixed; it cannot be changed here' },
};
export function Origin({ of }: { readonly of: ValueOrigin }) {
  if (of === 'default') return null;
  const { glyph, words } = ORIGIN[of];
  return <span className="settings__origin-mark" role="img" aria-label={words} title={words} data-origin={of}><i className={`ph ${glyph}`} aria-hidden="true" /></span>;
}
