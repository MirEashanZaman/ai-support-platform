@echo off
setlocal
title AI Support Platform — One-Click Launcher
cd /d "%~dp0"

echo ============================================================================
echo   AI Support Platform — Automated Startup (Backend + Dashboard + Widget)
echo ============================================================================
echo.

if not exist ".env" (
    echo [1/4] Creating .env from .env.example...
    copy /Y ".env.example" ".env" >nul
) else (
    echo [1/4] Found existing .env configuration.
)

where docker >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [2/4] Docker detected — starting pgvector, Redis, and RabbitMQ...
    docker compose up -d
) else (
    echo [2/4] Docker not running — using built-in Embedded PostgreSQL 16 + pgvector + RLS engine.
)

if not exist "backend\node_modules" (
    echo [Setup] Installing backend dependencies...
    pushd backend
    call npm install
    popd
)
if not exist "dashboard\node_modules" (
    echo [Setup] Installing dashboard dependencies...
    pushd dashboard
    call npm install
    popd
)

echo [3/4] Launching NestJS Backend API on http://localhost:4000 ...
start "AI Support Platform — Backend API (Port 4000)" cmd /k "cd /d "%~dp0backend" && npm run start:dev"

echo [4/4] Launching Next.js Dashboard on http://localhost:3000 ...
start "AI Support Platform — Dashboard (Port 3000)" cmd /k "cd /d "%~dp0dashboard" && npm run dev"

echo.
echo Waiting 7 seconds for servers to initialize before opening the Dashboard...
timeout /t 7 /nobreak >nul

start "" "http://localhost:3000"

echo.
echo ============================================================================
echo   All services launched!
echo   - Dashboard:    http://localhost:3000
echo   - Widget Demo:  http://localhost:4000/widget-demo (or widget\demo.html)
echo   - Swagger Docs: http://localhost:4000/api-docs
echo   - Health Check: http://localhost:4000/health
echo ============================================================================
pause
