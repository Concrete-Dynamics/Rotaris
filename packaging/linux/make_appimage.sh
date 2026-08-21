#!/usr/bin/env bash
# Wraps the Linux onedir build in an AppImage (SWR-3001, AC-006).
#
#   python -m rotaris_core.packaging build rotaris --mode onedir
#   packaging/linux/make_appimage.sh <version>
#
# Requires appimagetool on PATH. Built against a stock glibc distribution
# (Ubuntu 24.04 or equivalent) — the AppImage is only as portable as the glibc
# it was linked on, so build on the oldest supported base.
set -euo pipefail

VERSION="${1:?usage: make_appimage.sh <version>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist/rotaris"
APPDIR="${REPO_ROOT}/dist/Rotaris.AppDir"
OUTPUT="${REPO_ROOT}/dist/Rotaris-${VERSION}-linux-x86_64.AppImage"

[ -d "${DIST_DIR}" ] || {
  echo "missing ${DIST_DIR} — run the onedir build on Linux first" >&2
  exit 1
}

rm -rf "${APPDIR}"
mkdir -p "${APPDIR}/usr/bin" "${APPDIR}/usr/share/applications"
cp -R "${DIST_DIR}/." "${APPDIR}/usr/bin/"
cp "${REPO_ROOT}/packaging/linux/rotaris.desktop" "${APPDIR}/rotaris.desktop"
cp "${REPO_ROOT}/packaging/linux/rotaris.desktop" "${APPDIR}/usr/share/applications/"

if [ -f "${REPO_ROOT}/packaging/assets/rotaris.png" ]; then
  cp "${REPO_ROOT}/packaging/assets/rotaris.png" "${APPDIR}/rotaris.png"
fi

cat > "${APPDIR}/AppRun" <<'APPRUN'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "${HERE}/usr/bin/rotaris" "$@"
APPRUN
chmod +x "${APPDIR}/AppRun"

rm -f "${OUTPUT}"
appimagetool "${APPDIR}" "${OUTPUT}"

echo "${OUTPUT}"
