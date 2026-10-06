@echo off
echo Starting Credit Card Analyzer Backend...
echo.
echo Backend will be available at: http://localhost:8000
echo API Docs at: http://localhost:8000/docs
echo.
echo Press CTRL+C to stop.
echo.
cd /d "%~dp0backend"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
