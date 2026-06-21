@echo off
title Chiflix Stream Pro v2
echo ========================================
echo   Chiflix Stream Pro v2 - Starting...
echo ========================================
echo.

echo [1/2] Starting Backend (FastAPI)...
start /B "" python backend\server.py
timeout /T 3 /NOBREAK >nul

echo [2/2] Starting Frontend (Vite + React)...
cd frontend
start /B "" pnpm run dev
cd ..

echo.
echo ========================================
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8000
echo ========================================
echo.
echo Waiting for frontend to be ready...
timeout /T 8 /NOBREAK >nul
start http://localhost:3000
echo.
echo Press any key to stop all servers...
pause >nul

taskkill /F /IM python.exe /T >nul 2>&1
taskkill /F /IM node.exe /T >nul 2>&1
echo Servers stopped.
