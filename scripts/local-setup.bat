@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "ARGS="

:parse
if "%~1"=="" goto run
if /I "%~1"=="--reset-db" set "ARGS=%ARGS% -ResetDb"
if /I "%~1"=="--start-web" set "ARGS=%ARGS% -StartWeb"
if /I "%~1"=="--start-ai" set "ARGS=%ARGS% -StartAi"
if /I "%~1"=="--skip-install" set "ARGS=%ARGS% -SkipInstall"
if /I "%~1"=="--yes" set "ARGS=%ARGS% -Yes"
shift
goto parse

:run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%local-setup.ps1" %ARGS%
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo local setup failed with exit code %EXIT_CODE%
)

exit /b %EXIT_CODE%
