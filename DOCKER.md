# Run with Docker

Build the image and start the app (Docker Compose v2):

```sh
docker compose up --build -d
```

Open <http://localhost:8000>. The React app and API are served by the same container. Check availability with:

```sh
docker compose ps
docker compose logs -f app
```

Compose restarts the container after a crash or host reboot (as long as Docker starts). SQLite data and uploaded statements persist in `backend/data` on the host. To stop the app, run `docker compose down`.

Set `APP_PORT` in the shell or a root `.env` file to change the host port. Gmail OAuth credentials and settings belong in `backend/.env`; they are injected when the container starts and are not baked into the image. See [GMAIL_SETUP.md](GMAIL_SETUP.md). With the default port, connect Gmail from a browser on the Docker host at `http://localhost:8000`; after that, Gmail import is also available over the Tailscale URL. The refresh token and uploads persist in `backend/data`.

To build and run without Compose:

```sh
docker build -t credit-card-analyzer .
docker run -d --name credit-card-analyzer --restart unless-stopped \
  -p 8000:8000 -v "$PWD/backend/data:/app/backend/data" \
  credit-card-analyzer
```
