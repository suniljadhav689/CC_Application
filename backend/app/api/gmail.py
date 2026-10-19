"""Read-only Gmail access for importing labeled PDF statements."""
import base64
import html
import json
import os
import secrets
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.gmail_import import GmailAttachmentImport
from app.models.statement import Statement
from app.services.statement_processor import process_statement, save_upload

router = APIRouter(prefix="/gmail", tags=["gmail"])

BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_DIR / "data"
TOKEN_PATH = DATA_DIR / "gmail_token.enc"
load_dotenv(BACKEND_DIR / ".env")

GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API_ROOT = "https://gmail.googleapis.com/gmail/v1/users/me"
LABEL_PREFIXES = ("Credit Card Statements", "Credit Card Statments")
MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
_pending_states: dict[str, float] = {}
_access_token: str | None = None
_access_token_expiry = 0.0


def _config():
    client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("GOOGLE_OAUTH_REDIRECT_URI", "").strip()
    encryption_key = os.getenv("GMAIL_TOKEN_ENCRYPTION_KEY", "").strip()
    return client_id, client_secret, redirect_uri, encryption_key


def _fernet() -> Fernet:
    _, _, _, key = _config()
    if not key:
        raise HTTPException(503, detail="Gmail token encryption key is not configured.")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError):
        raise HTTPException(503, detail="Gmail token encryption key is invalid.")


def _read_refresh_token() -> str | None:
    if not TOKEN_PATH.exists():
        return None
    try:
        token = _fernet().decrypt(TOKEN_PATH.read_bytes()).decode("utf-8")
        return json.loads(token).get("refresh_token")
    except (InvalidToken, ValueError, OSError, json.JSONDecodeError):
        raise HTTPException(500, detail="Saved Gmail credentials could not be decrypted.")


def _save_refresh_token(refresh_token: str):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({"refresh_token": refresh_token}).encode("utf-8")
    TOKEN_PATH.write_bytes(_fernet().encrypt(payload))


def _ensure_configured():
    client_id, client_secret, redirect_uri, _ = _config()
    if not all((client_id, client_secret, redirect_uri)):
        raise HTTPException(503, detail="Gmail OAuth is not configured. See GMAIL_SETUP.md.")
    return client_id, client_secret, redirect_uri


def _is_statement_label(name: str) -> bool:
    return any(name == prefix or name.startswith(prefix + "/") for prefix in LABEL_PREFIXES)


def _oauth_result_page(message: str, success: bool) -> HTMLResponse:
    color = "#16803c" if success else "#b42318"
    safe_message = message.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return_url = html.escape(os.getenv("GMAIL_APP_RETURN_URL", "http://localhost:5174/"), quote=True)
    return HTMLResponse(f"""<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Gmail connection</title><body style="font:16px system-ui;max-width:520px;margin:12vh auto;padding:24px;color:#222">
    <h2 style="color:{color}">{safe_message}</h2><p>You can close this page and return to Card Analyzer.</p>
    <a href="{return_url}" style="display:inline-block;padding:12px 18px;background:#6c63ff;color:white;border-radius:8px;text-decoration:none">Return to Card Analyzer</a>
    </body></html>""")


@router.get("/status")
def gmail_status():
    client_id, client_secret, redirect_uri, key = _config()
    return {
        "configured": bool(client_id and client_secret and redirect_uri and key),
        "connected": TOKEN_PATH.exists(),
        "redirect_uri": redirect_uri or None,
    }


@router.get("/oauth/start")
def oauth_start():
    client_id, _, redirect_uri = _ensure_configured()
    state = secrets.token_urlsafe(32)
    now = time.time()
    # Keep other unexpired flows valid so opening a second tab or retrying the
    # button does not invalidate the callback from the first tab.
    for pending_state, expiry in list(_pending_states.items()):
        if expiry < now:
            _pending_states.pop(pending_state, None)
    _pending_states[state] = now + 600
    query = urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": GMAIL_READONLY,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    })
    return RedirectResponse(f"{AUTH_URL}?{query}", status_code=302)


@router.get("/oauth/callback")
async def oauth_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    if error:
        return _oauth_result_page(f"Google authorization was not completed: {error}", False)
    expiry = _pending_states.pop(state or "", 0)
    if not code or expiry < time.time():
        return _oauth_result_page("This Gmail sign-in link expired. Start again from Card Analyzer.", False)
    client_id, client_secret, redirect_uri = _ensure_configured()
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(TOKEN_URL, data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            })
    except httpx.HTTPError:
        return _oauth_result_page("Card Analyzer could not reach Google to finish sign-in. Check the laptop's internet connection and try again.", False)
    if response.is_error:
        return _oauth_result_page("Google could not complete the connection. Check the OAuth redirect URI and try again.", False)
    token_data = response.json()
    refresh_token = token_data.get("refresh_token") or _read_refresh_token()
    if not refresh_token:
        return _oauth_result_page("Google did not return a refresh token. Disconnect this app in Google Account permissions and reconnect.", False)
    _save_refresh_token(refresh_token)
    global _access_token, _access_token_expiry
    _access_token = token_data.get("access_token")
    _access_token_expiry = time.time() + max(0, int(token_data.get("expires_in", 3600)) - 60)
    return _oauth_result_page("Gmail connected", True)


