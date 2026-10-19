@echo off
title Credit Card Analyzer over Tailscale
echo Setting up a private HTTPS URL for your Tailscale network...
echo Make sure START_APP.bat is running first.
echo.
tailscale serve --bg http://127.0.0.1:5174
if errorlevel 1 (
  echo.
  echo Tailscale Serve could not start. Check that Tailscale is installed, connected,
  echo and that HTTPS is enabled for your tailnet.
  pause
  exit /b 1
)
echo.
tailscale serve status
echo.
echo Use the HTTPS URL shown above on any device connected to the same Tailscale network.
pause
