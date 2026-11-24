import { useEffect, useId, useState } from 'react';
import type { Theme, ThemeName } from '@rotaris/contracts';
import { Button as DesignButton } from './design-system/index.js';

export interface ThemeChoiceDialogProps {
  readonly themes: readonly Theme[];
  readonly activeTheme: ThemeName;
  /** Applies a theme at once, so the dialog previews the choice on the real window. */
  readonly onTheme: (name: ThemeName) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Called once, by Continue or by dismissal. The host stores that the dialog was shown. */
  readonly onDone: () => void;
}

/** The first-launch theme choice. Picking a card applies the theme live. Continue or Escape keeps it and closes. */
export function ThemeChoiceDialog({ themes, activeTheme, onTheme, onDone }: ThemeChoiceDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onDone(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);
  const choose = async (name: ThemeName) => {
    const result = await onTheme(name);
    setMessage(result.ok ? null : result.reason);
  };
  return (
    <div className="dialog-backdrop theme-choice__backdrop" role="presentation">
      <div className="dialog theme-choice" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} data-testid="theme-choice-dialog">
        <h2 id={titleId} className="dialog-title">Choose your theme</h2>
        <p id={bodyId} className="dialog-body">Pick the look you want. The window changes at once. You can change it later in Settings › Appearance.</p>
        <div className="theme-choice__options" role="radiogroup" aria-label="Theme">
          {themes.map((theme) => (
            <DesignButton
              key={theme.name}
              type="button"
              role="radio"
              aria-checked={theme.name === activeTheme}
              className={`theme-choice__option${theme.name === activeTheme ? ' is-selected' : ''}`}
              data-theme-option={theme.name}
              onClick={() => { void choose(theme.name); }}
            >
              <span className="theme-choice__name">{theme.label}</span>
              <span className="theme-choice__description">{theme.description}</span>
            </DesignButton>
          ))}
        </div>
        {message && <div className="composer__error" role="alert">{message}</div>}
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-primary" autoFocus onClick={onDone}>Continue</DesignButton>
        </div>
      </div>
    </div>
  );
}
