/**
 * The two variables that name the artifact a launch started from (REQ-STARTUP-106, REQ-STARTUP-147; ADR-0054, "The
 * updater"): `APPIMAGE`, published by the AppImage runtime, and `ROTARIS_PORTABLE_ARTIFACT`, published by the
 * portable's launcher stub. Each is "set by the artifact's own runtime rather than by a user" and "decides which file an
 * update replaces" — so each is true of ONE launch, the one whose runtime set it, and of no process that launch starts.
 *
 * A copy inherited by a child is a claim about somebody else's artifact: a terminal or a tool shell inside a portable
 * Rotaris would carry the portable's path, and a packaged Rotaris started from that shell would classify itself from
 * it and target the other artifact's file for its rename-aside and replace. So the launch reads the two once, for the
 * updater's classification, and removes them from its own environment before it starts any child
 * (`apps/desktop/src/main/index.ts`): the run host and the workspace services are forked with main's environment, and
 * every tool, terminal, hook, MCP server and code-intelligence branch is started from the run host's.
 *
 * Only these two names are taken. `APPDIR`, `ARGV0` and `OWD`, which the AppImage runtime also publishes, name nothing
 * the product reads, and removing a variable the specification does not name is not this helper's to decide.
 */
export const APPIMAGE_VARIABLE = 'APPIMAGE';
/** ADR-0054 (the updater's first execution, item 2): the portable launcher's variable, a file path and nothing else. */
export const PORTABLE_ARTIFACT_VARIABLE = 'ROTARIS_PORTABLE_ARTIFACT';
/** The variables that name the artifact a launch started from — exactly these, in the order the classification tests them. */
export const ARTIFACT_VARIABLES = [APPIMAGE_VARIABLE, PORTABLE_ARTIFACT_VARIABLE] as const;
export type ArtifactVariable = (typeof ARTIFACT_VARIABLES)[number];

/** What a launch's own artifact runtime published, as read before the environment was scrubbed. */
export type ArtifactVariables = Readonly<Partial<Record<ArtifactVariable, string>>>;

/**
 * Read the artifact variables from `env` and delete them from it, in one step, so there is no instant at which the
 * values have been read and a child could still inherit them. Returns what was read (a name that was absent is absent).
 *
 * The platform is a parameter for the reason `environmentWithout`'s is: on Windows a variable's name is compared
 * without regard to case, so `Appimage` is the same variable as `APPIMAGE` there and a different one everywhere else.
 * Given `process.env` on Windows the deletion is case-insensitive already; given a plain record it is made so here.
 */
export function takeArtifactVariables(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): ArtifactVariables {
  const taken: Partial<Record<ArtifactVariable, string>> = {};
  const fold = (name: string): string => (platform === 'win32' ? name.toUpperCase() : name);
  for (const name of ARTIFACT_VARIABLES) {
    for (const key of Object.keys(env)) {
      if (fold(key) !== fold(name)) continue;
      const value = env[key];
      if (value !== undefined && taken[name] === undefined) taken[name] = value;
      delete env[key];
    }
  }
  return Object.freeze(taken);
}
