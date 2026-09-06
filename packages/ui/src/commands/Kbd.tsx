import { detectPlatform, formatChord, platformKeys, type KeyboardPlatform } from './registry.js';

/**
 * REQ-SHELL-057 — a written chord drawn as keycaps (design G13's primitive: the design system's `.kbd` / `.kbd-seq`,
 * small monospace inside a hairline). The chord is split on `+`, a trailing `++` is the plus key; each key is its own
 * keycap; the wrapper carries the WHOLE written sequence as one accessible name and the keycaps are hidden from
 * assistive technology, so a three-key chord is never announced as three labels. Key names are the host's own —
 * `Ctrl` on Windows and Linux, the command symbol on macOS — by `platform`, read from `navigator.platform` by default.
 * A sequence that cannot be parsed is displayed verbatim.
 */
export interface KbdProps {
  readonly chord: string;
  readonly platform?: KeyboardPlatform | undefined;
  readonly className?: string | undefined;
}

export function Kbd({ chord, platform = detectPlatform(), className }: KbdProps) {
  const keys = platformKeys(chord, platform);
  const classes = className ? `kbd-seq ${className}` : 'kbd-seq';
  if (keys === null) return <span className={classes} data-chord={chord}>{chord}</span>;
  return (
    <span className={classes} role="img" aria-label={formatChord(chord, platform)} data-chord={chord}>
      {keys.map((k, i) => <kbd key={`${k}-${i}`} className="kbd" aria-hidden="true">{k}</kbd>)}
    </span>
  );
}
