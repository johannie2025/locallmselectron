; Macros NSIS ajoutées à l'installeur electron-builder (installation « pour tous les utilisateurs »).

!macro customInstall
  SetRegView 64

  ; 1) Démarrage automatique à l'ouverture de session Windows (tous les utilisateurs)
  WriteRegStr HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "WiseDesignLearningSystems" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'

  ; 2) Blocage des périphériques de stockage USB (clavier/souris non concernés). Redémarrage conseillé.
  WriteRegDWORD HKLM "SYSTEM\CurrentControlSet\Services\USBSTOR" "Start" 4
  WriteRegDWORD HKLM "SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices" "Deny_All" 1

  ; 3) Dossiers de travail : cours + données partagées entre comptes Windows
  CreateDirectory "C:\formations_wls"
  CreateDirectory "C:\formations_wls\_branding"
  nsExec::ExecToLog 'icacls "C:\formations_wls" /grant *S-1-5-32-545:(OI)(CI)M /T /C'
  ReadEnvStr $0 "ProgramData"
  CreateDirectory "$0\WiseDesignLMS"
  nsExec::ExecToLog 'icacls "$0\WiseDesignLMS" /grant *S-1-5-32-545:(OI)(CI)M /T /C'
!macroend

!macro customUnInstall
  SetRegView 64
  DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "WiseDesignLearningSystems"
  ; Réautorise le stockage USB
  WriteRegDWORD HKLM "SYSTEM\CurrentControlSet\Services\USBSTOR" "Start" 3
  DeleteRegValue HKLM "SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices" "Deny_All"
  ; (les cours et la base de données ne sont pas supprimés)
!macroend
