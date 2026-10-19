@echo off
echo Starting Credit Card Analyzer Backend...
echo.
echo Backend will be available at: http://localhost:8000
echo API Docs at: http://localhost:8000/docs
echo.
echo Press CTRL+C to stop.
echo.
cd /d "%~dp0backend"
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --no-access-log
pause
