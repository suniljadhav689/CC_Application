"""
REST API — Transactions (list, update, bulk update, fraud/friends flags).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import Optional, List
from datetime import date
from pydantic import BaseModel

from app.db.database import get_db
from app.models.transaction import Transaction
from app.models.card import Card

router = APIRouter(prefix="/transactions", tags=["transactions"])


def txn_to_dict(t: Transaction) -> dict:
    return {
        "id": t.id,
        "statement_id": t.statement_id,
        "card_id": t.card_id,
        "card_name": t.card.display_name if t.card else "Unknown card",
        "date": t.date.isoformat() if t.date else None,
        "merchant": t.merchant,
        "merchant_corrected": t.merchant_corrected,
        "display_merchant": t.display_merchant,
        "amount": t.amount,
        "personal_share": t.personal_share if t.personal_share is not None else t.amount,
        "friends_share": t.friends_share if t.friends_share is not None else 0,
        "currency": t.currency,
        "transaction_type": t.transaction_type,
        "category": t.category,
        "category_corrected": t.category_corrected,
        "display_category": t.display_category,
        "is_fraud": t.is_fraud,
        "is_friends": t.is_friends,
        "is_excluded": t.is_excluded,
        "parse_reviewed": t.parse_reviewed,
        "notes": t.notes,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


@router.get("/")
def list_transactions(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    card_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    is_fraud: Optional[bool] = Query(None),
    is_friends: Optional[bool] = Query(None),
    is_excluded: Optional[bool] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    transaction_type: Optional[str] = Query(None),
    sort_by: str = Query("date", pattern="^(date|amount)$"),
    skip: int = Query(0),
    limit: int = Query(100),
):
    q = db.query(Transaction)

    if search:
        q = q.filter(or_(
            Transaction.merchant.ilike(f"%{search}%"),
            Transaction.merchant_corrected.ilike(f"%{search}%"),
            Transaction.notes.ilike(f"%{search}%"),
        ))
    if card_id is not None:
        q = q.filter(Transaction.card_id.is_(None) if card_id == 0 else Transaction.card_id == card_id)
    if category:
        q = q.filter(or_(
            Transaction.category == category,
            Transaction.category_corrected == category,
        ))
    if is_fraud is not None:
        q = q.filter(Transaction.is_fraud == is_fraud)
    if is_friends is not None:
        q = q.filter(Transaction.is_friends == is_friends)
    if is_excluded is not None:
        q = q.filter(Transaction.is_excluded == is_excluded)
    if date_from:
        q = q.filter(Transaction.date >= date_from)
    if date_to:
        q = q.filter(Transaction.date <= date_to)
    if transaction_type:
        q = q.filter(Transaction.transaction_type == transaction_type)

    total = q.count()
    sort_column = Transaction.amount if sort_by == "amount" else Transaction.date
    txns = q.order_by(sort_column.desc(), Transaction.date.desc()).offset(skip).limit(limit).all()

    return {
        "total": total,
        "transactions": [txn_to_dict(t) for t in txns],
    }


class TransactionUpdate(BaseModel):
    card_id: Optional[int] = None
    merchant_corrected: Optional[str] = None
    category_corrected: Optional[str] = None
    is_fraud: Optional[bool] = None
    is_friends: Optional[bool] = None
    is_excluded: Optional[bool] = None
    notes: Optional[str] = None
    amount: Optional[float] = None
    personal_share: Optional[float] = None
    friends_share: Optional[float] = None
    date: Optional[date] = None
    transaction_type: Optional[str] = None


@router.patch("/{txn_id}")
def update_transaction(txn_id: int, update: TransactionUpdate, db: Session = Depends(get_db)):
    txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(404, detail="Transaction not found.")

    changes = update.model_dump(exclude_unset=True)
    if "card_id" in changes and changes["card_id"] is not None:
        if not db.query(Card.id).filter(Card.id == changes["card_id"]).first():
            raise HTTPException(400, detail="Selected card does not exist.")
    for field, value in changes.items():
        setattr(txn, field, value)

    db.commit()
    db.refresh(txn)
    return txn_to_dict(txn)

@router.delete("/{txn_id}")
def delete_transaction(txn_id: int, db: Session = Depends(get_db)):
    txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not txn:
        raise HTTPException(404, detail="Transaction not found.")
    
    db.delete(txn)
    db.commit()
    return {"status": "deleted"}


class BulkUpdate(BaseModel):
    ids: List[int]
    card_id: Optional[int] = None
    category_corrected: Optional[str] = None
    is_fraud: Optional[bool] = None
    is_friends: Optional[bool] = None
    is_excluded: Optional[bool] = None


@router.post("/bulk-update")
def bulk_update(payload: BulkUpdate, db: Session = Depends(get_db)):
    if payload.card_id is not None and not db.query(Card.id).filter(Card.id == payload.card_id).first():
        raise HTTPException(400, detail="Selected card does not exist.")
    txns = db.query(Transaction).filter(Transaction.id.in_(payload.ids)).all()
    updated = 0
    for txn in txns:
        if payload.card_id is not None:
            txn.card_id = payload.card_id
        if payload.category_corrected is not None:
            txn.category_corrected = payload.category_corrected
        if payload.is_fraud is not None:
            txn.is_fraud = payload.is_fraud
        if payload.is_friends is not None:
            txn.is_friends = payload.is_friends
        if payload.is_excluded is not None:
            txn.is_excluded = payload.is_excluded
        updated += 1
    db.commit()
    return {"updated": updated}
