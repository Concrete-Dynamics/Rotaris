// @ts-check
/**
 * The two bundled assets a packaged build carries at the root of `process.resourcesPath` (first-release-plan.md §4.4;
 * ADR-0054), and the one licence copy the build must not carry twice. Shared by `package.mjs`, which decides whether a
 * package may be made, and `build-hooks.cjs`'s `afterPack`, which asserts what the artifact actually carries — evidence
 * about the artifact, ADR-0056's discipline, rather than about a step's exit status.
 *
 *  - `build-id.txt` — REQ-SHELL-140's build identifier, written by `pnpm build-id` (`tools/build-id/`).
 *  - `THIRD-PARTY-LICENSES.txt` — REQ-STARTUP-141's notices file, written by `pnpm notices` (`tools/notices/`) only when
 *    REQ-STARTUP-143's validation passes.
 *  - REQ-STARTUP-015: "exactly one copy" of the bundled tool server's licence text inside the bundle. REQ-STARTUP-142
 *    puts that text in the notices file, so the copy under the distribution's dist-info — which stays in the source
 *    tree, where the generator reads it — is left out of the artifact (`electron-builder.yml`'s filter).
 *
 * **A development package without notices.** While owner item O-3 (the LGPL address) and the reviews of O-11 and OQ-68
 * stand, `pnpm notices` refuses, and a package made on the release path fails with it (REQ-STARTUP-143). Setting
 * `ROTARIS_PACKAGE_WITHOUT_NOTICES=1` lets `pnpm package` go on after that refusal, loudly, with no notices file — the
 * refused step has removed any earlier one — so the packaged About page takes REQ-SHELL-142's absent branch. Such a
 * package carries no licence text for the shipped closure (REQ-STARTUP-141/142) and so not the tool server's either
 * (REQ-STARTUP-015): it is not releasable, and a build for a tag refuses the flag.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** REQ-SHELL-140's asset and REQ-STARTUP-141's, by the names `apps/desktop/src/main/about.ts` reads. */
export const ASSETS = Object.freeze({ buildId: 'build-id.txt', notices: 'THIRD-PARTY-LICENSES.txt' });

/** The one explicit way to package after a refused notices step. Its value must be `1`; nothing else turns it on. */
export const WITHOUT_NOTICES = 'ROTARIS_PACKAGE_WITHOUT_NOTICES';

/** A build for a release tag, as GitHub Actions states one: the release path, where the flag has no standing. */
function tagBuild(env) {
  return env['GITHUB_REF_TYPE'] === 'tag' || /^refs\/tags\//.test(env['GITHUB_REF'] ?? '');
}

/**
 * What `pnpm package` does after the notices step exited `code` (REQ-STARTUP-149's 0, 1 or 2).
 * @param {{ code: number | null, env: NodeJS.ProcessEnv }} step
 * @returns {{ proceed: boolean, carried: boolean, line: string }}
 */
export function afterNoticesStep({ code, env }) {
  const flag = env[WITHOUT_NOTICES];
  if (code === 0) {
    return { proceed: true, carried: true, line: `notices written and carried${flag ? ` (${WITHOUT_NOTICES} is set and was not needed)` : ''}` };
  }
  if (code !== 1) return { proceed: false, carried: false, line: `the notices step failed with exit ${code} — not a validation refusal, so no flag passes over it` };
  if (flag === undefined || flag === '') {
    return { proceed: false, carried: false, line: `notices validation refused (REQ-STARTUP-143), so this package may not be made. A development package without the notices file needs ${WITHOUT_NOTICES}=1, and is not releasable` };
  }
  if (flag !== '1') return { proceed: false, carried: false, line: `${WITHOUT_NOTICES} is "${flag}"; only 1 turns it on` };
  if (tagBuild(env)) return { proceed: false, carried: false, line: `${WITHOUT_NOTICES} is set on a build for a tag, which is the release path: REQ-STARTUP-143 fails it, and no flag passes over that` };
  return { proceed: true, carried: false, line: `DEVELOPMENT PACKAGE: notices validation refused and ${WITHOUT_NOTICES}=1 passes over it. This package carries no ${ASSETS.notices} (its About page says so) and no licence text for its shipped closure, the tool server's included (REQ-STARTUP-015/141/142). It is not releasable` };
}

