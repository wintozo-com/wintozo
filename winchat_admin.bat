@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title WinChat Admin

:MENU
cls
echo ============================================
echo            WinChat Admin Menu
echo ============================================
echo.
echo   1. Запустить веб версию (npm run dev -- --host)
echo   2. Push на Vercel (npx vercel --prod)
echo   3. Push на GitHub (add + commit + push)
echo   4. Выход
echo.
set /p CHOICE=Выберите пункт (1-4): 

if "%CHOICE%"=="1" goto RUN_DEV
if "%CHOICE%"=="2" goto RUN_VERCEL
if "%CHOICE%"=="3" goto RUN_GITHUB
if "%CHOICE%"=="4" goto END
echo.
echo Неверный выбор. Нажмите любую клавишу...
pause >nul
goto MENU

:RUN_DEV
cls
echo === Запуск веб версии ===
echo.
call npm run dev -- --host
echo.
echo Сервер остановлен. Нажмите любую клавишу...
pause >nul
goto MENU

:RUN_VERCEL
cls
echo === Push на Vercel (production) ===
echo.
call npx vercel --prod
echo.
echo Готово. Нажмите любую клавишу...
pause >nul
goto MENU

:RUN_GITHUB
cls
echo === Push на GitHub ===
echo.
git add .
echo.
set /p COMMIT_MSG=Введите название коммита: 
if "!COMMIT_MSG!"=="" (
    echo Пустое сообщение коммита. Отмена.
    pause
    goto MENU
)
git commit -m "!COMMIT_MSG!"
echo.
echo === Отправка на GitHub ===
git push
echo.
echo Готово. Нажмите любую клавишу...
pause >nul
goto MENU

:END
endlocal
exit /b 0