# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Rotaris desktop app (SWR-3001).

Thin by intent: every content decision lives in ``rotaris_core.packaging``, which
derives it from the source tree and is unit-tested. Build through the documented
command rather than calling PyInstaller directly:

    python -m rotaris_core.packaging build rotaris --mode onedir
"""

from PyInstaller.utils.hooks import copy_metadata

from rotaris_core.packaging import bundle_mode, bundle_spec

spec = bundle_spec("rotaris")
mode = bundle_mode()

datas = list(spec.datas)
for distribution in spec.metadata_packages:
    datas += copy_metadata(distribution)

a = Analysis(
    [str(spec.entry_script)],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=list(spec.hidden_imports),
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter"],
    noarchive=False,
)
pyz = PYZ(a.pure)

if mode == "onefile":
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.datas,
        [],
        name=spec.name,
        console=spec.console,
        icon=spec.icon,
        upx=False,
    )
else:
    exe = EXE(
        pyz,
        a.scripts,
        [],
        exclude_binaries=True,
        name=spec.name,
        console=spec.console,
        icon=spec.icon,
        upx=False,
    )
    coll = COLLECT(exe, a.binaries, a.datas, upx=False, name=spec.name)
    # macOS ships the onedir tree inside an .app bundle (AC-005); the DMG wraps it.
    app = BUNDLE(coll, name=f"{spec.name}.app", icon=spec.icon, bundle_identifier="ai.rotaris.app")
