// The types for `notices.mjs`. That module is plain JavaScript on purpose — its callers are `pnpm notices` and the
// release job, neither of which compiles TypeScript — so its contract is declared here for the tests beside it
// (REQ-STARTUP-141, REQ-STARTUP-142, REQ-STARTUP-143, REQ-STARTUP-149).

/** REQ-STARTUP-141: `THIRD-PARTY-LICENSES.txt`. */
export declare const NOTICES_FILE: string;
/** REQ-STARTUP-142: `Tools provisioned after installation`. */
export declare const TOOLS_SECTION: string;
/** REQ-STARTUP-143: a reviewed exception expires at most this many days after its review. */
export declare const MAX_EXCEPTION_DAYS: number;
/** Every input and the output, relative to the repository root. */
export declare const PATHS: Readonly<{
  desktop: string; output: string; runtime: string; bundleMarker: string; setupManifest: string; codeIntelligencePins: string; fontFaces: string;
  designAssets: string; electron: string; assets: string; exceptions: string; releaseInputs: string;
}>;

/** A licence text as the notices file reproduces it: no byte-order mark, LF line endings, no leading blank line, no trailing space. */
export declare function normalize(text: string): string;

/** OQ-75: only `text` is the component's licence text; a `reference` or an `attribution` is reproduced beside it. */
export type LicenseTextKind = 'text' | 'reference' | 'attribution';
export interface LicenseText { readonly file: string; readonly text: string; readonly kind?: LicenseTextKind }
export interface ReviewedException {
  readonly component: string; readonly versions: string; readonly license: string; readonly whyNoText: string;
  readonly reviewer: string; readonly reviewedOn: string; readonly expires: string;
}
export interface Component {
  readonly section: 'application' | 'runtime' | 'assets';
  readonly ecosystem: 'npm' | 'compiled' | 'interpreter' | 'python' | 'asset';
  readonly name: string;
  readonly version: string | null;
  readonly license: string | null;
  texts: LicenseText[];
  readonly containedIn?: string;
  readonly files?: readonly string[];
  readonly textRequired?: boolean;
  exception?: ReviewedException;
}
export interface Credit { readonly title: string; readonly homepage: string | null; readonly text: string }
export interface ElectronComponent extends Component { readonly credits: readonly Credit[] }
export interface ProvisionedPackage { readonly language: string; readonly provisioner?: string; readonly name: string; readonly version: string; readonly source: string; readonly license: string }
/** A machine tool as the file lists it: `version` is the manifest's `provisionedVersion` (REQ-STARTUP-142). */
export interface MachineTool { readonly name: string; readonly version: string; readonly source: string; readonly license: string }
/** A tool-server package the manifest pins (REQ-STARTUP-058, REQ-STARTUP-152). */
export interface ToolServerPackage { readonly name: string; readonly version: string; readonly source: string; readonly license: string }
export interface SetupManifest { readonly runtime: string; readonly machineTools: readonly MachineTool[]; readonly toolServerPackages: readonly ToolServerPackage[]; readonly languageServers: readonly ProvisionedPackage[] }
/** The field names this generator reads from the manifest; `SetupManifestSchema` is their authority. */
export declare const SETUP_MANIFEST_SHAPE: Readonly<{
  schemaVersion: 1;
  machineTool: readonly string[];
  toolServerPackage: readonly string[];
  languageServerPackage: readonly string[];
}>;
export interface NoticesModel {
  readonly product: { readonly name: string; readonly version: string };
  readonly address: string;
  readonly application: readonly Component[];
  readonly interpreter: readonly Component[];
  readonly distributions: readonly Component[];
  readonly assets: readonly Component[];
  readonly manifest: SetupManifest | null;
  readonly electron: ElectronComponent | null;
  readonly problems: readonly string[];
}
export interface NoticesOptions {
  /** The repository root every input is read under. */
  readonly root: string;
  /** The release job's target platform (`process.platform`'s vocabulary). */
  readonly platform: string;
  /** YYYY-MM-DD, UTC: the day a reviewed exception's expiry is judged against. */
  readonly today: string;
}

/** The workspace globs of `pnpm-workspace.yaml`, as directory names. */
export declare const WORKSPACE_DIRS: readonly string[];

export declare function licenseTextKind(file: string, text: string): LicenseTextKind;
export declare function compareVersions(a: string, b: string): number;
export declare function versionInRange(version: string, range: string): boolean;
export declare function workspacePackages(root: string): Map<string, { dir: string; pkg: Record<string, unknown> }>;
export declare function npmLicenseOf(pkg: Record<string, unknown>): string | null;
export declare function javascriptClosure(root: string, problems: string[]): Component[];
export declare function parseChromiumCredits(html: string): Credit[];
export declare function electronComponent(root: string, problems: string[]): ElectronComponent | null;
export declare function compiledInComponents(root: string, closure: readonly Component[], platform: string, problems: string[]): Component[];
export declare function parseCoreMetadata(text: string): Map<string, string[]>;
export declare function pythonLicenseOf(fields: Map<string, string[]>): string | null;
export declare function codeIntelligenceComponents(root: string, problems: string[]): Component[];
export declare function woff2Names(buffer: Buffer): Record<number, string>;
export declare function declaredFontFiles(css: string): string[];
export declare function bundledAssetComponents(root: string, problems: string[]): Component[];
export declare function setupManifest(root: string, problems: string[]): SetupManifest | null;
/** Given `today` (YYYY-MM-DD, UTC), an entry reviewed after it is refused. */
export declare function reviewedExceptions(root: string, problems: string[], today?: string): ReviewedException[];
export declare function exceptionFor(component: Pick<Component, 'name' | 'version'>, exceptions: readonly ReviewedException[], today: string): { entry: ReviewedException | null; reason: string | null };
/** Why an address may not stand in the header (REQ-STARTUP-142), or null when it may. */
export declare function addressProblem(address: unknown): string | null;
export declare function releaseInputs(root: string, problems: string[]): { address: string };
export declare function collectNotices(options: NoticesOptions): NoticesModel;
export declare function renderNotices(model: NoticesModel): string;
export declare function generateNotices(options: NoticesOptions): { text: string; problems: readonly string[]; model: NoticesModel };
/** REQ-STARTUP-149: 0 written, 1 a handled error (every line `error: …`); the file is written only on 0. */
export declare function runNoticesStep(options: NoticesOptions): { code: 0 | 1; stdout: string[]; stderr: string[] };
