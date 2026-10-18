@echo off
rem Wise Design Learning Systems - bloque les cles USB (a lancer en administrateur)
net session >nul 2>&1 || (echo Faites un clic droit - Executer en tant qu'administrateur. & pause & exit /b 1)
reg add "HKLM\SYSTEM\CurrentControlSet\Services\USBSTOR" /v Start /t REG_DWORD /d 4 /f
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices" /v Deny_All /t REG_DWORD /d 1 /f
echo.
echo USB bloque. Redemarrez le PC pour une prise en compte complete.
pause
