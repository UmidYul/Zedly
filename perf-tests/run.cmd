@echo off
setlocal ENABLEDELAYEDEXPANSION

if "%~1"=="" (
  echo Usage: run.cmd https://your-domain.com
  exit /b 1
)

set BASE_URL=%~1

if not "%~2"=="" (
  set AUTH_TOKEN=%~2
)

echo Running k6 against %BASE_URL%
k6 run --env BASE_URL=%BASE_URL% --env AUTH_TOKEN=%AUTH_TOKEN% script.js

endlocal
