from __future__ import annotations

import httpx
import respx

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.tools.fetch import FetchAction, FetchExecutor


@verifies(SWR.SWR_527, SWR.SWR_528, SWR.SWR_531)
@respx.mock
def test_successful_fetch_returns_content_and_metadata() -> None:
    respx.get("https://example.com/").mock(
        return_value=httpx.Response(
            200,
            text="line1\nline2",
            headers={"content-type": "text/plain"},
        ),
    )

    obs = FetchExecutor()(FetchAction(url="https://example.com/"))

    assert not obs.is_error
    assert obs.url == "https://example.com/"
    assert obs.final_url == "https://example.com/"
    assert obs.status_code == 200
    assert obs.text == "line1\nline2"


@verifies(SWR.SWR_529)
@respx.mock
def test_truncation_at_max_lines() -> None:
    respx.get("https://example.com/").mock(return_value=httpx.Response(200, text="a\nb\nc\nd"))

    obs = FetchExecutor()(FetchAction(url="https://example.com/", max_lines=2))

    assert not obs.is_error
    assert obs.truncated is True
    assert obs.text == "a\nb"


@verifies(SWR.SWR_530)
@respx.mock
def test_fetch_applies_line_range() -> None:
    respx.get("https://example.com/").mock(return_value=httpx.Response(200, text="a\nb\nc\nd"))

    obs = FetchExecutor()(FetchAction(url="https://example.com/", from_line=2, to_line=3))

    assert not obs.is_error
    assert obs.text == "b\nc"


@verifies(SWR.SWR_532)
@respx.mock
def test_network_error_returns_error_observation() -> None:
    respx.get("https://example.com/").mock(side_effect=httpx.ConnectError("boom"))

    obs = FetchExecutor()(FetchAction(url="https://example.com/"))

    assert obs.is_error
    assert obs.failure_kind == "network_error"
    assert "failed before a response was received" in obs.text


@verifies(SWR.SWR_532)
@respx.mock
def test_timeout_returns_error_observation() -> None:
    respx.get("https://example.com/").mock(side_effect=httpx.ReadTimeout("slow"))

    obs = FetchExecutor(timeout=0.01)(FetchAction(url="https://example.com/"))

    assert obs.is_error
    assert obs.failure_kind == "timeout"
    assert obs.timeout_seconds == 0.01
    rendered = obs.to_llm_content[0].text
    assert '"failure_kind": "timeout"' in rendered
    assert '"timeout_seconds": 0.01' in rendered


@verifies(SWR.SWR_532)
def test_fetch_action_timeout_overrides_executor_default(monkeypatch) -> None:
    observed: dict[str, float] = {}

    class _Client:
        def __init__(self, *, timeout: float, follow_redirects: bool) -> None:
            observed["timeout"] = timeout

        def __enter__(self) -> _Client:
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            return None

        def get(self, url: str) -> httpx.Response:
            return httpx.Response(
                200,
                text="ok",
                headers={"content-type": "text/plain"},
                request=httpx.Request("GET", url),
            )

    monkeypatch.setattr("rotaris_core.tools.fetch.httpx.Client", _Client)

    obs = FetchExecutor(timeout=30.0)(FetchAction(url="https://example.com/", timeout=1.5))

    assert not obs.is_error
    assert observed["timeout"] == 1.5


@respx.mock
@verifies(SWR.SWR_531)
def test_redirect_updates_final_url() -> None:
    respx.get("https://example.com/").mock(
        return_value=httpx.Response(302, headers={"location": "https://example.com/final"}),
    )
    respx.get("https://example.com/final").mock(
        return_value=httpx.Response(200, text="ok", headers={"content-type": "text/plain"}),
    )

    obs = FetchExecutor()(FetchAction(url="https://example.com/"))

    assert not obs.is_error
    assert obs.final_url == "https://example.com/final"
