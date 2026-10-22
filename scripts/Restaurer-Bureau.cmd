@echo off
rem Wise Design Learning Systems - SECOURS : remet l'Explorateur Windows comme shell (a lancer en administrateur, p.ex. depuis le mode sans echec ou une invite de commandes de recuperation)
reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /t REG_SZ /d explorer.exe /f
schtasks /Delete /TN "WLS-USB-Policy" /F
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Windows\DeviceInstall\Restrictions" /f
reg add "HKLM\SYSTEM\CurrentControlSet\Services\USBSTOR" /v Start /t REG_DWORD /d 3 /f
echo Termine. Redemarrez le PC.
pause
