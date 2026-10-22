@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "PYTHONEXE="
where py >nul 2>nul && set "PYTHONEXE=py -3"
if not defined PYTHONEXE (
  where python >nul 2>nul && set "PYTHONEXE=python"
)
if not defined PYTHONEXE (
  echo [FAIL] Python 3 was not found. Existing PC Python environment must be checked.
  pause
  exit /b 2
)
echo =========================================
echo  MarketPasu - Existing Kiwoom Scout Check
echo  READ ONLY / NO LOGIN / NO ORDER / NO TOKEN
echo =========================================
%PYTHONEXE% scout_preflight.py
if errorlevel 1 (
  echo [FAIL] Preflight could not run.
) else (
  echo.
  echo [PASS] Safe local file/path check finished.
  echo [NOTE] This does NOT mean Kiwoom live connection succeeded.
)
echo.
echo Please share only the check result, never AppKey, Secret, Token or credential files.
pause
