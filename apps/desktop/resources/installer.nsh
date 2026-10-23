; ADR-0054, REQ-STARTUP-016, REQ-STARTUP-017 — the assisted per-user installer's project include, named by
; electron-builder.yml's `nsis.include`. electron-builder puts it ahead of its own templates (app-builder-lib
; templates/nsis), and each macro below is a hook those templates insert by name.
;
; Why there are TWO registry values naming the installation directory, both kept on purpose:
;
;   HKCU\Software\<APP_GUID>\InstallLocation   electron-builder's own. Its installer reads it back to offer the previous
;                                              directory on an update or a reinstall, and its uninstaller to find the
;                                              tree. It is keyed by a GUID derived from `appId`, a name no requirement
;                                              states, and electron-builder deletes the whole key on uninstall.
;   HKCU\Software\Rotaris\InstallDir           REQ-STARTUP-016's. The updater reads it (apps/desktop/src/main/updater/
;                                              electron.ts, `reg.exe query`; parsed by classify.ts `parseInstallDir`) and
;                                              classifies a launch as the installed flavour only when the artifact lies
;                                              inside it (REQ-STARTUP-106).
;
; Neither is derived from the other at run time. This include writes the second from the same $INSTDIR electron-builder
; writes the first from, leaves the first exactly as electron-builder manages it, and removes only its own value — and
; only on an uninstall that is not the first half of an update.

; REQ-STARTUP-017: an interactive install warns when it is abandoned.
!define MUI_ABORTWARNING

; REQ-STARTUP-017: Welcome → Directory → Install → Finish. electron-builder's assisted installer draws no Welcome page
; of its own; its Finish page carries the checked-by-default "Run Rotaris" box.
!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

; REQ-STARTUP-016: strictly per-user with no elevation prompt. `perMachine: false` with `oneClick: false` would otherwise
; show electron-builder's install-mode page, whose "for all users" choice elevates; forcing the current user skips it.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; REQ-STARTUP-016: the default location is `%LOCALAPPDATA%\Rotaris`, where electron-builder would offer
; `%LOCALAPPDATA%\Programs\Rotaris`. electron-builder recomputes $INSTDIR from its own InstallLocation whenever the
; install mode is set — once in .onInit and again when the skipped install-mode page passes — so the default is given
; to it there, and only where there is no earlier installation to remember: an InstallLocation that exists is kept, and
; otherwise REQ-STARTUP-016's remembered InstallDir is preferred to the default. `/D=` still wins (REQ-STARTUP-017).
; Residue, stated: a first install abandoned before it copies anything leaves InstallLocation naming the default, which
; only pre-fills the next installer's directory page.
!macro customInit
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $0 == ""
    ReadRegStr $0 HKCU "Software\Rotaris" InstallDir
    ${if} $0 == ""
      StrCpy $0 "$LOCALAPPDATA\Rotaris"
    ${endif}
    WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$0"
    !insertmacro GetDParameter $R0
    ${if} $R0 == ""
      StrCpy $INSTDIR "$0"
    ${endif}
  ${endif}
!macroend

; REQ-STARTUP-016: the chosen directory, remembered where the updater reads it.
!macro customInstall
  WriteRegStr HKCU "Software\Rotaris" "InstallDir" "$INSTDIR"
!macroend

; An update runs the previous version's uninstaller with --updated before installing: the value then stays for the
; new install to rewrite. A real uninstall removes it, and the key when nothing else is left in it.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Rotaris" "InstallDir"
    DeleteRegKey /ifempty HKCU "Software\Rotaris"
  ${endif}
!macroend
