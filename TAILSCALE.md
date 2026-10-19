# Private mobile access with Tailscale

The app uses same-origin `/api` requests by default. Vite forwards those requests to the local FastAPI server, so mobile browsers can use the app through Tailscale's HTTPS URL without mixed-content or cross-origin API requests.

## Use one computer as the host

1. Install and sign in to Tailscale on the computer that runs the app and on your phone. Both devices must join the same tailnet.
2. Enable MagicDNS and HTTPS certificates in the Tailscale admin console if they are not already enabled.
3. On the host computer, start the Docker app with `docker compose up -d` (or `docker compose up -d --build` after changing the app).
4. Run `START_TAILSCALE.bat` on Windows. It forwards Tailscale HTTPS traffic to the Docker-published port `8000` and prints the HTTPS URL. Open that URL on your phone while Tailscale is connected.

On macOS or Linux, run the equivalent commands in a terminal:

```sh
docker compose up -d
tailscale serve --bg http://127.0.0.1:8000
tailscale serve status
```

The app must be listening on port `8000` and Tailscale must be signed in on the host. Compose restarts the app container after a crash or host reboot; Tailscale Serve is managed by the Tailscale client and will be available when that client is connected.

The MagicDNS URL is stable for that host across restarts, but the app is available only while the host computer, app servers, and Tailscale are running.

## Use the same URL from either a laptop or Mac

Each computer normally has its own MagicDNS name. To keep one service URL while moving the app between computers, configure a Tailscale Service in the tailnet admin console and advertise that service from each host. Tailscale Services require a service definition and tagged host devices, so they are not set up by the per-device `START_TAILSCALE.bat` script.

This app is intended for a private tailnet. Do not use Tailscale Funnel to expose it publicly.
