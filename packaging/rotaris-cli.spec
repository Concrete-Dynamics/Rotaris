# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for ``rotaris-cli`` (SWR-3001).

    python -m rotaris_core.packaging build rotaris-cli --mode onedir
"""

from PyInstaller.utils.hooks import copy_metadata

from rotaris_core.packaging import bundle_mode, bundle_spec

spec = bundle_spec("rotaris-cli")
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
        pyz, a.scripts, a.binaries, a.datas, [], name=spec.name, console=spec.console, upx=False
    )
else:
    exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name=spec.name, console=spec.console, upx=False)
    coll = COLLECT(exe, a.binaries, a.datas, upx=False, name=spec.name)
