@echo off
echo 正在启动 Zengo (弈悟) 开发服务器...
cd /d "%~dp0"
:: 启动 Vite 开发服务器
npm run dev
pause