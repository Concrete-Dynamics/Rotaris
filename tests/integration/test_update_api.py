"""Productive use: Rotaris starts. Whatever GitHub says — or fails to say — the
window opens and the user gets on with their work.
Expected outcome: a real HTTP round trip through the shipped client returns a
usable release when there is one, and ``None`` for every way the answer can fail
to arrive, without an exception, a dialog, or a delayed launch."""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

import httpx
import respx

from rotaris_core.packaging.release import artifact_name
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.updates.check import (
    LATEST_RELEASE_URL,
    REQUEST_TIMEOUT_SECONDS,
    HttpFetcher,
    Install,
    InstallKind,
    asset_for,
    latest_release,
)

if TYPE_CHECKING:
    import pytest


def _payload(version: str = "0.102.0", **overrides: object) -> dict[str, object]:
    document: dict[str, object] = {
        "tag_name": f"v{version}",
        "draft": False,
        "prerelease": False,
        "body": f"## Rotaris {version}\n\n## Changes\n\n- feat: an in-app update check\n",
        "assets": [
            {
                "name": artifact_name("setup", "windows-x64", version),
                "browser_download_url": "https://github.invalid/download/setup.exe",
                "size": 123456,
            },
            {
                "name": "SHA256SUMS.txt",
                "browser_download_url": "https://github.invalid/download/SHA256SUMS.txt",
                "size": 400,
            },
        ],
    }
    document.update(overrides)
    return document


@respx.mock
@verifies(SWR.SWR_3003)
def test_a_published_release_is_read_into_something_the_updater_can_use() -> None:
    """The whole read path over HTTP: the tag becomes a version, the body becomes
    a summary, and the asset list becomes a download this install can name."""
    respx.get(LATEST_RELEASE_URL).mock(return_value=httpx.Response(200, json=_payload()))

    release = latest_release(fetcher=HttpFetcher())

    assert release is not None
    assert release.version == "0.102.0"
    assert release.checksums is not None
    asset = asset_for(Install(InstallKind.WINDOWS_INSTALLER), release)
    assert asset is not None
    assert asset.size == 123456


@respx.mock
@verifies(SWR.SWR_3003)
def test_a_repository_with_no_release_yet_starts_the_app_silently(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """AC-003, and the current state of this repository: ``/releases/latest``
    answers 404 until the first tag is pushed. That is a launch like any other."""
    respx.get(LATEST_RELEASE_URL).mock(return_value=httpx.Response(404, json={}))

    with caplog.at_level(logging.INFO):
        assert latest_release(fetcher=HttpFetcher()) is None

    assert "404" in caplog.text


@respx.mock
@verifies(SWR.SWR_3003)
def test_an_exhausted_rate_limit_starts_the_app_silently() -> None:
    """Unauthenticated API calls are capped per IP. One launch behind a shared
    address can exhaust it for the next, which must still be an ordinary start."""
    respx.get(LATEST_RELEASE_URL).mock(
        return_value=httpx.Response(403, json={"message": "API rate limit exceeded"})
    )

    assert latest_release(fetcher=HttpFetcher()) is None


@respx.mock
@verifies(SWR.SWR_3003)
def test_an_unreachable_network_starts_the_app_silently() -> None:
    """AC-002. Offline is the common case for a laptop opening on a train."""
    respx.get(LATEST_RELEASE_URL).mock(side_effect=httpx.ConnectError("no route to host"))

    assert latest_release(fetcher=HttpFetcher()) is None


@respx.mock
@verifies(SWR.SWR_3003)
def test_a_timeout_starts_the_app_silently() -> None:
    respx.get(LATEST_RELEASE_URL).mock(side_effect=httpx.ReadTimeout("too slow"))

    assert latest_release(fetcher=HttpFetcher(timeout=REQUEST_TIMEOUT_SECONDS)) is None


@respx.mock
@verifies(SWR.SWR_3003)
def test_a_truncated_body_starts_the_app_silently() -> None:
    """AC-003. A proxy that returns half a document is indistinguishable from a
    hostile one at this layer, and both answers are the same: do nothing."""
    body = json.dumps(_payload())[: len(json.dumps(_payload())) // 2]
    respx.get(LATEST_RELEASE_URL).mock(return_value=httpx.Response(200, content=body))

    assert latest_release(fetcher=HttpFetcher()) is None


@respx.mock
@verifies(SWR.SWR_3003)
def test_a_response_that_is_not_a_release_starts_the_app_silently() -> None:
    """Valid JSON is not the same as a release. A list, a tag that is not a
    version, and a draft are each a payload the parser must refuse."""
    for document in ([], {"tag_name": "nightly"}, _payload(draft=True), _payload(prerelease=True)):
        respx.get(LATEST_RELEASE_URL).mock(return_value=httpx.Response(200, json=document))
        assert latest_release(fetcher=HttpFetcher()) is None


@respx.mock
@verifies(SWR.SWR_3003)
def test_an_asset_download_follows_the_redirect_github_answers_with() -> None:
    """Release assets answer 302 and point at another host. Without following
    that, every download is a redirect body that then fails its checksum."""
    respx.get("https://github.invalid/download/setup.exe").mock(
        return_value=httpx.Response(302, headers={"Location": "https://objects.invalid/blob"})
    )
    respx.get("https://objects.invalid/blob").mock(return_value=httpx.Response(200, content=b"MZ"))

    chunks = list(HttpFetcher().stream("https://github.invalid/download/setup.exe", chunk_size=64))

    assert b"".join(chunks) == b"MZ"
