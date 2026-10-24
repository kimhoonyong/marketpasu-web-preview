@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  MarketPasu Kiwoom Local Auto Charts
echo  READ ONLY / LOCAL PC / NO ORDERS
echo ============================================
where py >nul 2>nul
if not errorlevel 1 (
    py -3 marketpasu_local_chart_server.py --mode real
    goto finished
)
where python >nul 2>nul
if not errorlevel 1 (
    python marketpasu_local_chart_server.py --mode real
    goto finished
)
echo [ERROR] Python 3 not found on this Windows PC.
:finished
echo.
echo Existing Kiwoom REST token or secure credential bridge must be configured on this PC.
echo Never enter App Key, Secret or Token into a browser, GitHub or chat.
pause
