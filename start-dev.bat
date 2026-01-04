@echo off
echo 正在启动 Zengo (弈悟) 开发服务器...
cd /d "%~dp0"
:: 先尝试打开浏览器 (假设快捷方式指向 localhost:3000)
start http://localhost:3000
:: 启动 Vite 开发服务器
npm run dev
pause