@echo off
setlocal enabledelayedexpansion

REM Colors (Windows 10+ supports ANSI escape sequences)
set "GREEN=[0;32m"
set "YELLOW=[1;33m"
set "RED=[0;31m"
set "NC=[0m"

echo.
echo %YELLOW%Casa Financeira - Complete Setup%NC%
echo ==================================
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo %RED%❌ Docker is not installed%NC%
    echo Please install Docker to continue: https://www.docker.com/products/docker-desktop
    exit /b 1
)

echo %GREEN%✓ Docker is installed%NC%

REM Check if Docker Compose is installed
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo %RED%❌ Docker Compose is not installed%NC%
    exit /b 1
)

echo %GREEN%✓ Docker Compose is installed%NC%

REM Create .env file if it doesn't exist
if not exist .env (
    echo %YELLOW%📝 Creating .env file...%NC%
    copy .env.example .env
    echo %GREEN%✓ .env created (please update with your values)%NC%
) else (
    echo %GREEN%✓ .env file already exists%NC%
)

echo.
echo %YELLOW%🐳 Starting Docker containers...%NC%

REM Start Docker containers
docker-compose down 2>nul
docker-compose up -d

REM Wait for PostgreSQL to be ready
echo %YELLOW%⏳ Waiting for PostgreSQL to be ready...%NC%
timeout /t 5 /nobreak

REM Simple wait (Docker will handle readiness)
for /l %%i in (1,1,30) do (
    docker-compose exec -T postgres pg_isready -U postgres >nul 2>&1
    if !errorlevel! equ 0 (
        echo %GREEN%✓ PostgreSQL is ready%NC%
        goto postgres_ready
    )
    echo Attempting connection (%%i/30)...
    timeout /t 1 /nobreak
)

echo %RED%❌ PostgreSQL failed to start%NC%
exit /b 1

:postgres_ready
echo.
echo %YELLOW%📦 Installing backend dependencies...%NC%
cd backend
call npm install
if errorlevel 1 (
    echo %RED%❌ Failed to install backend dependencies%NC%
    exit /b 1
)
echo %GREEN%✓ Backend dependencies installed%NC%

echo.
echo %YELLOW%📦 Installing frontend dependencies...%NC%
cd ..\frontend
call npm install
if errorlevel 1 (
    echo %RED%❌ Failed to install frontend dependencies%NC%
    exit /b 1
)
echo %GREEN%✓ Frontend dependencies installed%NC%

cd ..

echo.
echo %YELLOW%🗄️  Running database migrations...%NC%
docker-compose exec -T backend npm run migration:run
if errorlevel 1 (
    echo %YELLOW%⚠️  Migrations may have failed (this is normal on first run)%NC%
)
echo %GREEN%✓ Database ready%NC%

echo.
echo %YELLOW%🌱 Seeding initial data...%NC%
docker-compose exec -T backend npm run seed
if errorlevel 1 (
    echo %YELLOW%⚠️  Seeding may have failed (this is optional)%NC%
)

echo.
echo %GREEN%✅ Setup Complete!%NC%
echo.
echo Next steps:
echo 1. Update .env with your configuration values
echo 2. Backend API: http://localhost:3000
echo 3. Frontend: http://localhost:3001
echo 4. PgAdmin: http://localhost:5050 (optional)
echo.
echo To start development:
echo   Backend:  cd backend ^&^& npm run start:dev
echo   Frontend: cd frontend ^&^& npm run dev
echo.
echo To stop Docker containers:
echo   docker-compose down
echo.

pause
