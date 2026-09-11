/**
 * The build-time verification flag (`electron.vite.config.ts`, `define`).
 *
 * `true` in every build but the packaged one, where `scripts/package.mjs` sets `ROTARIS_BUILD=package` and rollup
 * removes each branch this guards. It is a CONSTANT at build time, not a variable at run time: an environment
 * variable cannot turn the seams back on in a binary that was built without them, which is the whole point.
 *
 * TypeScript sees it as a plain boolean, so both branches are typechecked in every build.
 */
declare const __ROTARIS_SEAMS__: boolean;
