@echo off
rem Wise Design Learning Systems - depannage : leve les restrictions Explorateur/Gestionnaire des taches
rem du compte Windows qui execute ce fichier (le lancer SOUS le compte restreint, ex. via Echap > Ctrl+Alt+Suppr > Nouvelle session).
set E=HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer
set S=HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System
for %%V in (NoDrives NoViewOnDrive NoRun NoControlPanel NoFolderOptions NoWinKeys) do reg delete "%E%" /v %%V /f >nul 2>&1
reg delete "%S%" /v DisableTaskMgr /f >nul 2>&1
taskkill /f /im explorer.exe >nul 2>&1
echo Restrictions levees pour %USERNAME%.
pause
