@echo off
rem Wise Design Learning Systems - comptes Windows et mode cybercafe (se relance tout seul en administrateur)
net session >nul 2>&1
if errorlevel 1 (
  echo Demande des droits administrateur...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
set PS=powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Comptes-Windows.ps1"
:menu
cls
echo ==============================================================
echo   Wise Design Learning Systems - Comptes Windows
echo ==============================================================
echo.
echo   1. Lister les comptes et leur mode
echo   2. Creer un compte eleve (standard)
echo   3. ACTIVER le mode cybercafe pour un compte
echo        (l'application remplace le bureau Windows)
echo   4. DESACTIVER le mode cybercafe pour un compte
echo   0. Quitter
echo.
set C=
set /p C=Votre choix : 
if "%C%"=="1" (%PS% -Action List & pause & goto menu)
if "%C%"=="2" (%PS% -Action Create & pause & goto menu)
if "%C%"=="3" (%PS% -Action Enable & pause & goto menu)
if "%C%"=="4" (%PS% -Action Disable & pause & goto menu)
if "%C%"=="0" exit /b
goto menu
