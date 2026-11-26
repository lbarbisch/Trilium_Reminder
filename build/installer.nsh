; Removes the sign-in entry that the app writes with app.setLoginItemSettings.
; Keep the value name in sync with LOGIN_ITEM_NAME in src/main/index.ts.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "TriliumReminder"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "TriliumReminder"
  ${endIf}
!macroend
