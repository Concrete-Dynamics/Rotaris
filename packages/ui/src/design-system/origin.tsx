/**
 * Where a value comes from, as a glyph with its words (PD-CONFIG-012 clause 5): nothing for a built-in default. Moved here
 * from Settings for the money slider's preview (`docs/design/briefs/composer.md` §9), which marks a set lever outside Settings
 * and adds the fourth origin a session's own choice is (PD-ORCH-021 clause 2).
 */
export type ValueOrigin = 'workspace' | 'global' | 'yours' | 'fixed' | 'session' | 'default';
export const ORIGIN_WORDS: Readonly<Record<Exclude<ValueOrigin, 'default'>, { readonly glyph: string; readonly words: string }>> = {
  workspace: { glyph: 'ph-folder', words: 'Set for this workspace' },
  global: { glyph: 'ph-user', words: 'Set in your global configuration' },
  yours: { glyph: 'ph-user', words: 'Yours, kept on this machine' },
  fixed: { glyph: 'ph-lock', words: 'Fixed; it cannot be changed here' },
  session: { glyph: 'ph-chat-circle-text', words: 'Chosen for this session' },
};
export function Origin({ of, words }: { readonly of: ValueOrigin; readonly words?: string | undefined }) {
  if (of === 'default') return null;
  const mark = ORIGIN_WORDS[of];
  const said = words ?? mark.words;
  return <span className="settings__origin-mark" role="img" aria-label={said} title={said} data-origin={of} data-ui-component="Origin"><i className={`ph ${mark.glyph}`} aria-hidden="true" /></span>;
}
