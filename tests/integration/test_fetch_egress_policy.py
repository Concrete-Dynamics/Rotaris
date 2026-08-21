"""Productive use: an operator confines an agent's network access to an
allowlist and the agent then tries to reach a blocked host, directly and via a
redirect from a permitted one.
Expected outcome: the permitted host is fetched normally, the blocked host is
refused with a structured, machine-readable failure, and the blocked server
records no request at all — the refusal happens before any socket is opened."""

from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import TYPE_CHECKING

import pytest

from rotaris_core.config.schema import RotarisConfig
from rotaris_core.permissions.network import NetworkEgressPolicy
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.fetch import (
    EGRESS_DENIED,
    EGRESS_REDIRECT_DENIED,
    FetchAction,
    FetchExecutor,
)

if TYPE_CHECKING:
    from collections.abc import Iterator

pytestmark = pytest.mark.integration


class _RecordingServer:
    """A real HTTP server on an ephemeral port that logs every path it served."""

    def __init__(self, *, redirect_to: str | None = None) -> None:
        self.requests: list[str] = []
        self._lock = threading.Lock()
        self.redirect_to = redirect_to
        server = self

        class _Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.0"

            def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
                with server._lock:
                    server.requests.append(self.path)
                if self.path == "/redirect" and server.redirect_to is not None:
                    self.send_response(302)
                    self.send_header("Location", server.redirect_to)
                    self.end_headers()
                    return
                body = f"served {self.path}".encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args: object) -> None:
                """Silence the default stderr access log."""

        self._httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self.port = self._httpd.server_address[1]
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()

    def url(self, host: str, path: str = "/") -> str:
        return f"http://{host}:{self.port}{path}"

    def seen(self) -> list[str]:
        with self._lock:
            return list(self.requests)

    def close(self) -> None:
        self._httpd.shutdown()
        self._httpd.server_close()
        self._thread.join(timeout=5)


@pytest.fixture
def denied_server() -> Iterator[_RecordingServer]:
    """The host the policy blocks; addressed as 'localhost'."""
    server = _RecordingServer()
    try:
        yield server
    finally:
        server.close()


@pytest.fixture
def allowed_server(denied_server: _RecordingServer) -> Iterator[_RecordingServer]:
    """The host the policy allows; addressed as '127.0.0.1'.

    Its ``/redirect`` route bounces to the denied server, which is the hole a
    ``follow_redirects=True`` client would walk straight through.
    """
    server = _RecordingServer(redirect_to=denied_server.url("localhost", "/secret"))
    try:
        yield server
    finally:
        server.close()


def _executor() -> FetchExecutor:
    """A real executor carrying the policy a real config would produce.

    Both servers listen on loopback, so the two "hosts" are the two spellings of
    it: ``127.0.0.1`` is allowlisted and ``localhost`` is on the deny list.
    """
    config = RotarisConfig()
    config.runtime.network_egress_policy = "deny"
    config.runtime.network_allowed_hosts = ["127.0.0.1"]
    config.runtime.network_denied_hosts = ["localhost"]
    return FetchExecutor(
        timeout=5.0,
        egress_policy=NetworkEgressPolicy.from_runtime(config.runtime),
    )


@verifies(SWR.SWR_2505)
def test_the_fetch_target_reaches_the_permission_engine_as_the_gated_command() -> None:
    """Productive use: a host-scoped rule can only fire if the dispatch gate
    tells it which host the call targets.
    Expected outcome: a tool whose effect is a URL rather than a command line
    presents that URL as the gated command, so the preset's fetch rules are not
    silently bypassed."""
    from rotaris_core.agents.safe_agent import _permission_request

    class _Action:
        def model_dump(self) -> dict[str, object]:
            return {"url": "https://example.com/page", "max_lines": 1000}

    class _ActionEvent:
        tool_name = "fetch"
        action = _Action()

    request = _permission_request("coder", _ActionEvent())

    assert request.command == "https://example.com/page"
    assert request.tool_name == "fetch"


@verifies(SWR.SWR_2505)
def test_an_allowlisted_host_is_fetched_normally(
    allowed_server: _RecordingServer,
) -> None:
    """Productive use: an operator allowlists the one host the task needs.
    Expected outcome: the agent fetches it and gets the content, so a deny-by-
    default policy is still usable."""
    executor = _executor()

    observation = executor(FetchAction(url=allowed_server.url("127.0.0.1", "/page")))

    assert not observation.is_error
    assert observation.status_code == 200
    assert observation.text == "served /page"
    assert allowed_server.seen() == ["/page"]


