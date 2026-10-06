"""
REST API — Statements (upload, list, delete).
"""
import os
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from typing import Optional

from app.db.database import get_db
from app.models.statement import Statement
from app.services.statement_processor import save_upload, process_statement, confirm_and_save

router = APIRouter(prefix="/statements", tags=["statements"])


@router.post("/upload")
async def upload_statement(
    file: UploadFile = File(...),
    card_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    """Upload a PDF statement. Returns parsed transactions for review."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, detail="Only PDF files are accepted.")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:  # 20 MB max
        raise HTTPException(400, detail="File too large (max 20MB).")

    pdf_path = save_upload(content, file.filename)

    try:
        result = process_statement(pdf_path, card_id, db)
        return result
    except Exception as e:
        raise HTTPException(500, detail=f"Processing failed: {str(e)}")


@router.post("/{statement_id}/confirm")
async def confirm_statement(
    statement_id: int,
    payload: dict,
    db: Session = Depends(get_db),
):
    """Confirm reviewed transactions and save to DB."""
    transactions = payload.get("transactions", [])
    # We allow empty transactions so users can skip statements that have 0 valid/new transactions.

    try:
        saved = confirm_and_save(statement_id, transactions, db)
        return {"saved_count": saved, "statement_id": statement_id}
    except ValueError as e:
        raise HTTPException(404, detail=str(e))
    except Exception as e:
        raise HTTPException(500, detail=f"Save failed: {str(e)}")


@router.get("/")
def list_statements(db: Session = Depends(get_db)):
    stmts = db.query(Statement).order_by(Statement.upload_date.desc()).all()
    return [
        {
            "id": s.id,
            "filename": s.filename,
            "bank_detected": s.bank_detected,
            "status": s.status,
            "transaction_count": s.transaction_count,
            "statement_period_start": s.statement_period_start.isoformat() if s.statement_period_start else None,
            "statement_period_end": s.statement_period_end.isoformat() if s.statement_period_end else None,
            "upload_date": s.upload_date.isoformat() if s.upload_date else None,
        }
        for s in stmts
    ]


@router.delete("/{statement_id}")
def delete_statement(statement_id: int, db: Session = Depends(get_db)):
    stmt = db.query(Statement).filter(Statement.id == statement_id).first()
    if not stmt:
        raise HTTPException(404, detail="Statement not found.")
    db.delete(stmt)
    db.commit()
    return {"deleted": statement_id}
