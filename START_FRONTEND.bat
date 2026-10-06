@echo off
echo Starting Credit Card Analyzer Frontend (Dev mode)...
echo.
echo Open http://localhost:5173 in your browser.
echo On iPhone, open http://YOUR_PC_IP:5173
echo.
cd /d "%~dp0frontend"
npm run dev
pause
