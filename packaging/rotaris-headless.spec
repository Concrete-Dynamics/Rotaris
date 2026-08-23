# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for ``rotaris-headless`` (SWR-3001).

    python -m rotaris_core.packaging build rotaris-headless --mode onedir
"""

from PyInstaller.utils.hooks import collect_all, copy_metadata

from rotaris_core.packaging import bundle_mode, bundle_spec

spec = bundle_spec("rotaris-headless")
mode = bundle_mode()

datas = list(spec.datas)
binaries = []
hiddenimports = list(spec.hidden_imports)
for distribution in spec.metadata_packages:
    datas += copy_metadata(distribution)
for package in spec.collect_all_packages:
    package_datas, package_binaries, package_imports = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_imports

a = Analysis(
    [str(spec.entry_script)],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
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
