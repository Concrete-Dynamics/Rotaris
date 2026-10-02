// @ts-check
/**
 * The About page's two files, which a packaged build carries at the root of `process.resourcesPath` (first-release-plan.md
 * §4.4; ADR-0054), and the one licence copy the build must not carry twice. Shared by `package.mjs`, which decides whether
 * a package may be made, and `build-hooks.cjs`'s `afterPack`, which asserts what the artifact actually carries — evidence
 * about the artifact, ADR-0056's discipline, rather than about a step's exit status.
 *
 *  - `build-id.txt` — REQ-SHELL-140's "bundled text asset", the build identifier, written by `pnpm build-id`
 *    (`tools/build-id/`).
 *  - `THIRD-PARTY-LICENSES.txt` — REQ-STARTUP-141's notices file, written by `pnpm notices` (`tools/notices/`) only when
 *    REQ-STARTUP-143's validation passes.
 *  - REQ-STARTUP-015: "exactly one copy" of the bundled tool server's licence text inside the bundle. REQ-STARTUP-142
 *    puts that text in the notices file, so the copy under the distribution's dist-info — which stays in the source
 *    tree, where the generator reads it — is left out of the artifact (`electron-builder.yml`'s filter).
 *
 * Both files are bundled assets in the specification's sense (docs/spec/12's "Bundled assets read by the shell"), as the
 * fonts and the icon set are. `tools/notices/bundled-assets.json` holds only those that carry a licence file
 * (REQ-STARTUP-143), so this module is named for the surface its two files serve.
 *
 * **A development package without notices.** While owner item O-3 (the LGPL address) and the reviews of O-11 and OQ-74
 * stand, `pnpm notices` refuses, and a package made on the release path fails with it (REQ-STARTUP-143). Setting
 * `ROTARIS_PACKAGE_WITHOUT_NOTICES=1` lets `pnpm package` go on after that step's exit 1, loudly, with no notices file —
 * `settleNoticesStep` removes any earlier one itself — so the packaged About page takes REQ-SHELL-142's absent branch.
 * Such a package carries no licence text for the shipped closure (REQ-STARTUP-141/142) and so not the tool server's
 * either (REQ-STARTUP-015): it is not releasable, and a build for a tag refuses the flag, here and in `afterPack` alike.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BUILD_ID_FILE } from '../../../../tools/build-id/build-id.mjs';
import { normalize, NOTICES_FILE } from '../../../../tools/notices/notices.mjs';

/** REQ-SHELL-140's asset and REQ-STARTUP-141's, by the names their writers write and `src/main/about.ts` reads. */
export const ABOUT_ASSETS = Object.freeze({ buildId: BUILD_ID_FILE, notices: NOTICES_FILE });

/** The one explicit way to package after a refused notices step. Its value must be `1`; nothing else turns it on. */
export const WITHOUT_NOTICES = 'ROTARIS_PACKAGE_WITHOUT_NOTICES';

/**
 * Whether the flag's value is one `pnpm package` understands: unset or empty (off), or `1`. Any other value is a usage
 * error, which the package reports before any step runs and exits 2 on (REQ-STARTUP-149), rather than finding out after
 * the notices step and exiting 1 as though validation had refused. Answers the `error:` line's text, or null.
 * @param {NodeJS.ProcessEnv} env @returns {string | null}
 */
export function flagUsage(env) {
  const flag = env[WITHOUT_NOTICES];
  return flag === undefined || flag === '' || flag === '1' ? null : `${WITHOUT_NOTICES} is "${flag}"; only 1 turns it on, and unset or empty leaves it off`;
}

/**
 * A build for a release tag, as GitHub Actions states one: the release path, where the flag has no standing. Only
 * GitHub's variables are read, because §4.2's workflow is the one release route; a release built any other way is not
 * recognised here (ADR-0054).
 * @param {NodeJS.ProcessEnv} env
 */
function tagBuild(env) {
  return env['GITHUB_REF_TYPE'] === 'tag' || /^refs\/tags\//.test(env['GITHUB_REF'] ?? '');
}

