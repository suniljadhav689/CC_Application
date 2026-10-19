# Gmail statement import

Gmail import is read-only. It lists labels under `Credit Card Statements` or `Credit Card Statments` (the latter matches the current spelling in this Gmail account), searches the chosen labels for PDF attachments in a date range, and sends a selected attachment through the existing parse-and-review flow. It never modifies, marks, or deletes Gmail messages. Access tokens stay in memory; the refresh token is encrypted in `backend/data/gmail_token.enc` using a key kept in the ignored `backend/.env` file.

## Important permission and URL constraints

Google's `gmail.readonly` permission applies to the mailbox, not to one label. The app filters imports to the chosen `Credit Card Statements` labels, but Google grants the OAuth client read access to messages across the mailbox. The screenshot's parent and child labels can be selected separately.

No personal domain is needed for the laptop authorization flow. Connect once from a browser on the computer running the app, using `http://localhost:5174`. Google redirects to the backend on that same computer at `http://localhost:8000/gmail/oauth/callback`. Then use the app normally on your iPhone through the Tailscale URL; the saved Gmail connection stays on the laptop.

## Google Cloud setup

1. Create a Google Cloud project, enable the Gmail API, and configure the OAuth consent screen for your Google account.
2. Add your Gmail account as a test user while the consent screen is in Testing.
3. Create an OAuth client of type **Web application**. Add this exact authorized redirect URI: `http://localhost:8000/gmail/oauth/callback`. Google permits localhost HTTP callbacks for local development; the callback must match exactly.
4. Copy `backend/.env.example` to `backend/.env`. Add the client ID, client secret, exact redirect URI, and a Fernet key. Generate a key with:

   ```powershell
   backend\.venv\Scripts\python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

5. Restart the backend. On the laptop running the app, open `http://localhost:5174`, go to Upload, and connect Gmail. Choose the statement labels and date range, then import a PDF into the existing transaction review screen. After connecting, you can browse and import from your iPhone through Tailscale.

Google classifies `gmail.readonly` as a restricted scope. Personal-use exceptions may avoid full app verification, but an unverified-app warning can remain. External OAuth projects left in Testing issue refresh tokens that expire after seven days, so Gmail may need reconnecting unless the OAuth app is moved out of Testing or otherwise approved. See Google's [Gmail scope guidance](https://developers.google.com/workspace/gmail/api/auth/scopes), [restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), and [OAuth localhost redirect guidance](https://developers.google.com/identity/protocols/oauth2/web-server).
