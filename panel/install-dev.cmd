@echo off
setlocal
set "EXTENSION_ID=motion-shelf"
set "SOURCE=%~dp0"
set "TARGET=%APPDATA%\Adobe\CEP\extensions\%EXTENSION_ID%"

echo.
echo Motion Shelf - instalacao local de desenvolvimento
echo Destino: %TARGET%
echo.

if not exist "%TARGET%" mkdir "%TARGET%"
xcopy "%SOURCE%*" "%TARGET%\" /E /I /Y >nul
if errorlevel 1 (
  echo Falha ao copiar os arquivos.
  pause
  exit /b 1
)

echo Arquivos instalados.
echo.
choice /C SN /N /M "Ativar o modo de desenvolvimento CEP 12 para carregar a extensao sem assinatura? [S/N] "
if errorlevel 2 goto done
reg add "HKCU\Software\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
echo Modo de desenvolvimento ativado para o usuario atual.

:done
echo.
echo Feche e abra novamente o After Effects.
echo Depois acesse: Janela ^> Extensoes ^(Legado^) ^> Motion Shelf
pause
endlocal