/**
 * What `pnpm package` does after the notices step exited `code` (REQ-STARTUP-149's 0, 1 or 2; null for a signal).
 *
 * Exit 1 is REQ-STARTUP-143's refusal. It is also what Node exits with on an uncaught exception, and what the step makes
 * of an exception it catches. The code cannot tell them apart, so the flag passes over either, which is why
 * `settleNoticesStep` removes any notices file itself when it proceeds without one rather than trusting the step to
 * have. A usage error (2) and a signal are never passed over.
 * @param {{ code: number | null, env: NodeJS.ProcessEnv }} step
 * @returns {{ proceed: boolean, carried: boolean, line: string }}
 */
export function afterNoticesStep({ code, env }) {
  const flag = env[WITHOUT_NOTICES];
  if (code === 0) {
    return { proceed: true, carried: true, line: `notices written and carried${flag ? ` (${WITHOUT_NOTICES} is set and was not needed)` : ''}` };
  }
  if (code !== 1) return { proceed: false, carried: false, line: `the notices step failed with ${code === null ? 'a signal' : `exit ${code}`}, which is not a refusal, so no flag passes over it` };
  if (flag === undefined || flag === '') {
    return { proceed: false, carried: false, line: `notices validation refused (REQ-STARTUP-143), so this package may not be made. A development package without the notices file needs ${WITHOUT_NOTICES}=1, and is not releasable` };
  }
  // `package.mjs` refuses such a value before any step (`flagUsage`); a caller that did not ask still never proceeds on it.
  if (flag !== '1') return { proceed: false, carried: false, line: `${WITHOUT_NOTICES} is "${flag}"; only 1 turns it on` };
  if (tagBuild(env)) return { proceed: false, carried: false, line: `${WITHOUT_NOTICES} is set on a build for a tag, which is the release path: REQ-STARTUP-143 fails it, and no flag passes over that` };
  return { proceed: true, carried: false, line: `DEVELOPMENT PACKAGE: the notices step exited 1 and ${WITHOUT_NOTICES}=1 passes over it. This package carries no ${ABOUT_ASSETS.notices} (its About page says so) and no licence text for its shipped closure, the tool server's included (REQ-STARTUP-015/141/142). It is not releasable` };
}

/**
 * `afterNoticesStep`, and its consequence in `sourceDir` (apps/desktop/resources): a package that proceeds without the
 * notices file has none there to carry. The step removes its earlier file when it refuses or catches an exception, but an
 * uncaught one removes nothing, and a file left standing would be frozen as though validation had passed it —
 * `afterPack` could not tell.
 * @param {{ code: number | null, env: NodeJS.ProcessEnv, sourceDir: string }} step
 * @returns {{ proceed: boolean, carried: boolean, line: string }}
 */
export function settleNoticesStep({ code, env, sourceDir }) {
  const decision = afterNoticesStep({ code, env });
  if (!decision.proceed || decision.carried) return decision;
  const earlier = join(sourceDir, ABOUT_ASSETS.notices);
  try { rmSync(earlier, { force: true }); } catch (e) {
    return { proceed: false, carried: false, line: `${earlier} cannot be removed (${/** @type {NodeJS.ErrnoException} */ (e).code ?? String(e)}), so a development package would carry a notices file no validation passed` };
  }
  return decision;
}

function occurrences(haystack, needle) {
  let n = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) n += 1;
  return n;
}

/**
 * What an artifact's resources directory must hold, against the source tree it was packed from. Answers the problems,
 * one sentence each naming the path; empty is the only passing answer.
 *
 * @param {{
 *   resourcesDir: string,          // the artifact's `resources/` (win-unpacked/resources)
 *   sourceDir: string,             // apps/desktop/resources, where the two steps wrote
 *   env: NodeJS.ProcessEnv,        // the packaging environment: whether a missing notices file was allowed
 *   toolServerLicense: string | null, // the marker's licenseFile, relative to code-intelligence/runtime
 *   build: { id: string } | { problem: string }, // `identifyBuild` over the tree being packed, asked now
 * }} options
 * @returns {string[]}
 */
