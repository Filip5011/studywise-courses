; Extra steps for the Windows installer (electron-builder's nsis.include).
;
; Versions up to 1.8.7 shipped the phone app's Capacitor packages, with their
; Android build output, inside resources\app.asar.unpacked. Some of those paths
; are longer than Windows' 260-character limit (how long depends on the user
; name), and the old version's uninstaller can't move or delete them. Installing
; a new version runs that uninstaller first, so it failed with "Failed to
; uninstall old application files. Please try running the installer again.: 2".
;
; The desktop app never uses those files, so when the installer starts, before
; the old uninstaller runs, we delete them with a long-path-safe delete (rd
; with a \\?\ path). The old install's folder comes from the registry
; (InstallLocation, which every electron-builder installer writes). 1.8.8 and
; later don't ship these files at all (see electron-builder.config.cjs).

!macro studywiseRemoveLongPaths DIR
  ${If} "${DIR}" != ""
  ${AndIf} ${FileExists} "${DIR}\resources\app.asar.unpacked\node_modules\@capacitor\*.*"
    DetailPrint `Removing old Android build files from ${DIR}`
    Push $1
    nsExec::Exec `"$SYSDIR\cmd.exe" /c rd /s /q "\\?\${DIR}\resources\app.asar.unpacked\node_modules\@capacitor"`
    Pop $1
    Pop $1
  ${EndIf}
!macroend

; Runs when the installer starts, before anything is uninstalled.
!macro customInit
  Push $0
  ReadRegStr $0 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  !insertmacro studywiseRemoveLongPaths $0
  ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  !insertmacro studywiseRemoveLongPaths $0
  Pop $0
!macroend
