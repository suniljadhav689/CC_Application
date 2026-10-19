@echo off
echo Starting Credit Card Analyzer Frontend (Dev mode)...
echo.
echo Open http://localhost:5174 in your browser.
echo For iPhone access, run START_TAILSCALE.bat after starting the app.
echo.
cd /d "%~dp0frontend"
npm run dev
pause
