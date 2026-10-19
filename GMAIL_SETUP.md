# Gmail statement import with Docker and Tailscale

The Gmail integration is already included in the application image. Set OAuth credentials at runtime in `backend/.env`; do not put them in the Dockerfile or commit that file. The app requests the read-only `gmail.readonly` scope, filters Gmail to the credit-card-statement labels in the app, and stores an encrypted refresh token at `backend/data/gmail_token.enc`. Google grants this scope mailbox-wide read access, even though the app only lists the selected labels.

## 1. Configure Google Cloud

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project and enable the **Gmail API**.
2. Configure the OAuth consent screen / Google Auth Platform branding and audience. For personal testing, choose **External** and add the Google account you will connect as a test user.
3. Create an OAuth client ID with application type **Web application**.
4. Add this exact **Authorized redirect URI**:

   ```text
   http://localhost:8000/api/gmail/oauth/callback
   ```

   The app uses localhost because Google permits HTTP localhost redirect URIs for development. Start Gmail authorization in a browser on the Mac running Docker. Do not start the authorization from your phone: `localhost` on the phone refers to the phone itself, so Google's callback would not reach the Mac.

5. Copy the client ID and client secret. Keep the secret private.

Google requires the `gmail.readonly` scope to go through restricted-scope verification for a public app. For a personal app kept in Testing, only added test users can authorize it, and Google may expire refresh tokens after seven days. See Google's [Gmail scope guide](https://developers.google.com/workspace/gmail/api/auth/scopes), [OAuth web-server guide](https://developers.google.com/identity/protocols/oauth2/web-server), and [OAuth production readiness](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

## 2. Configure the Docker host

Copy the example file, then edit `backend/.env` and fill in the three Google values plus a new Fernet key:

```sh
cp backend/.env.example backend/.env
```

Generate an encryption key from the built image:

```sh
docker run --rm --entrypoint python credit-card-analyzer:latest -c \
  "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Set these values in `backend/.env`:

```dotenv
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8000/api/gmail/oauth/callback
GMAIL_APP_RETURN_URL=http://localhost:8000/
GMAIL_TOKEN_ENCRYPTION_KEY=paste-the-generated-key-here
```

Keep `backend/.env` private and keep the same Fernet key. The app cannot decrypt the saved Gmail token if this key changes. `backend/data` is mounted by Compose, so the encrypted token survives container replacement and image rebuilds.

## 3. Start the app and connect Gmail

```sh
docker compose up -d --force-recreate app
```

On the Docker host Mac, open <http://localhost:8000>, go to **Upload**, and choose **Connect Gmail**. Complete Google's consent flow in that browser. Once connected, the Gmail import feature can also be used from another tailnet device at <https://sunils-mac-mini.tailf9b10f.ts.net/>. The app's OAuth callback and token exchange run on the Mac; the phone only uses the app after the connection is saved.

To check configuration, visit `http://localhost:8000/api/gmail/status`. `configured` should be `true`; `connected` becomes `true` after authorization completes.
