// The types for `sbom.mjs`. That module is plain JavaScript on purpose — its caller is `pnpm sbom:write` in the release
// workflow's build job — so its contract is declared here for the tests beside it (R-091; OQ-487).

/** `Rotaris-<version>-sbom.cdx.json`; refuses an empty version or one holding a path separator or a space. */
export declare function sbomName(version: string): string;
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