export function aboutAssetProblems({ resourcesDir, sourceDir, env, toolServerLicense, build }) {
  const problems = [];
  const read = (dir, name) => { try { return readFileSync(join(dir, name)); } catch { return null; } };

  // REQ-SHELL-140: one stripped line, the one `pnpm build-id` wrote for this build, naming the tree being packed.
  const id = read(resourcesDir, ABOUT_ASSETS.buildId);
  const idSource = read(sourceDir, ABOUT_ASSETS.buildId);
  if (id === null) problems.push(`REQ-SHELL-140: the artifact carries no ${ABOUT_ASSETS.buildId} at the root of its resources (${resourcesDir})`);
  else {
    const text = id.toString('utf8');
    if (!/^[^\r\n]*\S[^\r\n]*\n?$/.test(text)) problems.push(`REQ-SHELL-140: ${ABOUT_ASSETS.buildId} in the artifact is not one non-empty line: ${JSON.stringify(text.slice(0, 120))}`);
    if (idSource === null) problems.push(`REQ-SHELL-140: ${ABOUT_ASSETS.buildId} is in the artifact but not in ${sourceDir}, where pnpm build-id writes it`);
    else if (!id.equals(idSource)) problems.push(`REQ-SHELL-140: ${ABOUT_ASSETS.buildId} in the artifact differs from the one pnpm build-id wrote in ${sourceDir}`);
    // `pnpm package` writes the file afresh; `electron-builder` called directly carries whatever an earlier build left.
    if ('problem' in build) problems.push(`REQ-SHELL-140: the tree being packed cannot be identified, so ${ABOUT_ASSETS.buildId} cannot be checked against it: ${build.problem}`);
    else if (text.trim() !== build.id) problems.push(`REQ-SHELL-140: ${ABOUT_ASSETS.buildId} in the artifact says ${JSON.stringify(text.trim())}, and the tree being packed is ${build.id}: a file an earlier build left, which pnpm build-id replaces`);
  }

  // REQ-STARTUP-141: the notices file, byte for byte the one in the source tree; or none, only by the flag, never for a tag.
  // Validation is not run again here. `pnpm package` has just regenerated that file or removed it (`settleNoticesStep`),
  // so on its path the file is this tree's; an `electron-builder` called directly carries whatever a passing run left.
  const notices = read(resourcesDir, ABOUT_ASSETS.notices);
  const noticesSource = read(sourceDir, ABOUT_ASSETS.notices);
  if (noticesSource !== null) {
    if (notices === null) problems.push(`REQ-STARTUP-141: ${ABOUT_ASSETS.notices} was written in ${sourceDir} and the artifact does not carry it`);
    else if (!notices.equals(noticesSource)) problems.push(`REQ-STARTUP-141: ${ABOUT_ASSETS.notices} in the artifact differs from the one notices validation passed in ${sourceDir}`);
  } else {
    if (notices !== null) problems.push(`REQ-STARTUP-141: the artifact carries a ${ABOUT_ASSETS.notices} that no passing notices step wrote in ${sourceDir}`);
    if (env[WITHOUT_NOTICES] !== '1') problems.push(`REQ-STARTUP-141: the artifact carries no ${ABOUT_ASSETS.notices}, and ${WITHOUT_NOTICES}=1 did not ask for a development package without one`);
    else if (tagBuild(env)) problems.push(`REQ-STARTUP-141: the artifact carries no ${ABOUT_ASSETS.notices}, and this is a build for a tag, where ${WITHOUT_NOTICES} has no standing (REQ-STARTUP-143)`);
  }

  // REQ-STARTUP-015 with REQ-STARTUP-142: the tool server's licence text once, in the notices file, and nowhere else.
  // "Nowhere else" is checked at its dist-info path, the one the filter names; the rest of the artifact is not searched.
  if (toolServerLicense === null) problems.push('REQ-STARTUP-015: the bundle marker names no licence file for the tool server, so its copies cannot be counted');
  else {
    const inRuntime = join(resourcesDir, 'code-intelligence', 'runtime', ...toolServerLicense.split('/'));
    if (existsSync(inRuntime)) problems.push(`REQ-STARTUP-015: the tool server's licence text is carried under its dist-info (${inRuntime})${notices === null ? '' : ` as well as in ${ABOUT_ASSETS.notices}`}; electron-builder.yml's filter no longer matches it`);
    const source = read(join(sourceDir, 'code-intelligence', 'runtime'), toolServerLicense);
    if (source === null) problems.push(`REQ-STARTUP-015: the tool server's licence file ${toolServerLicense} is missing from the source tree's runtime`);
    else if (notices !== null) {
      // By the generator's own rule for a licence text, so the count reads the file the way it was written.
      const count = occurrences(normalize(notices.toString('utf8')), normalize(source.toString('utf8')));
      if (count !== 1) problems.push(`REQ-STARTUP-015: ${ABOUT_ASSETS.notices} carries the tool server's licence text ${count} times, not once`);
    }
  }
  return problems;
}
