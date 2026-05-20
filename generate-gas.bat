@echo off
cd /d %~dp0

echo Generating GAS files...
echo.

npm run generate:gas

pause
