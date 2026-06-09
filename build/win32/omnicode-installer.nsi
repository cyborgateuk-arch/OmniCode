Unicode true
ManifestDPIAware true
RequestExecutionLevel user

!ifndef SOURCE_DIR
	!error "SOURCE_DIR must point to a packaged VSCode-win32-x64 directory"
!endif

!ifndef OUT_FILE
	!error "OUT_FILE must point to the installer exe to create"
!endif

!define APP_NAME "OmniCode"
!define APP_EXE "OmniCode.exe"
!define COMPANY_NAME "OmniCode"
!define REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\OmniCode"

Name "${APP_NAME}"
OutFile "${OUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\OmniCode"
InstallDirRegKey HKCU "${REG_KEY}" "InstallLocation"

SetCompressor /SOLID lzma
SetCompressorDictSize 64

VIProductVersion "1.121.1.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "CompanyName" "${COMPANY_NAME}"
VIAddVersionKey "FileDescription" "${APP_NAME} Installer"
VIAddVersionKey "FileVersion" "1.121.1.0"
VIAddVersionKey "ProductVersion" "1.121.1"

Page directory
Page instfiles

UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
	SetOutPath "$INSTDIR"
	RMDir /r "$INSTDIR"
	CreateDirectory "$INSTDIR"
	SetOutPath "$INSTDIR"
	File /r /x ".DS_Store" "${SOURCE_DIR}\*"

	CreateDirectory "$SMPROGRAMS\OmniCode"
	CreateShortcut "$SMPROGRAMS\OmniCode\OmniCode.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
	CreateShortcut "$DESKTOP\OmniCode.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0

	WriteUninstaller "$INSTDIR\Uninstall OmniCode.exe"
	WriteRegStr HKCU "${REG_KEY}" "DisplayName" "${APP_NAME}"
	WriteRegStr HKCU "${REG_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE}"
	WriteRegStr HKCU "${REG_KEY}" "DisplayVersion" "1.121.1"
	WriteRegStr HKCU "${REG_KEY}" "InstallLocation" "$INSTDIR"
	WriteRegStr HKCU "${REG_KEY}" "Publisher" "${COMPANY_NAME}"
	WriteRegStr HKCU "${REG_KEY}" "UninstallString" "$INSTDIR\Uninstall OmniCode.exe"
	WriteRegDWORD HKCU "${REG_KEY}" "NoModify" 1
	WriteRegDWORD HKCU "${REG_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
	Delete "$DESKTOP\OmniCode.lnk"
	Delete "$SMPROGRAMS\OmniCode\OmniCode.lnk"
	RMDir "$SMPROGRAMS\OmniCode"
	RMDir /r "$INSTDIR"
	DeleteRegKey HKCU "${REG_KEY}"
SectionEnd