@router.delete("/connection")
async def disconnect_gmail():
    global _access_token, _access_token_expiry
    refresh_token = _read_refresh_token()
    if refresh_token:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post("https://oauth2.googleapis.com/revoke", data={"token": refresh_token})
        except httpx.HTTPError:
            pass
    TOKEN_PATH.unlink(missing_ok=True)
    _access_token = None
    _access_token_expiry = 0
    return {"connected": False}


async def _get_access_token() -> str:
    global _access_token, _access_token_expiry
    refresh_token = _read_refresh_token()
    if not refresh_token:
        raise HTTPException(401, detail="Connect Gmail before importing statements.")
    if _access_token and time.time() < _access_token_expiry:
        return _access_token
    client_id, client_secret, _ = _ensure_configured()
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(TOKEN_URL, data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        })
    if response.is_error:
        raise HTTPException(401, detail="Gmail authorization expired. Reconnect Gmail in Settings.")
    result = response.json()
    _access_token = result["access_token"]
    _access_token_expiry = time.time() + max(0, int(result.get("expires_in", 3600)) - 60)
    return _access_token


async def _gmail_get(path: str, params: dict | None = None):
    access_token = await _get_access_token()
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(f"{API_ROOT}/{path.lstrip('/')}", params=params, headers={"Authorization": f"Bearer {access_token}"})
    if response.is_error:
        detail = "Gmail request failed. Reconnect Gmail if its permission was revoked."
        try:
            detail = response.json().get("error", {}).get("message", detail)
        except (ValueError, AttributeError):
            pass
        raise HTTPException(response.status_code, detail=detail)
    return response.json()


@router.get("/labels")
async def gmail_labels():
    data = await _gmail_get("labels", {"fields": "labels(id,name,type)"})
    labels = [label for label in data.get("labels", []) if label.get("type") == "user" and _is_statement_label(label.get("name", ""))]
    return sorted(labels, key=lambda label: label["name"].lower())


def _walk_parts(payload: dict):
    yield payload
    for part in payload.get("parts", []) or []:
        yield from _walk_parts(part)


@router.get("/messages")
async def gmail_messages(
    label_ids: list[str] = Query(..., min_length=1),
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: Session = Depends(get_db),
):
    if date_from > date_to:
        raise HTTPException(400, detail="Start date must be on or before end date.")
    labels = await gmail_labels()
    allowed = {label["id"] for label in labels}
    if not set(label_ids).issubset(allowed):
        raise HTTPException(400, detail="Choose one of the detected credit card statement labels.")
    # Gmail applies repeated labelIds as AND, so query each selected label and union results.
    q = f"has:attachment filename:pdf after:{date_from.strftime('%Y/%m/%d')} before:{(date_to.fromordinal(date_to.toordinal() + 1)).strftime('%Y/%m/%d')}"
    refs: dict[str, list[str]] = {}
    for label_id in label_ids:
        page = await _gmail_get("messages", {"labelIds": label_id, "q": q, "maxResults": 50})
        for message in page.get("messages", []):
            refs.setdefault(message["id"], []).append(label_id)

    tracked_imports = db.query(GmailAttachmentImport).filter(
        GmailAttachmentImport.message_id.in_(refs.keys())
    ).all() if refs else []
    import_by_part = {(record.message_id, record.part_id): record for record in tracked_imports}
    tracked_statement_ids = [record.statement_id for record in tracked_imports if record.statement_id]
    completed_statement_ids = {
        stmt.id for stmt in db.query(Statement).filter(
            Statement.id.in_(tracked_statement_ids), Statement.status == "done"
        ).all()
    } if tracked_statement_ids else set()

    results = []
    for message_id, matched_labels in refs.items():
        message = await _gmail_get(f"messages/{message_id}", {"format": "full"})
        payload = message.get("payload", {})
        attachments = []
        for part in _walk_parts(payload):
            filename = part.get("filename", "")
            body = part.get("body", {})
            if filename.lower().endswith(".pdf") and body.get("attachmentId"):
                attachment_id = body["attachmentId"]
                part_id = part.get("partId") or attachment_id
                record = import_by_part.get((message_id, part_id))
                already_imported = bool(record and (
                    record.status in {"processed", "duplicate"} or record.statement_id in completed_statement_ids
                ))
                attachments.append({
                    "attachment_id": attachment_id,
                    "part_id": part_id,
                    "filename": os.path.basename(filename),
                    "already_imported": already_imported,
                    "pending_review": bool(record and record.status == "pending_review" and not already_imported),
                })
        if not attachments:
            continue
        headers = {h.get("name", "").lower(): h.get("value", "") for h in payload.get("headers", [])}
        internal_ms = int(message.get("internalDate", 0))
        results.append({
            "message_id": message_id,
            "date": datetime.fromtimestamp(internal_ms / 1000, tz=timezone.utc).isoformat() if internal_ms else None,
            "subject": headers.get("subject", "(no subject)"),
            "from": headers.get("from", ""),
            "labels": matched_labels,
            "attachments": attachments,
        })
    results.sort(key=lambda message: message.get("date") or "", reverse=True)
    return {"messages": results, "count": len(results)}


