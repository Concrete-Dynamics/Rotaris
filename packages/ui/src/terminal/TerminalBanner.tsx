import { SEVERITY_GLYPHS } from '@rotaris/contracts';
import { markMotionStart } from '../motion.js';
import type { BannerText } from './labels.js';
import { Button as DesignButton } from '../design-system/index.js';

/**
 * Part AM — the tab's one banner slot (REQ-SHELL-089/090/091/094: "each tab holds a single persistent banner
 * position, and the newest state replaces whatever occupied it"). Drawn as the design's notice pattern — a rule and
 * a glyph, never a filled background (design G1) — with the severity word in its accessible name (REQ-SHELL-149). Not
 * `NoticeBanner`, whose one action is REQ-SHELL-115's closed vocabulary; this banner's action arms take-control.
 */
const WORDS = { info: 'Notice', warning: 'Warning' } as const;

export interface TerminalBannerProps {
  readonly banner: BannerText;
  readonly onAction?: (() => void) | undefined;
}

export function TerminalBanner({ banner, onAction }: TerminalBannerProps) {
  const word = WORDS[banner.severity];
  return (
    <div
      ref={(element) => { if (element) markMotionStart(element); }}
      className={`notice notice--${banner.severity} term-banner`}
      role="status"
      aria-label={`${word}: ${banner.title}`}
      data-severity={banner.severity}
      data-testid="term-banner"
    >
      <span className="notice__glyph" aria-hidden="true">{SEVERITY_GLYPHS[banner.severity]}</span>
      <div className="notice__text">
        <span className="notice__headline" data-testid="term-banner-title">{banner.title}</span>
        <span className="notice__message text-secondary" data-testid="term-banner-body">{banner.body}</span>
      </div>
      {banner.action !== undefined && (
        <DesignButton type="button" className="btn btn-secondary btn-compact notice__action" onClick={onAction} data-testid="term-banner-action">{banner.action}</DesignButton>
      )}
    </div>
  );
}
