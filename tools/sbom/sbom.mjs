// @ts-check
/**
 * The release's Software Bill of Materials (R-091; `docs/architecture/hardening.md` §3.5 row 10, bundle G2): a
 * CycloneDX JSON document of the production dependency tree a release of the desktop application ships.
 *
 * The tree is pnpm's own reading (`pnpm -r sbom --sbom-format cyclonedx --prod`, pnpm 11): the union of every workspace
 * package's `dependencies`, read from the lockfile and the store. `@cyclonedx/cyclonedx-npm` was the brief's first
 * choice and is not used: it reads npm's `package-lock.json` or `npm ls`, and this workspace has neither, so pnpm's
 * command reads the same lockfile the install does and needs no further dependency.
 *
 * Two corrections are made to pnpm's document, and nothing else is changed in it:
 * - the root component is the product — `Rotaris` at the release's version — rather than the workspace root
 *   (`rotaris-crw@0.0.0`), and every dependency edge the workspace root held is moved to it;
 * - Electron is added as a component the root depends on. It is the runtime every packaged build ships, yet it is a
 *   `devDependency` of `apps/desktop` (electron-builder's convention), so `--prod` leaves it out — the same blind spot
 *   `docs/architecture/dependency-alerts/2026-11-01-audit-gate.md` §3 records for the production audit. Its version is
 *   the installed one, the one `pnpm package` puts in the installer.
 *
 * Whether this file is published beside the release's artifacts is OQ-487: REQ-STARTUP-031, REQ-STARTUP-036 and
 * REQ-STARTUP-152 close the set of assets a release publishes, and this file is not in it. Until that is ruled the release
 * workflow keeps it as a workflow artifact of the build job, outside the release directory and its `SHA256SUMS.txt`.
 */

/** The SBOM's file name for a release of `version`: `Rotaris-<version>-sbom.cdx.json`. */
export function sbomName(version) {
  if (typeof version !== 'string' || version.length === 0 || /[\\/\s]/.test(version)) {
    throw new Error(`"${String(version)}" is not a version an SBOM can be named for`);
  }
  return `Rotaris-${version}-sbom.cdx.json`;
}

/** The product's reference inside the document. */
export function productRef(version) {
  return `pkg:github/Concrete-Dynamics/Rotaris@v${version}`;
}

/**
 * pnpm's CycloneDX document of the workspace, made the release's: the product as the root, Electron added beside the
 * production dependencies. Refuses a document that is not CycloneDX or has no root to replace, with the reason.
 *
 * @param {any} bom pnpm's document, parsed
 * @param {{ version: string, electronVersion: string, license?: string }} release
 * @returns {any}
 */
export function composeReleaseSbom(bom, release) {
  if (bom === null || typeof bom !== 'object' || bom.bomFormat !== 'CycloneDX') {
    throw new Error('the document pnpm wrote is not CycloneDX (bomFormat)');
  }
  const oldRoot = bom.metadata?.component?.['bom-ref'];
  if (typeof oldRoot !== 'string') throw new Error('the document pnpm wrote names no root component (metadata.component.bom-ref)');
  if (!/^\d+\.\d+\.\d+/.test(release.electronVersion ?? '')) {
    throw new Error(`"${String(release.electronVersion)}" is not an Electron version`);
  }
  sbomName(release.version);

  const root = productRef(release.version);
  const electronRef = `pkg:npm/electron@${release.electronVersion}`;
  /** @type {any[]} */
  const components = (Array.isArray(bom.components) ? bom.components : []).filter((c) => c?.['bom-ref'] !== oldRoot);
  if (!components.some((c) => c?.['bom-ref'] === electronRef)) {
    components.push({
      type: 'framework',
      name: 'electron',
      version: release.electronVersion,
      purl: electronRef,
      'bom-ref': electronRef,
      description: 'The runtime every packaged build ships; a devDependency of apps/desktop, so added here by tools/sbom.',
      licenses: [{ license: { id: 'MIT' } }],
    });
  }

  /** @type {Array<{ ref: string, dependsOn?: string[] }>} */
  const dependencies = (Array.isArray(bom.dependencies) ? bom.dependencies : []).map((d) =>
    d.ref === oldRoot ? { ...d, ref: root } : { ...d, dependsOn: (d.dependsOn ?? []).map((r) => (r === oldRoot ? root : r)) },
  );
  let rootEdges = dependencies.find((d) => d.ref === root);
  if (!rootEdges) {
    rootEdges = { ref: root, dependsOn: [] };
    dependencies.unshift(rootEdges);
  }
  rootEdges.dependsOn = [...new Set([...(rootEdges.dependsOn ?? []), electronRef])];
  if (!dependencies.some((d) => d.ref === electronRef)) dependencies.push({ ref: electronRef, dependsOn: [] });

  return {
    ...bom,
    metadata: {
      ...bom.metadata,
      component: {
        type: 'application',
        name: 'Rotaris',
        version: release.version,
        purl: root,
        'bom-ref': root,
        ...(release.license ? { licenses: [{ license: { id: release.license } }] } : {}),
        externalReferences: [{ type: 'vcs', url: 'https://github.com/Concrete-Dynamics/Rotaris' }],
      },
    },
    components,
    dependencies,
  };
}
