# Cutting a release

How a tag becomes downloadable artifacts and published packages (SWR-3002).
Building the binaries by hand is [`building-standalone.md`](building-standalone.md);
this page is about the automated path.

## One product version

`rotaris-core` and `rotaris` release together under one tag. The desktop package
left its own `0.17.x` line on 2026-08-13 for a reason worth keeping in mind: one
number is what `rotaris-cli version` prints, what the desktop shows, what titles
the Release, and what the in-app update check (SWR-3003) compares against. Two
lines would make "am I up to date?" unanswerable.

So a release bumps **both** manifests:

- `pyproject.toml`
- `apps/rotaris/pyproject.toml`

The pipeline's first job refuses to build anything if those and the tag disagree,
and names all three values when it does.

## Before the first release

These are one-time, and none of them can be done from inside the repository.

1. **Claim both names on PyPI.** `rotaris-core` and `rotaris` must either be
   yours or unregistered. Check <https://pypi.org/project/rotaris/> and
   <https://pypi.org/project/rotaris-core/> before tagging.
2. **Configure trusted publishing** for each project — PyPI → *Manage* →
   *Publishing* → *Add a new publisher* (GitHub):
   - Owner `theUpsider`, repository `Rotaris`
   - Workflow name `release.yml`
   - Environment: leave blank

   This is what lets the pipeline publish without a stored API token. Until it
   exists, the `publish-pypi` job fails — and by design that does *not* roll back
   a Release that already shipped (AC-005).
3. **Check the quality gates are green on `master`.** The release workflow does
   not re-run them; it trusts the branch. `reqtocode.yml` and `rotaris.yml` run
   on every push to `master`, so "green on master" is a real signal — just not
   one this pipeline re-checks.

## Cutting one

```bash
# 1. Both manifests carry the new version, committed on master.
uv run python -m rotaris_core.packaging verify-version v0.101.0   # prints the version

# 2. Tag and push.
git tag v0.101.0
git push origin v0.101.0
```

Only `v<major>.<minor>.<patch>` releases. `v1.2`, `v1.2.3-rc1` and branch pushes
do not — pre-release channels are out of scope, and the guard rejects them by
name rather than letting the tag glob decide silently.

## What the pipeline does

| Job | What it does | Fails how |
| --- | --- | --- |
| `guard` | Checks the tag against both manifests | Stops everything — nothing is built |
| `build` | Freezes the three entry points on each native runner and wraps them (installer / DMG / AppImage) | One platform failing does not stop the others |
| `release` | Collects what arrived, writes `SHA256SUMS.txt`, renders the body, creates the Release | Runs even when a build leg failed |
| `publish-pypi` | `uv build` both packages, publishes via OIDC | Does not roll back the Release |
| `status` | Turns the run red if any leg failed | Makes a partial release visible |

## Artifacts

| Platform | Files |
| --- | --- |
| Windows x64 | `Rotaris-<v>-windows-x64-setup.exe`, `Rotaris-<v>-windows-x64-portable.exe`, `rotaris-cli-<v>-windows-x64.zip` |
| macOS ARM64 | `Rotaris-<v>-macos-arm64.dmg`, `rotaris-cli-<v>-macos-arm64.tar.gz` |
| Linux x64 | `Rotaris-<v>-linux-x86_64.AppImage`, `rotaris-cli-<v>-linux-x86_64.tar.gz` |

Plus `SHA256SUMS.txt`, in the format `sha256sum -c` reads.

The names are not typed anywhere twice: `src/rotaris_core/packaging/release.py`
is the only authority, and the NSIS script, the DMG and AppImage wrappers and the
release body all follow it.

Since SWR-3003 those names are also an **update contract**: an installed Rotaris
looks for exactly these filenames on the latest release and downloads the one
matching how it was installed. Renaming an artifact does not just change what a
Release page shows — it makes every already-installed copy fail to find its
update. See [`updating.md`](updating.md).

**Not built:** Windows ARM64 (PySide6 ships no `win_arm64` wheel) and Intel macOS
(universal2 needs universal2 wheels for every native dependency). Both are
deferred, and the Release body does not pretend otherwise.

## When a platform fails

The Release still ships. Its body carries a **"Not built in this release"** note
naming the platforms whose builds failed, and the workflow run goes red so the
failure is visible rather than absorbed.

To fill the gap: fix the cause, then either re-run the failed job (the release
job will re-render the body with the new artifact) or cut a patch release. Do not
delete and re-push the tag — a tag that has already published to PyPI cannot
publish the same version again.

## Before promoting the release on the official website

GitHub Releases remain the developer/distribution surface and do **not** need a
separate consumer-facing network/privacy notice. The official Rotaris website is
the disclosure surface defined by SWR-3722.

Before a newly built standalone release is promoted through the website:

1. compare the compact download disclosure with the current automatic client
   behaviour in SWR-3715 and SWR-3003;
2. if first-run provisioning destinations or launch-time update behaviour changed,
   update the website disclosure before promoting the release; and
3. verify that the disclosure stays visually secondary: a small information or
   privacy control beside the download metadata/action, not a warning banner,
   checkbox, blocking dialog, interstitial or large legal paragraph.

The German download page carries German copy. The English download page may carry
the equivalent English copy through the same compact control without adding visual
weight. This check gates **website promotion**, not GitHub artifact generation.

See [SWR-3722 — website download network disclosure](../requirements/3000-distribution-updates/SWR-3722-website-download-network-disclosure.md).

## Changing any of this

The parts that can be wrong live in `src/rotaris_core/packaging/release.py`, not
in `release.yml`: the version guard, artifact naming, checksums, the changelog,
and the partial-failure body. That is deliberate — anything expressed only in a
`run:` block is untestable until a tag is pushed, and a tag cannot be unpushed.

`tests/unit/packaging/test_release_metadata.py` covers that logic;
`tests/integration/test_release_pipeline.py` holds the workflow to it, so a
runner or a trigger cannot drift away from what the code declares.
