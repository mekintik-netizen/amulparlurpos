@echo off
REM =========================================================================
REM  Amul Parlour Web POS - Universal Windows Launcher (Windows 7, 8, 10, 11)
REM =========================================================================
title Amul Parlour Local POS Launcher
color 1F

echo =========================================================================
echo    AMUL PARLOUR WEB POS ^& MANAGEMENT PORTAL
echo    The Taste of India ^| Local-First Retail System
echo =========================================================================
echo.

cd /d "%~dp0"

REM 1. Check if the server is already active on port 3000 (Prevents duplicate instances)
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [STATUS] Amul Parlour is ALREADY running on http://localhost:3000
    echo [ACTION] Opening your default web browser...
    start http://localhost:3000
    timeout /t 2 >nul
    exit /b 0
)

REM 2. Check if Node.js is installed in this Windows environment
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Node.js runtime not found in your Windows PATH.
    echo.
    echo If you want to run this POS completely offline from your local drive:
    echo  - Windows 10 / 11: Install Node.js 20 or 22 LTS from https://nodejs.org
    echo  - Windows 7 / 8.1: Install Node.js v13.14.0 or open via Chrome 109 / Firefox ESR 115
    echo.
    echo Alternatively, if your shop uses the cloud hosting link, you can open:
    echo   https://ais-pre-gxvdhrhkwr4p2cjsrfzm3v-581723814485.asia-southeast1.run.app
    echo.
    pause
    exit /b 1
)

REM 3. Check for node_modules
if not exist "node_modules\" (
    echo [SETUP] Initializing local packages for first-time launch...
    call npm install --omit=dev
)

REM 4. Check if production build exists, otherwise run build or start preview
if not exist "dist\" (
    echo [BUILD] Building production assets for fast counter loading...
    call npm run build
)

echo [START] Starting local production POS server on port 3000...
start /min "Amul Parlour POS Server" npm run preview -- --port 3000 --host 127.0.0.1

echo [WAIT] Waiting for local server to initialize...
timeout /t 3 >nul

echo [BROWSER] Launching Amul Parlour in your default browser...
start http://localhost:3000

echo.
echo =========================================================================
echo  Amul Parlour is now running at: http://localhost:3000
echo  Keep this background window minimized during counter operations.
echo =========================================================================
timeout /t 4 >nul
exit /b 0
