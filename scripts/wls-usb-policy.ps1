# Wise Design Learning Systems - politique USB appliquee par une tache planifiee SYSTEM (toutes les minutes + au demarrage).
# Si le fichier drapeau "usb.unlock" existe (cree par l'application quand un admin coche "maintenance"), les cles USB sont autorisees ;
# sinon elles sont bloquees. Seul ce drapeau est modifiable par les utilisateurs : ce script (dans Program Files) ne l'est pas.
$flag = Join-Path $env:ProgramData 'WiseDesignLMS\usb.unlock'
$usbstor = 'HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR'
$policy  = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices'
try {
  if (Test-Path $flag) { $start = 3; $deny = 0 } else { $start = 4; $deny = 1 }
  Set-ItemProperty -Path $usbstor -Name Start -Value $start -Type DWord -ErrorAction Stop
  if (-not (Test-Path $policy)) { New-Item -Path $policy -Force | Out-Null }
  Set-ItemProperty -Path $policy -Name Deny_All -Value $deny -Type DWord
} catch { }
