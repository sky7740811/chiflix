@echo off
title Chiflix Server Stopper
echo Stopping Chiflix servers...

taskkill /F /IM python.exe /T >nul 2>&1
taskkill /F /IM node.exe /T >nul 2>&1

echo Servers stopped.
pause
