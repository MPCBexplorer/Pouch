@echo off
cd /d "%~dp0"
echo 正在启动 Pouch 服务器...
powershell -ExecutionPolicy Bypass -File "server\start.ps1" %*
pause