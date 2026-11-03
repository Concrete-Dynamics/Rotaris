/**
 * The icon font's two stylesheets, imported by `main.tsx` for their effect (REQ-SHELL-027): `@phosphor-icons/web` ships
 * CSS and no types, and `noUncheckedSideEffectImports` (R-091, hardening.md §3.5 row 5) asks every side-effect import to
 * resolve. Vite bundles them; nothing is imported from them.
 */
declare module '@phosphor-icons/web/regular';
declare module '@phosphor-icons/web/fill';
