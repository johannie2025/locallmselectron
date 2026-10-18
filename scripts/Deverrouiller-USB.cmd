@echo off
rem Wise Design Learning Systems - autorise a nouveau les cles USB (a lancer en administrateur)
net session >nul 2>&1 || (echo Faites un clic droit - Executer en tant qu'administrateur. & pause & exit /b 1)
reg add "HKLM\SYSTEM\CurrentControlSet\Services\USBSTOR" /v Start /t REG_DWORD /d 3 /f
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices" /v Deny_All /f
echo.
echo USB autorise. Redemarrez le PC pour une prise en compte complete.
pause
