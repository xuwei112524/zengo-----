@echo off
cd /d "%~dp0"

echo [INFO] Starting Zengo...

:: 1. Check NPM
call npm -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm command not found. Please install Node.js.
    pause
    exit /b
)

:: 2. Install dependencies if node_modules is missing
if not exist "node_modules" (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b
    )
)

:: 3. Start Server (in a minimized new window)
echo [INFO] Starting Vite Server...
start "Zengo Server" /min cmd /c "npm run dev"

:: 4. Wait for server to initialize
echo [INFO] Waiting for server to start (5 seconds)...
timeout /t 5 /nobreak >nul

:: 5. Open Application Window
echo [INFO] Opening Application Window...

:: Attempt 1: Microsoft Edge (App Mode)
start msedge --app=http://localhost:3000
if %errorlevel% equ 0 goto success

:: Attempt 2: Google Chrome (App Mode)
start chrome --app=http://localhost:3000
if %errorlevel% equ 0 goto success

:: Attempt 3: Default Browser
echo [WARN] App mode failed. Opening default browser...
start http://localhost:3000

:success
echo [INFO] Launch successful!
echo [NOTE] Please keep the minimized "Zengo Server" window running.
echo.
pause