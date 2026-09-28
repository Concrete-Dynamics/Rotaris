import { z } from 'zod';

/**
 * REQ-STARTUP-058 / REQ-STARTUP-059 — the setup manifest a release ships: the schema of the one file
 * `apps/desktop/resources/setup-manifest.json`, which `electron-builder.yml` carries to the root of the artifact's
 * resources (first-release-plan.md §4.1, ADR-0054 "The setup manifest").
 *
 * Three lists, each pinned, none user-editable:
 *
 *  - `machineTools` — REQ-STARTUP-058's first list: per tool a probe (command and version arguments, REQ-STARTUP-063),
 *    an optional minimum version, the provisioned version, per-platform-key archives (REQ-STARTUP-060's keys; each an
 *    HTTPS URL, REQ-STARTUP-082; a 64-hex SHA-256; the archive layout — one of REQ-STARTUP-085's three formats and
 *    the top-level directory the entries sit under, or none; the expected executables REQ-STARTUP-086 requires in
 *    staging), the licence identifier, the upstream source (REQ-STARTUP-142's "source URL") and the user-facing
 *    capabilities the tool enables. Machine setup — the flow that reads this list (REQ-STARTUP-060 onward,
 *    REQ-MCP-112's setup half) — is not built; the list is what it will read.
 *  - `toolServerPackages` — "exact MCP package pins" (REQ-STARTUP-058): every package the built-in default tool-server
 *    configuration (`mcp/defaults.ts`) launches through `npx`/`uvx`, at the same version string character for
 *    character. The field name is the pre-build guard's reading (`tools/release-guard/src/pins.ts`); the guard compares
 *    it with `SHIPPED_MCP_SERVERS` and fails the stage on a disagreement (REQ-STARTUP-059, REQ-STARTUP-028).
 *  - `languageServers` — REQ-STARTUP-058's second list (ESC-32): the packages the bundled code-intelligence runtime
 *    installs for each language the release names, with the provisioner family. Its one source of truth is
 *    `apps/desktop/scripts/code-intelligence/pins.json`, which the bundle step checks against the runtime's own defaults
 *    (IC-7); `setup-manifest.test.ts` holds the shipped manifest's list equal to it, and to
 *    `CODE_INTELLIGENCE_LANGUAGE_SERVERS`, so the two files cannot drift.
 *
 * The schema is strict: a key it does not name refuses the file, so nothing rides in the manifest that the
 * fingerprint of REQ-STARTUP-061 (SHA-256 over the canonical JSON of the whole file) would then count. That is also why
 * the shipped file carries no `$comment`: a comment edit would make every installation set up again.
 *
 * Readings taken here and recorded: what "archive layout" comprises and what path the expected executables are relative
 * to (OQ-76); the four fields on a tool-server package, mirroring the language servers' (REQ-STARTUP-142's four).
 */

/** The file's name, at the root of `process.resourcesPath` in a packaged build and under `apps/desktop/resources/` in the source tree. */
export const SETUP_MANIFEST_FILE = 'setup-manifest.json' as const;
/** REQ-STARTUP-058: schema version 1. The pre-build guard reads the same number (`SETUP_MANIFEST_SCHEMA_VERSION` in `tools/release-guard`). */
export const SETUP_MANIFEST_SCHEMA_VERSION = 1 as const;
/**
 * REQ-STARTUP-060: the three platform keys, shared with artifact naming and updater asset selection. Their authority is
 * `PLATFORM_KEYS` in `tools/release-naming` (artifact naming and the updater read it); `config` has no edge to that
 * package, so this is a second literal, and `tools/release-guard/src/pins.test.ts` — the one package with both edges —
 * holds the two lists equal, order included, so neither can gain, lose or rename a key alone.
 *
 * REQ-STARTUP-060's raw `<os>-<machine>` fallback is read as a key a host may compute, never one a manifest archive is
 * written under: the schema refuses it, so a host whose key is a fallback finds no archive to select. What machine setup
 * then does is the consumer's, which is not built (ADR-0054, "The setup manifest — first execution").
 */
export const PLATFORM_KEYS = ['windows-x64', 'macos-arm64', 'linux-x86_64'] as const;
export type PlatformKey = (typeof PLATFORM_KEYS)[number];
/** REQ-STARTUP-085: the only archive formats extraction accepts. */
export const ARCHIVE_FORMATS = ['zip', 'tar.gz', 'tar.xz'] as const;
export type ArchiveFormat = (typeof ARCHIVE_FORMATS)[number];
/** REQ-STARTUP-058: the provisioner families the bundled runtime obtains a language server with. */
export const PROVISIONER_FAMILIES = ['npm', 'uvx'] as const;
export type ProvisionerFamily = (typeof PROVISIONER_FAMILIES)[number];

/**
 * REQ-STARTUP-059's discipline, shared with the pre-build guard: a complete version string — three numeric components
 * and an optional prerelease, post-release or build qualifier (`1.2.3`, `1.1.403`, `1.2.3-beta.1`, `1.2.3rc1`); never a
 * range (`^1.2.3`, `>=1`), a partial (`1.2`, `1.x`), an alias or a floating tag (`latest`), or a prefixed spec
 * (`npm:x@1.2.3`, `v1.2.3`). One character per repetition, so a long mistyped qualifier is refused at once rather than
 * backtracked over.
 */
