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

  ; 4) Pare-feu : autorise l'application en ENTRÉE (utile seulement si le poste est configuré en « serveur » ; l'application n'écoute rien sinon)
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Wise Design Learning Systems (serveur)"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Wise Design Learning Systems (serveur)" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=any'

  ; 5) Raccourci de maintenance : comptes Windows + mode cybercafé (le .cmd demande lui-même les droits administrateur)
  CreateDirectory "$SMPROGRAMS\Wise Design - Maintenance"
  CreateShortCut "$SMPROGRAMS\Wise Design - Maintenance\Comptes Windows et mode cybercafe.lnk" "$INSTDIR\resources\scripts\Mode-Cybercafe.cmd"
!macroend

!macro customUnInstall
  SetRegView 64
  DeleteRegValue HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Run" "WiseDesignLearningSystems"
  ; Réautorise le stockage USB
  WriteRegDWORD HKLM "SYSTEM\CurrentControlSet\Services\USBSTOR" "Start" 3
  DeleteRegValue HKLM "SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices" "Deny_All"
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Wise Design Learning Systems (serveur)"'
  Delete "$SMPROGRAMS\Wise Design - Maintenance\Comptes Windows et mode cybercafe.lnk"
  RMDir "$SMPROGRAMS\Wise Design - Maintenance"
  ; (les cours et la base de données ne sont pas supprimés)
!macroend
