#!/usr/bin/env bash
# Wraps the macOS .app bundle in a DMG (SWR-3001, AC-005).
#
# Native ARM64 (Apple Silicon). universal2 would need every native dependency
# installed as a universal2 wheel, and uv resolves host-matched wheels — see
# SWR-3001 AC-005. Intel Macs are not covered.
#
#   python -m rotaris_core.packaging build rotaris --mode onedir
#   packaging/macos/make_dmg.sh <version>
#
# Unsigned and un-notarized by design (out of scope): Gatekeeper will ask the
# user to confirm the first launch.
set -euo pipefail

VERSION="${1:?usage: make_dmg.sh <version>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_BUNDLE="${REPO_ROOT}/dist/rotaris.app"
STAGING="$(mktemp -d)"
OUTPUT="${REPO_ROOT}/dist/Rotaris-${VERSION}-macos-arm64.dmg"

trap 'rm -rf "${STAGING}"' EXIT

[ -d "${APP_BUNDLE}" ] || {
  echo "missing ${APP_BUNDLE} — run the onedir build on macOS first" >&2
  exit 1
}

cp -R "${APP_BUNDLE}" "${STAGING}/"
ln -s /Applications "${STAGING}/Applications"

rm -f "${OUTPUT}"
hdiutil create \
  -volname "Rotaris ${VERSION}" \
  -srcfolder "${STAGING}" \
  -ov -format UDZO \
  "${OUTPUT}"

echo "${OUTPUT}"