/** A licence text as the notices generator reproduces it: no byte-order mark, LF line endings, no outer blank space. */
function comparable(text) {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
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
 * }} options
 * @returns {string[]}
 */
export function bundledAssetProblems({ resourcesDir, sourceDir, env, toolServerLicense }) {
  const problems = [];
  const read = (dir, name) => { try { return readFileSync(join(dir, name)); } catch { return null; } };

  // REQ-SHELL-140: one stripped line, and the one `pnpm build-id` wrote for this build.
  const id = read(resourcesDir, ASSETS.buildId);
  const idSource = read(sourceDir, ASSETS.buildId);
  if (id === null) problems.push(`REQ-SHELL-140: the artifact carries no ${ASSETS.buildId} at the root of its resources (${resourcesDir})`);
  else {
    const text = id.toString('utf8');
    if (!/^[^\r\n]*\S[^\r\n]*\n?$/.test(text)) problems.push(`REQ-SHELL-140: ${ASSETS.buildId} in the artifact is not one non-empty line: ${JSON.stringify(text.slice(0, 120))}`);
    if (idSource === null) problems.push(`REQ-SHELL-140: ${ASSETS.buildId} is in the artifact but not in ${sourceDir}, where pnpm build-id writes it`);
    else if (!id.equals(idSource)) problems.push(`REQ-SHELL-140: ${ASSETS.buildId} in the artifact differs from the one pnpm build-id wrote in ${sourceDir}`);
  }

  // REQ-STARTUP-141: the notices file, byte for byte the one validation passed; or none, and only by the flag.
  const notices = read(resourcesDir, ASSETS.notices);
  const noticesSource = read(sourceDir, ASSETS.notices);
  if (noticesSource !== null) {
    if (notices === null) problems.push(`REQ-STARTUP-141: ${ASSETS.notices} was written in ${sourceDir} and the artifact does not carry it`);
    else if (!notices.equals(noticesSource)) problems.push(`REQ-STARTUP-141: ${ASSETS.notices} in the artifact differs from the one notices validation passed in ${sourceDir}`);
  } else {
    if (notices !== null) problems.push(`REQ-STARTUP-141: the artifact carries a ${ASSETS.notices} that no passing notices step wrote in ${sourceDir}`);
    if (env[WITHOUT_NOTICES] !== '1') problems.push(`REQ-STARTUP-141: the artifact carries no ${ASSETS.notices}, and ${WITHOUT_NOTICES}=1 did not ask for a development package without one`);
  }

  // REQ-STARTUP-015 with REQ-STARTUP-142: the tool server's licence text once, in the notices file, and nowhere else.
  if (toolServerLicense === null) problems.push('REQ-STARTUP-015: the bundle marker names no licence file for the tool server, so its copies cannot be counted');
  else {
    const inRuntime = join(resourcesDir, 'code-intelligence', 'runtime', ...toolServerLicense.split('/'));
    if (existsSync(inRuntime)) problems.push(`REQ-STARTUP-015: the tool server's licence text is carried under its dist-info (${inRuntime}) as well as in ${ASSETS.notices}; electron-builder.yml's filter no longer matches it`);
    const source = read(join(sourceDir, 'code-intelligence', 'runtime'), toolServerLicense);
    if (source === null) problems.push(`REQ-STARTUP-015: the tool server's licence file ${toolServerLicense} is missing from the source tree's runtime`);
    else if (notices !== null) {
      const count = occurrences(comparable(notices.toString('utf8')), comparable(source.toString('utf8')));
      if (count !== 1) problems.push(`REQ-STARTUP-015: ${ASSETS.notices} carries the tool server's licence text ${count} times, not once`);
    }
  }
  return problems;
}
