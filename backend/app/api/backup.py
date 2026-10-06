"""
REST API — Backup (download SQLite file, export CSV/Excel).
"""
import os
from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.db.database import get_db, DB_PATH

router = APIRouter(prefix="/backup", tags=["backup"])


@router.get("/sqlite")
def download_sqlite():
    """Download the raw SQLite database file."""
    if not os.path.exists(DB_PATH):
        from fastapi import HTTPException
        raise HTTPException(404, detail="Database file not found.")
    filename = f"creditcard_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    return FileResponse(
        path=DB_PATH,
        media_type="application/octet-stream",
        filename=filename,
    )


@router.get("/csv")
def export_csv(db: Session = Depends(get_db)):
    """Export all transactions as CSV."""
    import csv, io
    from app.models.transaction import Transaction

    txns = db.query(Transaction).order_by(Transaction.date.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Date", "Merchant", "Corrected Merchant", "Amount", "Currency",
        "Type", "Category", "Corrected Category", "Is Fraud", "Is Friends",
        "Notes", "Statement ID", "Card ID"
    ])
    for t in txns:
        writer.writerow([
            t.id, t.date, t.merchant, t.merchant_corrected or "", t.amount, t.currency,
            t.transaction_type, t.category, t.category_corrected or "",
            t.is_fraud, t.is_friends, t.notes or "", t.statement_id, t.card_id
        ])

    csv_bytes = output.getvalue().encode("utf-8-sig")  # utf-8-sig for Excel compatibility
    from fastapi.responses import Response
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=transactions_{datetime.now().strftime('%Y%m%d')}.csv"},
    )


@router.get("/excel")
def export_excel(db: Session = Depends(get_db)):
    """Export all transactions as Excel."""
    import io
    from openpyxl import Workbook
    from fastapi.responses import Response
    from app.models.transaction import Transaction

    txns = db.query(Transaction).order_by(Transaction.date.desc()).all()
    wb = Workbook()
    ws = wb.active
    ws.title = "Transactions"

    headers = ["ID", "Date", "Merchant", "Corrected Merchant", "Amount", "Currency",
               "Type", "Category", "Corrected Category", "Fraud", "Friends", "Notes"]
    ws.append(headers)

    for t in txns:
        ws.append([
            t.id, str(t.date), t.merchant or "", t.merchant_corrected or "",
            t.amount, t.currency, t.transaction_type,
            t.category or "", t.category_corrected or "",
            "Yes" if t.is_fraud else "No",
            "Yes" if t.is_friends else "No",
            t.notes or "",
        ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=transactions_{datetime.now().strftime('%Y%m%d')}.xlsx"},
    )
