@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Please install Node.js 22 or newer: https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  call npm install
  if errorlevel 1 goto :failed
)
call npm run build
if errorlevel 1 goto :failed
echo.
echo Website Audit Kit: http://127.0.0.1:4318
echo Keep this window open. Press Ctrl+C to stop.
call npm start
goto :eof
:failed
echo Setup failed. See the error above.
pause
exit /b 1