export const COMPLETE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+.]?[0-9A-Za-z])*$/;
/** REQ-STARTUP-058: a 64-hex SHA-256, written in lower case. */
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const completeVersion = z.string().regex(COMPLETE_VERSION_PATTERN, 'a complete version string with no range, alias or floating tag (REQ-STARTUP-059)');
const nonEmpty = z.string().min(1);
/** REQ-STARTUP-082: tool archives require HTTPS; a source is held to the same. */
const httpsUrl = z.url({ protocol: /^https$/, hostname: z.regexes.domain, error: 'an https:// URL' });
/**
 * A path inside the archive, relative to its layout's top-level directory (or its root), in forward slashes, with no
 * absolute or `..` component — REQ-STARTUP-085 refuses those at extraction, so the manifest never names one.
 */
const archivePath = z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\0]+$/, 'a relative forward-slash path with no `..` component');
/** One directory name, not a path: the top-level directory an archive's entries sit under. */
const directoryName = z.string().regex(/^(?!\.\.?$)[^\\/\0]+$/, 'one directory name');

export const ArchiveSchema = z.strictObject({
  url: httpsUrl,
  sha256: z.string().regex(SHA256_PATTERN, 'a 64-hex SHA-256 digest in lower case'),
  layout: z.strictObject({
    format: z.enum(ARCHIVE_FORMATS),
    /** The one directory every entry sits under (ripgrep's archives), or null when entries sit at the archive root (MinGit). */
    topLevelDirectory: directoryName.nullable(),
  }),
  /** REQ-STARTUP-086: every one must exist in staging before promotion. */
  executables: z.array(archivePath).min(1),
});

export const MachineToolSchema = z.strictObject({
  name: nonEmpty,
  /** REQ-STARTUP-063: the command resolved on the managed-augmented PATH, and the arguments that make it print its version. */
  probe: z.strictObject({ command: nonEmpty, versionArguments: z.array(z.string()) }),
  /** REQ-STARTUP-063: null when any working installation is reused (Git). */
  minimumVersion: completeVersion.nullable(),
  provisionedVersion: completeVersion,
  archives: z.partialRecord(z.enum(PLATFORM_KEYS), ArchiveSchema).refine((a) => Object.keys(a).length > 0, 'at least one platform key'),
  source: httpsUrl,
  license: nonEmpty,
  /** REQ-STARTUP-058: the user-facing capabilities the tool enables; REQ-STARTUP-077 unions them into the degraded list. */
  capabilities: z.array(nonEmpty).min(1),
});

/** The four fields REQ-STARTUP-142 lists for a provisioned tool: name, version, source URL, licence identifier. */
export const PinnedPackageSchema = z.strictObject({
  name: nonEmpty,
  version: completeVersion,
  source: httpsUrl,
  license: nonEmpty,
});

export const LanguageServerSchema = z.strictObject({
  language: nonEmpty,
  provisioner: z.enum(PROVISIONER_FAMILIES),
  packages: z.array(PinnedPackageSchema).min(1),
});

function distinct<T>(items: readonly T[], key: (item: T) => string, what: string, ctx: z.RefinementCtx, path: (string | number)[]): void {
  const seen = new Map<string, number>();
  items.forEach((item, index) => {
    const k = key(item);
    const first = seen.get(k);
    if (first === undefined) seen.set(k, index);
    else ctx.addIssue({ code: 'custom', path: [...path, index], message: `${what} "${k}" is listed twice (first at ${path.join('.')}[${first}]); the manifest states exactly one entry per name (REQ-STARTUP-059)` });
  });
}

export const SetupManifestSchema = z.strictObject({
  schemaVersion: z.literal(SETUP_MANIFEST_SCHEMA_VERSION),
  machineTools: z.array(MachineToolSchema),
  toolServerPackages: z.array(PinnedPackageSchema),
  languageServers: z.array(LanguageServerSchema),
}).superRefine((manifest, ctx) => {
  distinct(manifest.machineTools, (t) => t.name, 'machine tool', ctx, ['machineTools']);
  distinct(manifest.toolServerPackages, (p) => p.name, 'tool-server package', ctx, ['toolServerPackages']);
  distinct(manifest.languageServers, (l) => l.language, 'language', ctx, ['languageServers']);
  manifest.languageServers.forEach((l, i) => distinct(l.packages, (p) => p.name, 'language-server package', ctx, ['languageServers', i, 'packages']));
});

export type SetupManifest = z.infer<typeof SetupManifestSchema>;
export type MachineTool = z.infer<typeof MachineToolSchema>;
export type ToolArchive = z.infer<typeof ArchiveSchema>;
export type PinnedPackage = z.infer<typeof PinnedPackageSchema>;
export type LanguageServer = z.infer<typeof LanguageServerSchema>;

export type SetupManifestReading =
  | { readonly ok: true; readonly manifest: SetupManifest }
  | { readonly ok: false; readonly problems: readonly string[] };

/**
 * Reads a manifest's text. Refuses, naming each problem by its JSON path, anything the schema does not accept: text that
 * is not JSON, a schema version other than 1, a missing list, a key the schema does not name, a version that is not a
 * pin, a digest that is not 64 hex characters, a URL that is not HTTPS, a name listed twice. A reader that accepted a
 * malformed manifest would set a machine up from it; REQ-STARTUP-143 fails a build whose manifest cannot be parsed.
 */
export function readSetupManifest(text: string): SetupManifestReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    return { ok: false, problems: [`the setup manifest is not JSON: ${cause instanceof Error ? cause.message : String(cause)}`] };
  }
  return parseSetupManifest(parsed);
}

/** `readSetupManifest` over an already-parsed value. */
export function parseSetupManifest(value: unknown): SetupManifestReading {
  const result = SetupManifestSchema.safeParse(value);
  if (result.success) return { ok: true, manifest: result.data };
  const problems = result.error.issues.map((issue) => `${issue.path.length === 0 ? '(root)' : issue.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`)).join('').replace(/^\./, '')}: ${issue.message}`);
  return { ok: false, problems };
}
