"""
Statement Processor Service — orchestrates upload → parse → store pipeline.
"""
import os
import re
import shutil
from datetime import datetime
from sqlalchemy.orm import Session

from app.parsers.parser_registry import parse_statement, detect_bank
from app.models.statement import Statement
from app.models.transaction import Transaction
from app.services.category_service import categorize


UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def extract_card_metadata(pdf_path: str, bank_name: str) -> tuple[str | None, str | None]:
    """Extract card product and last four digits from common statement layouts."""
    try:
        from app.parsers.utils import open_pdf
        with open_pdf(pdf_path) as pdf:
            text = "\n".join((page.extract_text() or "") for page in pdf.pages[:3])
    except Exception:
        return None, None

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    card_name = None
    bank = (bank_name or "").upper()

    if bank == "HDFC":
        for line in lines[:30]:
            match = re.search(r"^(.+?)\s+(?:HDFC\s+Bank\s+)?Credit\s+Card\s+Statement\b", line, re.I)
            if match:
                candidate = match.group(1).strip(" -:|")
                if candidate and candidate.lower() not in {"your", "credit"}:
                    card_name = candidate
                    break
    elif bank == "KOTAK":
        for line in lines[:30]:
            match = re.search(r"statement\s+for\s+your\s+(.+?)\s+Credit\s+Card\s+X\d{4}\b", line, re.I)
            if match:
                card_name = match.group(1).strip()
                break
    elif bank == "AXIS":
        for line in lines[:30]:
            match = re.search(r"^(.+?)\s+Axis\s+Bank(?:\s+(?:VISA|MASTER\s*CARD|RUPAY))?\s+Credit\s+Card\s+Statement\b", line, re.I)
            if match:
                card_name = match.group(1).strip(" -:|")
                break
    elif bank == "ICICI":
        lower_text = text.lower()
        if re.search(r"amazon\s+pay\s+credit\s+card", lower_text):
            card_name = "Amazon Pay"
        else:
            # Some ICICI statements omit the product name from extracted text;
            # accept a recognizable product token from the local attachment name.
            filename = os.path.basename(pdf_path).lower()
            if "coral" in filename:
                card_name = "Coral"
            elif "amazon" in filename and "pay" in filename:
                card_name = "Amazon Pay"

    last_four = None
    for line in lines[:60]:
        match = re.search(r"\b\d{4,6}[xX*]{3,}(\d{4})\b", line)
        if match:
            last_four = match.group(1)
            break
        if bank == "KOTAK":
            match = re.search(r"\bX(\d{4})\b", line)
            if match:
                last_four = match.group(1)
                break

    return card_name, last_four


def save_upload(file_data: bytes, filename: str) -> str:
    """Save uploaded file to disk, return path."""
    safe_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"
    dest = os.path.join(UPLOAD_DIR, safe_name)
    with open(dest, "wb") as f:
        f.write(file_data)
    return dest


def process_statement(pdf_path: str, card_id: int | None, db: Session, existing_statement_id: int | None = None) -> dict:
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
    if existing_statement_id is not None:
        stmt = db.query(Statement).filter(Statement.id == existing_statement_id).first()
        if not stmt:
            raise ValueError(f"Pending statement {existing_statement_id} not found")
        stmt.filename = filename
        stmt.bank_detected = bank_name
        stmt.status = "processing"
        if card_id is not None:
            stmt.card_id = card_id
    else:
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
    card_name, card_last_four = extract_card_metadata(pdf_path, bank_name)

    stmt.status = "parsed"
    stmt.card_name = card_name
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
        "card_name": card_name,
        "card_last_four": card_last_four,
        "transaction_count": len(preview),
        "parse_errors": parse_result.parse_errors,
        "transactions": preview,
    }


def confirm_and_save(statement_id: int, reviewed_transactions: list, db: Session, card_id: int | None = None) -> int:
    """
    User has reviewed & corrected the parsed data.
    Save final transactions to DB.
    """
    stmt = db.query(Statement).filter(Statement.id == statement_id).first()
    if not stmt:
        raise ValueError(f"Statement {statement_id} not found")

    if card_id is not None:
        from app.models.card import Card
        if not db.query(Card.id).filter(Card.id == card_id).first():
            raise ValueError(f"Card {card_id} not found")
        stmt.card_id = card_id

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
