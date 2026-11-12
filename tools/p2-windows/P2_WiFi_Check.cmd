@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title 느티나무 P2 - 방 PC 무선랜 확인
set "netshExe=%SystemRoot%\System32\netsh.exe"
set "findExe=%SystemRoot%\System32\findstr.exe"
set "psExe=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
echo.
echo   느티나무 P2 / 방 PC 무선랜 확인
echo   유선 인터넷과 TV 입력 설정은 변경하지 않습니다.
echo.
echo [1] Windows에 등록된 무선 인터페이스
"%netshExe%" wlan show interfaces 2>nul | "%findExe%" /R /I /C:"^[ ]*GUID[ ]*:" >nul
if errorlevel 1 (
    echo     확인되지 않음 - 동글, 드라이버 또는 무선 LAN 서비스 상태를 확인하세요.
    echo     WIFI_INTERFACE=NOT_CONFIRMED
) else (
    echo     무선 인터페이스가 인식됐습니다.
    echo     WIFI_INTERFACE=FOUND
)
echo.
echo [2] 유선 LAN 상태
if exist "%psExe%" (
    "%psExe%" -NoProfile -Command "try { $up = @(Get-NetAdapter -Physical -ErrorAction Stop | Where-Object { $_.InterfaceType -eq 6 -and $_.Status -eq 'Up' }); if ($up.Count) { '    ETHERNET_LINK=UP' } else { '    ETHERNET_LINK=NOT_SEEN' } } catch { '    ETHERNET_LINK=UNKNOWN' }"
) else (
    echo     ETHERNET_LINK=UNKNOWN
)
echo.
echo [3] 주변 TJ 무선망
"%netshExe%" wlan show networks mode=ssid 2>nul | "%findExe%" /R /I /C:"^[ ]*SSID [0-9][0-9]*[ ]*:[ ]*DIRECT-TJ-" >nul
if errorlevel 1 (
    echo     DIRECT-TJ 무선망을 확인하지 못했습니다. Windows Wi-Fi 목록도 확인해 주세요.
    echo     TJ_NETWORK=NOT_CONFIRMED
) else (
    echo     DIRECT-TJ 이름의 무선망이 보입니다.
    echo     TJ_NETWORK=VISIBLE
)
echo.
echo   발견 결과만 표시합니다. P2 페어링과 HDMI 전환은 별도 시험입니다.
echo   이 화면의 1~3번 결과를 확인해 주세요.
if /I "%~1"=="--test" exit /b 0
pause
endlocal
