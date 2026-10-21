## On the built-in Administrator account every credential save is refused at the read-back

**Repaired 2026-10-21 (R-079, with the owner's go-ahead):** `isExactDacl` reads `LA` and `LG` as the owner when the owner's SID carries relative identifier 500 or 501 (`trusteeSid` in `protect.ts`), and the unit case beside the parser holds both aliases, accepted for that account and refused for any other. The real-filesystem case goes green on the hosted runner in the CI run that carries the repair.

R-079's CI runs (GitHub-hosted `windows-latest`, 2026-10-21; runs 39668971523 and 39670741659) failed one gate test both
times: `packages/providers/src/credentials.test.ts`, "on this machine: a foreign explicit ACE planted before a save does
not survive it", at `expect((await s.ensureDirectory()).ok).toBe(true)`. A throwaway diagnostic run (39672394311, branch
`ci-diag-credentials`, deleted after) called `createProtector().protect(dir, 'directory')` directly on that runner:

```
"headline": "The protection read back from D:\\a\\_temp\\rotaris-diag-HVKRw8\\tokens is not the one required",
"detail": "the trustees are LA, S-1-5-18"
AFTER  runnervmuzpk7\runneradmin:(OI)(CI)(F)
       NT AUTHORITY\SYSTEM:(OI)(CI)(F)
WHOAMI "runnervmuzpk7\runneradmin","S-1-5-21-4159254826-2043646976-2705649753-500"
```

The runner's account is the machine's **built-in Administrator** (relative identifier 500). The protection itself is
applied exactly as REQ-PROVIDER-016 requires: two allow entries, the user and SYSTEM, nothing inherited (`AFTER`). The
read-back refuses it because `icacls /save` writes the security descriptor in SDDL, and SDDL abbreviates that account's
SID to the alias `LA` (as it abbreviates SYSTEM to `SY`). `isExactDacl` maps `SY` to `S-1-5-18` and nothing else, so `LA`
is never equal to the owner's full SID and the trustees read as wrong. The same holds for the built-in Guest (`LG`, 501).

The effect in the product: on such an account the credential store's directory is never accepted, so no provider key can
be saved — the refusal is loud and correct in kind (protection is not confirmed), but its cause is the comparison, not the
file system. The built-in Administrator is disabled by default on a consumer install and enabled on many provisioned
machines and virtual machines, CI images among them.

## Specs

REQ-PROVIDER-016: the credential file and directory are protected to the user and SYSTEM, and protection that cannot be
confirmed is a refusal. The refusal is required for a protection that is wrong; here the protection is right and the
confirmation misreads it, so a store the requirement permits is refused.

## Relevant files

- `packages/providers/src/credentials/protect.ts` — `isExactDacl` (the `SY` mapping, line 76; no `LA`/`LG` mapping) and
  `parseDacl`.
- `packages/providers/src/credentials.test.ts` — the real-filesystem Windows case, red on any host whose account is RID 500.
- `.github/workflows/ci.yml` — the gate job that meets it on every run.
