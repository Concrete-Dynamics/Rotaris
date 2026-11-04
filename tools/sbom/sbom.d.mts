// The types for `sbom.mjs`. That module is plain JavaScript on purpose — its caller is `pnpm sbom:write` in the release
// workflow's build job — so its contract is declared here for the tests beside it (R-091; PD-STARTUP-012).

/** PD-STARTUP-012: the release naming authority's own `sbomName`, re-exported — `Rotaris-<version>-<platform>-sbom.cdx.json`. */
export { sbomName } from '@rotaris/release-naming';
/** The product's reference inside the document: `pkg:github/Concrete-Dynamics/Rotaris@v<version>`. */
export declare function productRef(version: string): string;
/** pnpm's CycloneDX document of the workspace, its root made the product and Electron added; refuses a malformed one. */
export declare function composeReleaseSbom(
  bom: unknown,
  release: { version: string; electronVersion: string; license?: string },
): {
  bomFormat: 'CycloneDX';
  specVersion: string;
  metadata: { component: { name: string; version: string; 'bom-ref': string; type: string; licenses?: unknown[] } } & Record<string, unknown>;
  components: Array<{ name: string; version: string; 'bom-ref': string; type: string; group?: string }>;
  dependencies: Array<{ ref: string; dependsOn?: string[] }>;
} & Record<string, unknown>;
