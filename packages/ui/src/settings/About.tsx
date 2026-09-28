import { useState } from 'react';
import { Button as DesignButton } from '../design-system/index.js';

/**
 * The About category (REQ-CONFIG-398, REQ-SHELL-138..143). It renders from **local data alone** — no network
 * request is made to draw it (REQ-SHELL-139) — and it opens with no workspace, no provider and no
 * authentication present, which is why the palette's shortcut-less "About & Legal" entry can reach it at any
 * time (REQ-SHELL-138, REQ-SHELL-049).
 *
 * Three cards: the product's identity, the legal documents, and the licence. The five fixed strings
 * REQ-SHELL-140 and REQ-SHELL-142 state — publisher, security contact, licence, the base URL and the five
 * document paths — are held here as constants because the requirement fixes them literally; nothing composes
 * them from configuration.
 *
 * **Two values this build cannot supply, on the branch each requirement defines.** The build identifier is read
 * from a bundled text asset and is "treated as absent when missing or unreadable" (REQ-SHELL-140) — no build
 * asset carries one yet, so the row shows the em dash. The third-party notices bundle is not produced by
 * `pnpm package` either, so REQ-SHELL-142's caption states that this build does not carry one. Both are the
 * requirements' own branches rather than gaps in this surface; producing the two assets is owed to the
 * packaging part (ADR-0054).
 */

/** REQ-SHELL-140: fixed values, stated by the requirement rather than configured. */
export const PUBLISHER = 'Concrete Dynamics UG (haftungsbeschränkt)';
export const SECURITY_CONTACT = 'security@concrete-dynamics.com';
export const PRODUCT_LICENCE = 'GPL-3.0-only';
/** REQ-SHELL-141: the five documents, in order, under one base. */
export const LEGAL_BASE = 'https://rotaris.ai';
export const LEGAL_DOCUMENTS: readonly { readonly name: string; readonly path: string }[] = [
  { name: 'Privacy Policy', path: '/privacy' },
  { name: 'EULA', path: '/eula' },
  { name: 'Terms / AGB', path: '/terms' },
  { name: 'Acceptable Use Policy', path: '/acceptable-use' },
  { name: 'Withdrawal / Widerrufsbelehrung', path: '/widerruf' },
];
/** REQ-SHELL-142: the caption when no notices file is bundled with the build. */
export const NO_THIRD_PARTY_BUNDLE = 'This build does not carry a third-party license bundle.';

export interface AboutInfo {
  readonly version: string;
  /** REQ-SHELL-140: absent when the bundled asset is missing or unreadable. */
  readonly build: string | null;
  /** REQ-SHELL-140: "Standalone build" for a frozen build, "Package installation" otherwise. */
  readonly standalone: boolean;
  /** REQ-SHELL-142: whether a notices file is bundled with this build. */
  readonly thirdPartyLicenses: boolean;
}

type Outcome = { ok: true } | { ok: false; reason: string };

export interface AboutSettingsProps {
  readonly info: AboutInfo | null;
  readonly onOpenExternal: (url: string) => Promise<Outcome>;
  readonly onOpenThirdPartyLicenses: () => Promise<Outcome>;
}

function Row({ name, value }: { name: string; value: string }) {
  return (
    <div className="settings__action" data-testid="about-row" data-name={name} data-value={value}>
      <span>{name}</span>
      {/* REQ-SHELL-140: selectable, and announced as "{name}: {value}". */}
      <span className="about__value" aria-label={`${name}: ${value}`}>{value}</span>
    </div>
  );
}

export function AboutSettings({ info, onOpenExternal, onOpenThirdPartyLicenses }: AboutSettingsProps) {
  // REQ-SHELL-141: one caption at a time, and a later success hides whatever the last failure said.
  const [linkError, setLinkError] = useState<string | null>(null);
  const [noticesError, setNoticesError] = useState<string | null>(null);

  const open = async (name: string, url: string) => {
    const r = await onOpenExternal(url);
    setLinkError(r.ok ? null : `Could not open a browser for ${name} (${url}).`);
  };
  const openNotices = async () => {
    const r = await onOpenThirdPartyLicenses();
    setNoticesError(r.ok ? null : 'Could not open the third-party license bundle.');
  };

  return (
    <div className="settings__section">
      <h1 className="display">About</h1>

      <h2 className="settings__heading">Product</h2>
      <Row name="Version" value={info ? `v${info.version}` : 'v—'} />
      {/* REQ-SHELL-140: an em dash where the bundled build asset is absent or unreadable. */}
      <Row name="Build" value={info?.build ?? '—'} />
      <Row name="Installation" value={info?.standalone ? 'Standalone build' : 'Package installation'} />
      <Row name="Publisher" value={PUBLISHER} />
      <Row name="Security contact" value={SECURITY_CONTACT} />

      <h2 className="settings__heading">Legal documents</h2>
      <div className="about__links">
        {LEGAL_DOCUMENTS.map(({ name, path }) => {
          const url = `${LEGAL_BASE}${path}`;
          return (
            <DesignButton
              key={path}
              type="button"
              className="btn btn-link"
              data-testid="legal-link"
              data-url={url}
              aria-label={`Open ${name}`}
              aria-description={`Opens ${url} in the system browser.`}
              onClick={() => { void open(name, url); }}
            >
              {name}
            </DesignButton>
          );
        })}
      </div>
      {linkError && <p className="composer__error" role="alert" data-testid="legal-error">{linkError}</p>}

      <h2 className="settings__heading">Licensing</h2>
      <p className="about__value">Rotaris is licensed under the {PRODUCT_LICENCE} License.</p>
      <DesignButton
        type="button"
        className="btn btn-secondary"
        data-testid="licenses-open"
        aria-label="Open third-party licenses"
        aria-description="Opens the third-party license bundle shipped with this build."
        onClick={() => { void openNotices(); }}
      >
        Open third-party licenses
      </DesignButton>
      {/* The control stays reachable whether or not a bundle exists (REQ-SHELL-143); the caption says which it is. It is
          secondary text at the licence line's own scale (`.about__caption`): `text-secondary` alone sets a colour and left
          it in the browser's default size, the largest text on the page (docs/design/README.md §2, §7; repaired 2026-09-28). */}
      {info !== null && !info.thirdPartyLicenses && <p className="about__caption" data-testid="licenses-caption">{NO_THIRD_PARTY_BUNDLE}</p>}
      {noticesError && <p className="composer__error" role="alert" data-testid="licenses-error">{noticesError}</p>}
    </div>
  );
}
