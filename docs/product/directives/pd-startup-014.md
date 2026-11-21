[Product directives](../directives.md) › PD-STARTUP-014

<a id="pd-startup-014"></a>

### PD-STARTUP-014 — a packaged build that cannot update itself says a newer release exists and links to it

**The directive.** A build running from a released artifact of REQ-STARTUP-031 that REQ-STARTUP-106 (with
[`PD-STARTUP-004`](pd-startup-004.md#pd-startup-004) and [`PD-STARTUP-013`](pd-startup-013.md#pd-startup-013)) classifies
**not updatable** SHALL still perform REQ-STARTUP-114's check against REQ-STARTUP-105's one endpoint, and nothing else.
Such a build is **link-only**: a build installed from the Debian package; a packaged macOS build, until a macOS artifact is
published and its apply has had its first execution; and a packaged Windows build that names no artifact. A build started
from a source checkout or a development environment is not packaged and stays not updatable, with no request.

Where the feed names a release strictly newer than the running version (REQ-STARTUP-109, drafts and prereleases filtered as
there), a link-only build SHALL raise the persistent notice `Rotaris {version} is available`, carrying REQ-STARTUP-112's
summary and one action that opens the release's page in the default browser — the action conveys that, its label left to
the implementation. No asset is matched, fetched or verified, nothing is downloaded and nothing is applied; REQ-STARTUP-107's
and REQ-STARTUP-108's asset conditions do not apply to a link-only offer. The page opened is the release's own page as the
feed states it, and SHALL be opened only if it is an `https` page of the feed's own repository on the host that serves it;
any other value SHALL be refused, logged, and the action withheld. Dismissing the notice waves the version off as
REQ-STARTUP-117 states; a check failure stays invisible (REQ-STARTUP-110).

**What is unchanged.** The endpoint and its undisableability (REQ-STARTUP-105, REQ-STARTUP-111), the version order, the
summary, and every requirement of a build that can apply. Nothing on a package manager's files is touched: the user installs
the newer package themself, as PD-STARTUP-013 says.

**Why, and what it costs.** The owner, 2026-11-21: "if not autoupdate possible, the banner directs the user to the release
so the user can download the newest version" ([R-117](../requests.md#r-117)); asked which builds, the owner chose every
packaged build that cannot update itself, and not a development build. What it costs: a `.deb` and a link-only Windows
build now make the one request REQ-STARTUP-106 kept them from making, which REQ-STARTUP-160's disclosure already names; and
one more action in REQ-SHELL-115's closed list ([`PD-SHELL-018`](pd-shell-018.md#pd-shell-018)).

**Recorded, not built.** The first execution is owed to the stage that builds it (the plan's Stage 3).

**Built, 2026-11-21 (R-117, the plan's Stage 3); first executed.** The classification (`updater/classify.ts`) answers a
packaged build that cannot update itself `notifiable` — the Debian package, a packaged macOS build in a `.app` bundle or not,
a packaged Windows build naming no artifact — and every other not-updatable build silent. The updater's link-only check
makes the one request and nothing else: no launch-time settlement, no pending update, no asset, no metered probe; a strictly
newer release raises `Rotaris {version} is available` with the summary and `Open release page` (`open-release-page`,
PD-SHELL-018 revision 2), and no title-bar indicator. The page is `html_url`, checked by `feed.ts`'s `checkReleasePage` when the
face is drawn and again at the press (OQ-556's terms: `https`, `github.com`, under `/Concrete-Dynamics/Rotaris/releases/`, no
user information, no port but the default); a refusal is one `warn` line and the notice carries no action. Executed over
fakes (`updater.link-only.test.ts`, `feed.test.ts`, `classify.test.ts`), and in the built application on the Linux agent host:
`updater-proof`'s third launch, read as packaged by a driver-only seam, classified itself as the Debian package's case and the
proxy sink recorded exactly one connection, `CONNECT api.github.com:443`, which it refused, then one silent-failure line and no
file under `<data>/updates/`; the face was drawn through the driver's face seam and pressed, and the press, with no offer held,
wrote its one line. The packaged tree `pnpm package` produced (`linux-unpacked`, no `APPIMAGE`: the Debian package's case)
was launched once against the real feed: it classified itself link-only, made its one request, and offered nothing, the
feed's latest being `0.1.0rc6`, the version it ran. **Decided here, not by the record:** a packaged macOS build in a bundle is link-only too, the directive
naming "a packaged macOS build" without exception, so the `app-bundle` flavour is not produced until a macOS artifact exists;
a packaged build of a platform no artifact is released for stays silent; the check is stricter than OQ-556's letter — no
percent-encoding, backslash, dot segment, query, fragment or whitespace, owner and repository compared as spelled, at most
512 characters, and something below `/releases/` named — each a refusal; an `openExternal` that never answers is bounded at
5 s as every opener is (`open-folder.ts`). **Not executed:** a real feed answering a newer release to a packaged build (no
endpoint may be moved, REQ-STARTUP-111; the next published release does it), the default browser actually opening, macOS and
Windows, an installed `.deb`.

> **Narrows:** REQ-STARTUP-106, REQ-STARTUP-107, REQ-STARTUP-108

Its case on REQ-STARTUP-106 is the link-only build's check and its one request; on REQ-STARTUP-107 and REQ-STARTUP-108, an
offer with no asset. It also narrows PD-STARTUP-004's and PD-STARTUP-013's "issues no request" for the same builds.

*Decided by the owner, 2026-11-21, [R-117](../requests.md#r-117); worded by the model (`claude-opus-5-5`).*
