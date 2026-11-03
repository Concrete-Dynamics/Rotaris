## `SECURITY.md` routes reports to a private advisory form the repository has switched off

`SECURITY.md` (R-091, hardening bundle G2) sends a reporter to
`https://github.com/Concrete-Dynamics/Rotaris/security/advisories/new`, GitHub's private vulnerability reporting. On
2026-11-02 `gh api repos/Concrete-Dynamics/Rotaris/private-vulnerability-reporting` read `{"enabled":false}`: the form is
not offered, so every reporter takes the policy's fallback, a public issue titled "Security contact requested". Enabling
it is a repository setting, the owner's alone; no agent changes it.

Two more of the policy's statements wait on the owner; `hardening.md` §3.5 row 10
([`hardening/02-the-findings.md`](../architecture/hardening/02-the-findings.md)) names all three and points here:

- **The answer window.** `SECURITY.md` promises "Acknowledgement within 14 days", the figure the brief proposed; the
  owner confirms it or names another.
- **The code owner.** `.github/CODEOWNERS` names `* @theUpsider`. The repository belongs to the organisation
  Concrete-Dynamics, which CODEOWNERS cannot name, and the organisation has no team; `theUpsider` is the account the
  GitHub CLI was signed in as on the build host and an administrator of the repository (`philgei` is the other). The
  owner confirms the login or creates a team to name instead.

## Specs

None in `docs/spec/`. It meets R-091's request for a working security policy (`docs/product/requests.md`) and the
OpenSSF Scorecard's Security-Policy check that `hardening.md` §3.5 counts as configured.

## Relevant files

- `SECURITY.md` — the private advisory route, its fallback, and the 14 days.
- `.github/CODEOWNERS` — the login and why it was chosen.
- `tools/security-policy.test.ts` — holds the route, the window's shape and the owner's form, not the setting.
- `docs/architecture/hardening/02-the-findings.md` — §3.5 row 10 and the Scorecard list.
