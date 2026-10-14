import { useState } from 'react';
import { Button as DesignButton } from '../design-system/index.js';

/**
 * The About category (REQ-CONFIG-398, REQ-SHELL-138..143). It renders from **local data alone** — no network
 * request is made to draw it (REQ-SHELL-139) — and it opens with no workspace, no provider and no
 * authentication present, which is why the palette's shortcut-less "About & Legal" entry can reach it at any
 * time (REQ-SHELL-138, REQ-SHELL-049).
 *
 * Four sections: the product's identity, the legal documents, the licence, and the network-activity disclosure
 * (REQ-STARTUP-160). The five fixed strings
 * REQ-SHELL-140 and REQ-SHELL-142 state — publisher, security contact, licence, the base URL and the five
 * document paths — are held here as constants because the requirement fixes them literally; nothing composes
 * them from configuration.
 *
 * **Two values read from bundled assets, each with the absent branch its requirement defines.** The build identifier is
 * read from `build-id.txt` and is "treated as absent when missing or unreadable" (REQ-SHELL-140); the third-party notices
 * bundle is `THIRD-PARTY-LICENSES.txt` (REQ-SHELL-142). `pnpm package` writes both (`pnpm build-id`, `pnpm notices`) and
 * `electron-builder.yml` carries both (first-release-plan.md §4.4, 2026-09-27; main's reader is `apps/desktop/src/main/about.ts`).
 * The em dash and the absent caption therefore appear only where a file is missing: a development package made without
 * notices, or a source tree nobody has written them into. (Until 2026-10-13 this said no build carried either asset and that
 * producing them was owed to the packaging part, ADR-0054; that stopped being true on 2026-09-27.)
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
/**
 * REQ-STARTUP-160: the application's own statement of what it puts on the network, the three things the requirement has it
 * say, in the implementation's words. Static text in the bundle, so it reads with every outbound request blocked; it names
 * no host, endpoint or request the startup document does not require. The setup statement follows PD-STARTUP-006 (OQ-261,
 * ruled 2026-10-13 under R-072): it names the moments this build carries — a tool's first use — and names first-launch
 * machine setup, cache warm-up and the tool-archive hosts only in a build that carries REQ-STARTUP-060 onward or
 * REQ-STARTUP-064's warm-up; the change that builds either restores the matching words. Until 2026-10-14 it named all three
 * moments and the archive hosts, which this build never contacts.
 */
export const NETWORK_DISCLOSURE = {
  /**
   * PD-STARTUP-006 over REQ-STARTUP-160's first statement: a tool server's pinned package fetched by its package runner when
   * that server first starts (PD-STARTUP-005), and a language's server provisioned by the bundled code-intelligence runtime
   * at that language's first use (REQ-STARTUP-159, REQ-STARTUP-058's second list). No host is named.
   */
  setup: 'The first time a tool is needed, such as a tool server or a language\'s code intelligence, it may be downloaded from '
    + 'the package registry that serves it, and only when this machine does not already have it.',
  /** REQ-STARTUP-105, REQ-STARTUP-111, REQ-STARTUP-114. */
  updates: 'A supported standalone build asks the product\'s release endpoint whether a newer release exists, once each time one '
    + 'of its windows is activated. This check cannot be turned off.',
  /** REQ-STARTUP-160's third statement. */
  exposure: 'Like any connection, these requests can reveal ordinary connection metadata, such as your IP address, to the hosts '
    + 'they reach. They never carry your project files, your prompt text or your provider credentials.',
} as const;

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

      {/* REQ-STARTUP-160: present as delivered and read in place — no modal, interstitial, checkbox or hover reveals it, and
          it depends on no fact main supplies, so it draws before `info` arrives and with the network blocked. */}
      <section aria-labelledby="about-network-heading" data-testid="network-disclosure">
        <h2 className="settings__heading" id="about-network-heading">Network activity</h2>
        <p className="about__value" data-testid="network-disclosure-statement">{NETWORK_DISCLOSURE.setup}</p>
        <p className="about__value" data-testid="network-disclosure-statement">{NETWORK_DISCLOSURE.updates}</p>
        <p className="about__value" data-testid="network-disclosure-statement">{NETWORK_DISCLOSURE.exposure}</p>
      </section>
    </div>
  );
}
