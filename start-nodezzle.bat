@echo off
rem ============================================================
rem  NODEZZLE - локальный запуск для Windows (подэтап 5.10)
rem
rem  Двойной клик по этому файлу:
rem    1) проверяет окружение (Node.js, npm);
rem    2) при первом запуске устанавливает зависимости;
rem    3) запускает сервер АПИ и интерфейс;
rem    4) браузер открывает сам лаунчер (см. сообщение с адресом).
rem
rem  Остановка: клавиши Ctrl+C в этом окне.
rem  Секретов в этом файле нет и не должно быть.
rem ============================================================

setlocal EnableExtensions
chcp 65001 >nul

rem Переходим в папку самого файла запуска.
cd /d "%~dp0"

echo.
echo ==========================================
echo   NODEZZLE - локальный запуск
echo ==========================================
echo.
echo Проверяем окружение...

if not exist "package.json" goto :no_package_json

where node >nul 2>nul
if errorlevel 1 goto :no_node

where npm >nul 2>nul
if errorlevel 1 goto :no_npm

for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
echo Найден Node.js %NODE_VERSION%

if not exist "node_modules" goto :first_run
goto :launch

:first_run
echo.
echo Первый запуск. Устанавливаем зависимости...
echo Это может занять несколько минут - подождите, пожалуйста.
echo.
call npm install
if errorlevel 1 goto :install_failed
echo Зависимости установлены.
goto :launch

:launch
echo.
echo Запускаем NODEZZLE: сервер + интерфейс.
echo Остановка - клавиши Ctrl+C в этом окне.
echo.
call npm run dev:all
if errorlevel 1 goto :run_failed

echo.
echo NODEZZLE остановлен.
pause
exit /b 0

:no_package_json
echo.
echo [ОШИБКА] Файл package.json не найден.
echo Похоже, папка проекта повреждена или файл запуска перемещён.
echo Скачайте архив NODEZZLE заново и распакуйте его целиком.
goto :error

:no_node
echo.
echo [ОШИБКА] Node.js не найден.
echo Установите Node.js LTS с официального сайта:
echo   https://nodejs.org/
echo После установки закройте это окно и запустите файл заново.
goto :error

:no_npm
echo.
echo [ОШИБКА] Менеджер пакетов npm не найден.
echo Проверьте установку Node.js:
echo   https://nodejs.org/
echo и откройте новое окно командной строки после установки.
goto :error

:install_failed
echo.
echo [ОШИБКА] Установка зависимостей завершилась с ошибкой.
echo Возможные шаги:
echo   1) проверьте подключение к интернету;
echo   2) выполните вручную: npm install
echo   3) если ошибка повторяется - смотрите сообщение выше.
goto :error

:run_failed
echo.
echo [ОШИБКА] Запуск NODEZZLE завершился с ошибкой.
echo Подробности - в сообщениях выше.
goto :error

:error
echo.
echo Нажмите любую клавишу, чтобы закрыть окно...
pause >nul
exit /b 1
