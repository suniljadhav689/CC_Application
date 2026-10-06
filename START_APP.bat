@echo off
title Credit Card Analyzer
echo ===================================================
echo     Starting Credit Card Analyzer Application
echo ===================================================
echo.
echo Starting Backend (FastAPI)...
start "Credit Card Analyzer Backend" cmd /k "cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000"

echo Starting Frontend (React/Vite)...
start "Credit Card Analyzer Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Backend API is starting on: http://localhost:8000
echo Frontend UI is starting on: http://localhost:5173
echo.
echo Please wait a few seconds for both servers to boot up.
echo Once ready, your browser will open the frontend automatically!
echo.
echo Keep the two new command prompt windows open while using the app.
echo Close them when you want to stop the application.
echo.
pause
