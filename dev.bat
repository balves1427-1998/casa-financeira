@echo off
setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════╗
echo ║   Casa Financeira - Development Mode   ║
echo ╚════════════════════════════════════════╝
echo.

REM Check if Docker containers are running
echo Checking Docker containers...
docker-compose ps | find "postgres" >nul
if errorlevel 1 (
    echo Starting Docker containers...
    docker-compose up -d
    timeout /t 3 /nobreak
)

echo ✓ Docker containers are running
echo.

REM Start backend and frontend in separate windows
echo Starting Backend...
start "Casa Financeira - Backend" cmd /k "cd backend && npm run start:dev"

timeout /t 2 /nobreak

echo Starting Frontend...
start "Casa Financeira - Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ✅ Development servers started!
echo.
echo Services:
echo   Backend:  http://localhost:3000
echo   Frontend: http://localhost:3001
echo.
echo To stop the servers, close the individual terminal windows.
echo.

pause
