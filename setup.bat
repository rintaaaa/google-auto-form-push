@echo off
setlocal

cd /d %~dp0

echo ========================================
echo Google Form RPA setup
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: node was not found.
  echo Please install Node.js first.
  echo.
  echo PowerShell:
  echo winget install OpenJS.NodeJS.LTS
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found.
  echo Please install Node.js first.
  echo.
  pause
  exit /b 1
)

where npx >nul 2>nul
if errorlevel 1 (
  echo ERROR: npx was not found.
  echo Please install Node.js first.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo ERROR: package.json was not found.
  echo Please place setup.bat in the same folder as package.json.
  echo.
  pause
  exit /b 1
)

call :ensure_dependencies
if errorlevel 1 exit /b 1

call :ensure_playwright_chromium
if errorlevel 1 exit /b 1

echo.
echo Setup completed.
echo.
pause
exit /b 0


:ensure_dependencies
echo Checking npm dependencies...
echo.

node -e "require('playwright')" >nul 2>nul
if not errorlevel 1 (
  echo npm dependencies already look OK.
  echo.
  exit /b 0
)

echo npm dependencies are missing or incomplete.
echo Installing dependencies...
echo.

if exist "package-lock.json" (
  echo package-lock.json found. Running npm ci...
  npm ci
) else (
  echo package-lock.json not found. Running npm install...
  npm install
)

if errorlevel 1 (
  echo.
  echo ERROR: Failed to install npm dependencies.
  echo.
  pause
  exit /b 1
)

echo.
echo npm dependencies installed.
echo.
exit /b 0


:ensure_playwright_chromium
for /f "usebackq delims=" %%V in (`node -p "require('./package.json').dependencies && require('./package.json').dependencies.playwright ? require('./package.json').dependencies.playwright : ''"`) do set PLAYWRIGHT_VERSION=%%V

if "%PLAYWRIGHT_VERSION%"=="" (
  echo ERROR: Could not read Playwright version from package.json.
  echo Please check dependencies.playwright in package.json.
  echo.
  pause
  exit /b 1
)

echo Playwright version: %PLAYWRIGHT_VERSION%
echo.

set PLAYWRIGHT_CACHE=%LOCALAPPDATA%\ms-playwright
set NEED_INSTALL=1

echo Checking Playwright Chromium...
echo.

if exist "%PLAYWRIGHT_CACHE%" (
  for /d %%D in ("%PLAYWRIGHT_CACHE%\chromium-*") do (
    set NEED_INSTALL=0
  )
)

if "%NEED_INSTALL%"=="0" (
  echo Playwright Chromium already exists.
  echo.
  exit /b 0
)

echo Playwright Chromium was not found.
echo Installing Playwright Chromium...
echo.

npx --yes playwright@%PLAYWRIGHT_VERSION% install chromium

if errorlevel 1 (
  echo.
  echo ERROR: Failed to install Playwright Chromium.
  echo.
  pause
  exit /b 1
)

echo.
echo Playwright Chromium installed.
echo.
exit /b 0