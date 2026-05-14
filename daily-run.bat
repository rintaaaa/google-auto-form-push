@echo off
cd /d %~dp0

echo Starting daily Google Form auto push...
echo.

node daily-run.js

pause