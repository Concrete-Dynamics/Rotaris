"""Host classification for the network egress policy (SWR-2505).

The single place a host pattern is interpreted, so the ``fetch`` tool, the mode
presets (SWR-2503) and any future proxy agree on what ``*.example.com`` means.

Three deliberate choices, all of them security-relevant:

* **Denied wins.** A host matched by ``network_denied_hosts`` is denied even
  when a broader ``network_allowed_hosts`` wildcard also matches it.  The other
  precedence would let ``*.example.com`` silently re-open
  ``metadata.example.com``.
* **``*.example.com`` does not match bare ``example.com``.** The wildcard stands
  for "one or more labels here", the same reading TLS certificates and the
  reference agent harnesses use.  An operator who wants both writes both.
* **A ``*`` anywhere but in a leading ``*.`` is rejected**, rather than being
  treated as a literal asterisk.  A pattern like ``api.*.com`` is far more
  likely to be a mistaken expectation than an intended literal, and silently
  matching nothing is the worst of the three outcomes.

This module is import-cheap on purpose: it must not pull in
``rotaris_core.config`` or ``rotaris_core.tools`` (either drags in the agent
SDK), so the runtime policy is read off any object exposing the three
``network_*`` fields rather than off the config model itself.
"""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit

from rotaris_core.permissions.command_patterns import command_matcher
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris_core.permissions.engine import CommandMatcher

#: The three dispositions a host can resolve to; the same vocabulary as
#: ``runtime.network_egress_policy`` and as :class:`~.engine.Decision`.
EGRESS_ALLOW = "allow"
EGRESS_ASK = "ask"
EGRESS_DENY = "deny"
EGRESS_DISPOSITIONS: tuple[str, ...] = (EGRESS_ALLOW, EGRESS_ASK, EGRESS_DENY)

#: Host names that mean "this machine".  Deliberately *not* extended to RFC1918
#: or link-local ranges: ``169.254.169.254`` is the cloud metadata endpoint and
#: an internal ``10.x`` service is exactly the kind of target a policy exists to
#: gate, so both stay "remote".
_LOOPBACK_NAMES = frozenset({"localhost", "localhost.localdomain", "ip6-localhost"})

#: Terminal commands that reach the network.  SWR-2505 requires these to be
#: *classifiable* so a mode can gate them separately from local commands; the
#: kernel-level enforcement lives in the sandbox (SWR-2507).
NETWORK_COMMAND_PATTERNS: tuple[str, ...] = (
    "curl *",
    "wget *",
    "http *",
    "https *",
    "ssh *",
    "scp *",
    "sftp *",
    "rsync *",
    "ftp *",
    "telnet *",
    "nc *",
    "ncat *",
    "git push *",
    "git pull *",
    "git fetch *",
    "git clone *",
    "git remote *",
    "git ls-remote *",
    "git submodule update *",
    "gh *",
    "pip install *",
    "pip download *",
    "pip3 install *",
    "uv pip install *",
    "uv add *",
    "uv sync *",
    "uv tool install *",
    "poetry install *",
    "poetry add *",
    "npm install *",
    "npm i *",
    "npm ci *",
    "npm publish *",
    "npx *",
    "yarn add *",
    "yarn install *",
    "pnpm add *",
    "pnpm install *",
    "pnpm dlx *",
    "cargo install *",
    "cargo fetch *",
    "cargo publish *",
    "go get *",
    "go install *",
    "brew install *",
    "brew update *",
    "apt install *",
    "apt-get install *",
    "apt-get update *",
    "docker pull *",
    "docker push *",
)


@traces(SWR.SWR_2505)
def normalize_host(url_or_host: str) -> str:
    """Reduce a URL or a bare host to the comparable host key.

    Lower-cases, drops userinfo, port, brackets around an IPv6 literal and the
    trailing root dot, and IDNA-encodes a non-ASCII name so ``BÜCHER.example``
    and ``xn--bcher-kva.example`` compare equal.  Returns ``""`` when no host
    can be read — callers must treat that as "unknown", never as "fine".
    """
    candidate = (url_or_host or "").strip()
    if not candidate:
        return ""
    if "://" not in candidate:
        bare = candidate.lstrip("/")
        if bare.count(":") > 1 and "[" not in bare:
            # A bare IPv6 literal (``::1``); ``urlsplit`` needs the brackets to
            # tell the address apart from a ``host:port`` pair.
            bare = f"[{bare}]"
        # ``urlsplit`` only populates ``hostname`` for an authority, so give a
        # bare host one.  This is also what strips ``user@`` and ``:port``.
        candidate = f"//{bare}"
    try:
        host = urlsplit(candidate).hostname or ""
    except ValueError:
        return ""
    host = host.strip().rstrip(".").lower()
    if not host:
        return ""
    if not host.isascii():
        try:
            host = host.encode("idna").decode("ascii").lower()
        except (UnicodeError, ValueError):
            return host
    return host


def _validate_pattern(pattern: str) -> str:
    """Normalize *pattern*; raise ``ValueError`` on an unsupported wildcard."""
    cleaned = (pattern or "").strip().lower().rstrip(".")
    if not cleaned:
        raise ValueError("A host pattern must not be empty.")
    if "*" not in cleaned:
        return cleaned
    if cleaned.startswith("*.") and "*" not in cleaned[2:]:
        return cleaned
    raise ValueError(
        f"Host pattern {pattern!r} is not supported: the only wildcard form is a "
        "single leading '*.' (for example '*.example.com')."
    )


