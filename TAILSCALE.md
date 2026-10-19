# Private mobile access with Tailscale

The app uses same-origin `/api` requests by default. Vite forwards those requests to the local FastAPI server, so mobile browsers can use the app through Tailscale's HTTPS URL without mixed-content or cross-origin API requests.

## Use one computer as the host

1. Install and sign in to Tailscale on the computer that runs the app and on your phone. Both devices must join the same tailnet.
2. Enable MagicDNS and HTTPS certificates in the Tailscale admin console if they are not already enabled.
3. On the host computer, start the app with `START_APP.bat`.
4. Run `START_TAILSCALE.bat`. It configures Tailscale Serve and prints the HTTPS URL. Open that URL on your phone while Tailscale is connected.

The MagicDNS URL is stable for that host across restarts, but the app is available only while the host computer, app servers, and Tailscale are running.

## Use the same URL from either a laptop or Mac

Each computer normally has its own MagicDNS name. To keep one service URL while moving the app between computers, configure a Tailscale Service in the tailnet admin console and advertise that service from each host. Tailscale Services require a service definition and tagged host devices, so they are not set up by the per-device `START_TAILSCALE.bat` script.

This app is intended for a private tailnet. Do not use Tailscale Funnel to expose it publicly.