class ImportAttachment(BaseModel):
    message_id: str = Field(min_length=1)
    attachment_id: str | None = None
    part_id: str | None = None
    filename: str = Field(min_length=1, max_length=255)
    label_ids: list[str] = Field(min_length=1)
    card_id: int | None = None


@router.post("/import")
async def import_gmail_attachment(payload: ImportAttachment, db: Session = Depends(get_db)):
    if not payload.filename.lower().endswith(".pdf"):
        raise HTTPException(400, detail="Only PDF statement attachments can be imported.")
    labels = await gmail_labels()
    allowed = {label["id"] for label in labels}
    if not set(payload.label_ids).issubset(allowed):
        raise HTTPException(400, detail="Choose one of the detected credit card statement labels.")
    message = await _gmail_get(f"messages/{payload.message_id}", {"format": "full"})
    if not set(message.get("labelIds", [])).intersection(payload.label_ids):
        raise HTTPException(403, detail="This email is not in the selected statement label.")
    lookup_part_id = payload.part_id or payload.filename
    tracked_import = db.query(GmailAttachmentImport).filter_by(
        message_id=payload.message_id,
        part_id=lookup_part_id,
    ).first()
    if tracked_import and (tracked_import.status in {"processed", "duplicate"}):
        return {"already_processed": True, "message": "This statement attachment has already been processed."}
    if tracked_import and tracked_import.statement_id:
        old_statement = db.query(Statement).filter(Statement.id == tracked_import.statement_id).first()
        if old_statement and old_statement.status == "done":
            tracked_import.status = "processed"
            tracked_import.imported_at = datetime.utcnow()
            db.commit()
            return {"already_processed": True, "message": "This statement attachment has already been processed."}
    pdf_parts = [part for part in _walk_parts(message.get("payload", {})) if part.get("filename", "").lower().endswith(".pdf")]
    selected_part = next((part for part in pdf_parts if payload.part_id and part.get("partId") == payload.part_id), None)
    if not selected_part and not payload.part_id:
        matching_parts = [part for part in pdf_parts if os.path.basename(part.get("filename", "")).casefold() == payload.filename.casefold()]
        selected_part = matching_parts[0] if len(matching_parts) == 1 else None
    if not selected_part:
        raise HTTPException(400, detail="That PDF attachment is no longer available on this email. Search again and retry.")
    actual_filename = os.path.basename(selected_part.get("filename") or payload.filename)
    current_attachment_id = selected_part.get("body", {}).get("attachmentId")
    if not current_attachment_id:
        raise HTTPException(400, detail="Gmail did not provide a downloadable attachment ID. Search again and retry.")
    attachment = await _gmail_get(f"messages/{payload.message_id}/attachments/{current_attachment_id}")
    encoded = attachment.get("data", "")
    content = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
    if not content or len(content) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(400, detail="The PDF is empty or exceeds the 20 MB upload limit.")
    path = save_upload(content, actual_filename)
    try:
        result = process_statement(
            path,
            payload.card_id,
            db,
            existing_statement_id=tracked_import.statement_id if tracked_import else None,
        )
        parsed_transactions = result.get("transactions", [])
        if parsed_transactions and all(row.get("is_duplicate") for row in parsed_transactions):
            db.query(Statement).filter(Statement.id == result["statement_id"]).delete()
            record = tracked_import or GmailAttachmentImport(
                message_id=payload.message_id,
                part_id=lookup_part_id,
                filename=payload.filename,
            )
            record.filename = payload.filename
            record.statement_id = None
            record.status = "duplicate"
            record.imported_at = datetime.utcnow()
            db.add(record)
            db.commit()
            return {"already_processed": True, "message": "All transactions in this statement are already in your tracker."}

        record = tracked_import or GmailAttachmentImport(
            message_id=payload.message_id,
            part_id=lookup_part_id,
            filename=payload.filename,
        )
        record.filename = payload.filename
        record.statement_id = result["statement_id"]
        record.status = "pending_review"
        db.add(record)
        db.commit()
        return result
    except Exception as exc:
        raise HTTPException(500, detail=f"Could not parse the Gmail attachment: {exc}")
