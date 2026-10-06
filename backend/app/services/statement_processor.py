"""
Statement Processor Service — orchestrates upload → parse → store pipeline.
"""
import os
import shutil
from datetime import datetime
from sqlalchemy.orm import Session

from app.parsers.parser_registry import parse_statement, detect_bank
from app.models.statement import Statement
from app.models.transaction import Transaction
from app.services.category_service import categorize


UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def save_upload(file_data: bytes, filename: str) -> str:
    """Save uploaded file to disk, return path."""
    safe_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"
    dest = os.path.join(UPLOAD_DIR, safe_name)
    with open(dest, "wb") as f:
        f.write(file_data)
    return dest


def process_statement(pdf_path: str, card_id: int | None, db: Session) -> dict:
    """
    Full pipeline:
    1. Detect bank
    2. Parse PDF → ParseResult
    3. Create Statement record
    4. Return parsed transactions for REVIEW (not saved yet)
    """
    bank_name = detect_bank(pdf_path)
    filename = os.path.basename(pdf_path)

    # Create statement record (status=pending_review)
    stmt = Statement(
        card_id=card_id,
        filename=filename,
        bank_detected=bank_name,
        status="pending_review",
    )
    db.add(stmt)
    db.commit()
    db.refresh(stmt)

    # Parse the PDF
    parse_result = parse_statement(pdf_path)

    stmt.status = "parsed"
    stmt.transaction_count = len(parse_result.transactions)
    if parse_result.statement_period_start:
        stmt.statement_period_start = parse_result.statement_period_start
    if parse_result.statement_period_end:
        stmt.statement_period_end = parse_result.statement_period_end
    db.commit()

    # Auto-categorize and build response for front-end review
    preview = []
    for txn in parse_result.transactions:
        category = categorize(txn.merchant, db)
        
        # Check for duplicates
        is_duplicate = False
        if txn.date and txn.amount > 0:
            existing = db.query(Transaction).filter(
                Transaction.date == txn.date,
                Transaction.amount == txn.amount,
                Transaction.merchant == (txn.merchant or ""),
                Transaction.transaction_type == (txn.transaction_type or "debit")
            ).first()
            if existing:
                is_duplicate = True

        preview.append({
            "date": txn.date.isoformat() if txn.date else None,
            "merchant": txn.merchant,
            "amount": txn.amount,
            "transaction_type": txn.transaction_type,
            "category": category,
            "raw_text": txn.raw_text,
            "confidence": txn.confidence,
            "needs_review": txn.confidence < 0.8 or not txn.merchant or txn.amount <= 0,
            "is_duplicate": is_duplicate,
        })

    return {
        "statement_id": stmt.id,
        "bank_detected": bank_name,
        "transaction_count": len(preview),
        "parse_errors": parse_result.parse_errors,
        "transactions": preview,
    }


def confirm_and_save(statement_id: int, reviewed_transactions: list, db: Session) -> int:
    """
    User has reviewed & corrected the parsed data.
    Save final transactions to DB.
    """
    stmt = db.query(Statement).filter(Statement.id == statement_id).first()
    if not stmt:
        raise ValueError(f"Statement {statement_id} not found")

    saved_count = 0
    for txn_data in reviewed_transactions:
        if not txn_data.get("date") or txn_data.get("amount", 0) <= 0:
            continue  # skip invalid rows

        from datetime import date as date_type
        txn_date = txn_data["date"]
        if isinstance(txn_date, str):
            from dateutil.parser import parse as dp
            txn_date = dp(txn_date).date()

        # Prevent duplicates
        existing = db.query(Transaction).filter(
            Transaction.date == txn_date,
            Transaction.amount == txn_data["amount"],
            Transaction.merchant == txn_data.get("merchant", ""),
            Transaction.transaction_type == txn_data.get("transaction_type", "debit")
        ).first()

        if existing:
            continue

        txn = Transaction(
            statement_id=statement_id,
            card_id=stmt.card_id,
            date=txn_date,
            merchant=txn_data.get("merchant", ""),
            merchant_corrected=txn_data.get("merchant_corrected") or None,
            amount=txn_data["amount"],
            personal_share=txn_data["amount"],
            friends_share=0.0,
            currency="INR",
            transaction_type=txn_data.get("transaction_type", "debit"),
            category=txn_data.get("category", "Other"),
            category_corrected=txn_data.get("category_corrected") or None,
            raw_text=txn_data.get("raw_text", ""),
            parse_reviewed=True,
        )
        db.add(txn)
        saved_count += 1

    stmt.status = "done"
    stmt.transaction_count = saved_count
    db.commit()

    return saved_count