@verifies(SWR.SWR_2505)
def test_a_denied_host_is_refused_before_any_socket_is_opened(
    denied_server: _RecordingServer,
) -> None:
    """Productive use: the agent tries a host the operator blocked.
    Expected outcome: a structured refusal naming the host, and the blocked
    server never sees the request — the block is not a discarded response."""
    executor = _executor()

    observation = executor(FetchAction(url=denied_server.url("localhost", "/secret")))

    assert observation.is_error
    assert observation.failure_kind == EGRESS_DENIED
    assert "localhost" in (observation.detail or "")
    assert denied_server.seen() == []


@verifies(SWR.SWR_2505)
def test_a_redirect_onto_a_denied_host_is_refused_and_never_followed(
    allowed_server: _RecordingServer,
    denied_server: _RecordingServer,
) -> None:
    """Productive use: a permitted host answers with a redirect to a blocked one.
    Expected outcome: the hop is re-classified and refused, and the blocked
    server records zero requests — an allowlisted host cannot be used as a
    bounce pad."""
    executor = _executor()

    observation = executor(FetchAction(url=allowed_server.url("127.0.0.1", "/redirect")))

    assert observation.is_error
    assert observation.failure_kind == EGRESS_REDIRECT_DENIED
    assert "localhost" in (observation.detail or "")
    assert allowed_server.seen() == ["/redirect"]
    assert denied_server.seen() == []


@verifies(SWR.SWR_2505)
def test_a_redirect_within_the_allowlist_is_still_followed(
    allowed_server: _RecordingServer,
) -> None:
    """Productive use: an allowlisted host redirects to another path on itself.
    Expected outcome: the fetch completes and reports the final URL, so turning
    redirect-following off did not break ordinary redirects."""
    allowed_server.redirect_to = allowed_server.url("127.0.0.1", "/final")
    executor = _executor()

    observation = executor(FetchAction(url=allowed_server.url("127.0.0.1", "/redirect")))

    assert not observation.is_error
    assert observation.text == "served /final"
    assert observation.final_url == allowed_server.url("127.0.0.1", "/final")
    assert allowed_server.seen() == ["/redirect", "/final"]


@verifies(SWR.SWR_2505)
def test_the_shipped_ask_default_still_follows_an_ordinary_same_host_redirect(
    allowed_server: _RecordingServer,
) -> None:
    """Productive use: an operator leaves the default egress policy at 'ask' and
    the agent fetches a URL that redirects to its canonical form on the same host.
    Expected outcome: the fetch completes — re-gating a hop that stays on the
    host the permission engine already approved would break ordinary redirects
    for everyone."""
    allowed_server.redirect_to = allowed_server.url("127.0.0.1", "/final")
    executor = FetchExecutor(timeout=5.0, egress_policy=NetworkEgressPolicy())

    observation = executor(FetchAction(url=allowed_server.url("127.0.0.1", "/redirect")))

    assert not observation.is_error
    assert observation.text == "served /final"


@verifies(SWR.SWR_2505)
def test_the_ask_default_refuses_a_redirect_onto_an_unapproved_new_host(
    allowed_server: _RecordingServer,
    denied_server: _RecordingServer,
) -> None:
    """Productive use: under the 'ask' default a permitted host redirects to a
    host nobody was ever asked about.
    Expected outcome: the hop is refused rather than silently followed — the
    approval covered the host the agent named, not wherever it points."""
    executor = FetchExecutor(timeout=5.0, egress_policy=NetworkEgressPolicy())

    observation = executor(FetchAction(url=allowed_server.url("127.0.0.1", "/redirect")))

    assert observation.is_error
    assert observation.failure_kind == EGRESS_REDIRECT_DENIED
    assert denied_server.seen() == []


@verifies(SWR.SWR_2505)
def test_the_refusal_is_distinguishable_from_a_network_fault(
    denied_server: _RecordingServer,
) -> None:
    """Productive use: the agent must re-plan after a policy refusal instead of
    retrying it like a flaky connection.
    Expected outcome: the failure kind is a policy constant, never the transient
    'network_error' or 'timeout', and the diagnostic the model reads says so."""
    executor = _executor()

    observation = executor(FetchAction(url=denied_server.url("localhost", "/secret")))
    rendered = observation.to_llm_content[0].text

    assert observation.failure_kind not in {"network_error", "timeout", "http_error"}
    assert f'"failure_kind": "{EGRESS_DENIED}"' in rendered
    assert observation.error_class == "NetworkEgressDenied"