@traces(SWR.SWR_2505)
def host_matches(host: str, pattern: str) -> bool:
    """Whether *host* is covered by *pattern*.

    Exact match, or a single leading ``*.`` standing for one or more leading
    labels.  ``*.example.com`` matches ``api.example.com`` and
    ``a.b.example.com`` but **not** bare ``example.com`` — and never
    ``evil-example.com``, because matching is label-wise, not substring-wise.

    Raises ``ValueError`` for a pattern with a wildcard anywhere else.
    """
    normalized_pattern = _validate_pattern(pattern)
    normalized_host = normalize_host(host)
    if not normalized_host:
        return False
    if not normalized_pattern.startswith("*."):
        return normalized_host == normalized_pattern
    suffix = normalized_pattern[1:]  # ".example.com"
    return normalized_host.endswith(suffix) and len(normalized_host) > len(suffix)


@traces(SWR.SWR_2505)
def classify_host(
    host: str,
    *,
    allowed: Sequence[str],
    denied: Sequence[str],
    default: str,
) -> str:
    """Resolve *host* to ``"allow"``, ``"ask"`` or ``"deny"``.

    Precedence is deny → allow → *default*: an explicit deny entry wins over a
    broader allow wildcard.  A host that cannot be read, and an unrecognized
    *default*, both resolve to ``"deny"`` — there is no path from confusion to
    ``"allow"``.

    Raises ``ValueError`` if any pattern carries an unsupported wildcard.
    """
    normalized = normalize_host(host)
    if not normalized:
        return EGRESS_DENY
    if any(host_matches(normalized, pattern) for pattern in denied):
        return EGRESS_DENY
    if any(host_matches(normalized, pattern) for pattern in allowed):
        return EGRESS_ALLOW
    disposition = (default or "").strip().lower()
    if disposition not in EGRESS_DISPOSITIONS:
        return EGRESS_DENY
    return disposition


@traces(SWR.SWR_2505)
def is_loopback_host(host: str) -> bool:
    """Whether *host* names this machine (loopback name or loopback address)."""
    normalized = normalize_host(host)
    if not normalized:
        return False
    if normalized in _LOOPBACK_NAMES:
        return True
    try:
        return ipaddress.ip_address(normalized).is_loopback
    except ValueError:
        return False


@traces(SWR.SWR_2505)
def is_remote_url(url: str) -> bool:
    """Whether *url* targets a host other than this machine.

    An unreadable or hostless URL counts as remote: the fail-closed reading, so
    a mode that gates remote fetches also gates the ones it cannot parse.
    """
    return not is_loopback_host(normalize_host(url))


@traces(SWR.SWR_2505)
def remote_url_matcher() -> CommandMatcher:
    """A rule matcher that fires when the gated call targets a remote host.

    Rides on :attr:`PermissionRule.matcher`, the only callable facet a rule has
    (``arguments`` is exact-match only and cannot express a host).  For the
    ``fetch`` tool the request's ``command`` carries the target URL.
    """

    def matches(command: str) -> bool:
        return is_remote_url(command)

    return matches


@traces(SWR.SWR_2505)
def network_command_matcher() -> CommandMatcher:
    """A rule matcher for terminal commands that reach the network."""
    return command_matcher(*NETWORK_COMMAND_PATTERNS)


@traces(SWR.SWR_2505)
@dataclass(frozen=True, slots=True)
class NetworkEgressPolicy:
    """The configured egress disposition plus its host allow/deny lists.

    A value object, not a service: it holds no I/O and can be built in a test
    without a :class:`RotarisConfig`.
    """

    disposition: str = EGRESS_ASK
    allowed_hosts: tuple[str, ...] = ()
    denied_hosts: tuple[str, ...] = ()

    @classmethod
    def permissive(cls) -> NetworkEgressPolicy:
        """The default for a caller that has no configuration to offer.

        Permissive rather than restrictive on purpose: this class is a *policy
        carrier*, and a wiring gap must not silently break every fetch in a
        product that shipped without an egress policy.  The gating that a
        missing policy does leave in place is the permission engine's — the
        mode presets still route a remote fetch through an ``ask``.
        """
        return cls(disposition=EGRESS_ALLOW)

    @classmethod
    def from_runtime(cls, runtime: Any) -> NetworkEgressPolicy:
        """Read the policy off a ``RuntimePolicy``-shaped object.

        Duck-typed rather than imported so this module stays free of
        ``rotaris_core.config`` (and therefore of the agent SDK).
        """
        disposition = str(getattr(runtime, "network_egress_policy", "") or EGRESS_ASK)
        return cls(
            disposition=disposition.strip().lower(),
            allowed_hosts=tuple(getattr(runtime, "network_allowed_hosts", ()) or ()),
            denied_hosts=tuple(getattr(runtime, "network_denied_hosts", ()) or ()),
        )

    def classify(self, url_or_host: str) -> str:
        """Classify one URL or host against this policy."""
        return classify_host(
            url_or_host,
            allowed=self.allowed_hosts,
            denied=self.denied_hosts,
            default=self.disposition,
        )
