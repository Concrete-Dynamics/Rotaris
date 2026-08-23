"""Pinned external-tool supply manifest for first-launch setup."""

from __future__ import annotations

import hashlib
import json
import platform
import sys
from dataclasses import asdict

from rotaris_core.config.defaults import (
    PLAYWRIGHT_MCP_PINNED_VERSION as PLAYWRIGHT_MCP_VERSION,
)
from rotaris_core.reqtocode import SWR, traces

from .models import PlatformArtifact, SetupManifest, ToolSpec


def platform_key() -> str:
    machine = platform.machine().lower()
    if sys.platform == "win32" and machine in {"amd64", "x86_64"}:
        return "windows-x64"
    if sys.platform == "darwin" and machine in {"arm64", "aarch64"}:
        return "macos-arm64"
    if sys.platform.startswith("linux") and machine in {"amd64", "x86_64"}:
        return "linux-x86_64"
    return f"{sys.platform}-{machine}"


def _artifact(
    url: str,
    sha256: str,
    archive: str,
    *executables: str,
    strip_components: int = 1,
) -> PlatformArtifact:
    return PlatformArtifact(url, sha256, archive, tuple(executables), strip_components)


@traces(SWR.SWR_3715)
def default_setup_manifest() -> SetupManifest:
    """Return the release-pinned tool contract in deterministic setup order."""
    tools = (
        ToolSpec(
            name="git",
            command="git",
            version_args=("--version",),
            minimum_version="2.36.0",
            provisioned_version="2.55.0",
            artifacts={
                "windows-x64": _artifact(
                    "https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.3/MinGit-2.55.0.3-64-bit.zip",
                    "f48e2d2dc74a24454adc6d8fd0ac25bf9c2386f19cfb06202b9465aaad4f9f05",
                    "zip",
                    "cmd/git.exe",
                    strip_components=0,
                ),
            },
            binary_dirs=("cmd",),
            license="GPL-2.0-only",
            capabilities=("worktrees", "checkpoints"),
        ),
        ToolSpec(
            name="node",
            command="node",
            version_args=("--version",),
            minimum_version="20.0.0",
            provisioned_version="24.19.0",
            artifacts={
                "windows-x64": _artifact(
                    "https://nodejs.org/download/release/v24.19.0/node-v24.19.0-win-x64.zip",
                    "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73",
                    "zip",
                    "node.exe",
                    "npx.cmd",
                ),
                "macos-arm64": _artifact(
                    "https://nodejs.org/download/release/v24.19.0/node-v24.19.0-darwin-arm64.tar.gz",
                    "8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d",
                    "tar.gz",
                    "bin/node",
                    "bin/npx",
                ),
                "linux-x86_64": _artifact(
                    "https://nodejs.org/download/release/v24.19.0/node-v24.19.0-linux-x64.tar.gz",
                    "f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4",
                    "tar.gz",
                    "bin/node",
                    "bin/npx",
                ),
            },
            binary_dirs=("bin", "."),
            license="MIT",
            capabilities=("JavaScript MCP servers",),
        ),
        ToolSpec(
            name="ripgrep",
            command="rg",
            version_args=("--version",),
            minimum_version="14.1.0",
            provisioned_version="15.2.0",
            artifacts={
                "windows-x64": _artifact(
                    "https://github.com/BurntSushi/ripgrep/releases/download/15.2.0/ripgrep-15.2.0-x86_64-pc-windows-msvc.zip",
                    "71b2fef860abe467217a538ff31de02f5258807c0129f771846f87bd029aafc5",
                    "zip",
                    "rg.exe",
                ),
                "macos-arm64": _artifact(
                    "https://github.com/BurntSushi/ripgrep/releases/download/15.2.0/ripgrep-15.2.0-aarch64-apple-darwin.tar.gz",
                    "3750b2e93f37e0c692657da574d7019a101c0084da05a790c83fd335bad973e4",
                    "tar.gz",
                    "rg",
                ),
                "linux-x86_64": _artifact(
                    "https://github.com/BurntSushi/ripgrep/releases/download/15.2.0/ripgrep-15.2.0-x86_64-unknown-linux-musl.tar.gz",
                    "33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c",
                    "tar.gz",
                    "rg",
                ),
            },
            binary_dirs=(".",),
            license="Unlicense OR MIT",
            capabilities=("search",),
        ),
    )
    return SetupManifest(
        schema_version=1,
        tools=tools,
        mcp_pins={
            "@playwright/mcp": PLAYWRIGHT_MCP_VERSION,
        },
    )


@traces(SWR.SWR_3715)
def manifest_fingerprint(manifest: SetupManifest) -> str:
    payload = json.dumps(asdict(manifest), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
