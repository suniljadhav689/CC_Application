"""
REST API — Analytics aggregations.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from typing import Optional
from datetime import date

from app.db.database import get_db
from app.models.transaction import Transaction

router = APIRouter(prefix="/analytics", tags=["analytics"])

EXCLUDED_FROM_TOTALS = lambda q: q.filter(
    Transaction.is_fraud == False,
    Transaction.is_excluded == False,
    Transaction.transaction_type == "debit",
)


@router.get("/summary")
def summary(
    db: Session = Depends(get_db),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    q = db.query(Transaction)
    if date_from:
        q = q.filter(Transaction.date >= date_from)
    if date_to:
        q = q.filter(Transaction.date <= date_to)

    all_debits = EXCLUDED_FROM_TOTALS(q)
    total_spend = all_debits.with_entities(func.sum(Transaction.amount)).scalar() or 0
    my_spend = all_debits.with_entities(func.sum(func.coalesce(Transaction.personal_share, Transaction.amount))).scalar() or 0
    friends_spend = all_debits.with_entities(func.sum(func.coalesce(Transaction.friends_share, 0))).scalar() or 0
    fraud_count = q.filter(Transaction.is_fraud == True).count()
    total_txn_count = q.filter(Transaction.is_excluded == False).count()

    return {
        "total_spend": round(total_spend, 2),
        "my_spend": round(my_spend, 2),
        "friends_spend": round(friends_spend, 2),
        "fraud_count": fraud_count,
        "total_transactions": total_txn_count,
    }


@router.get("/by-category")
def by_category(
    db: Session = Depends(get_db),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    q = EXCLUDED_FROM_TOTALS(db.query(Transaction))
    if date_from:
        q = q.filter(Transaction.date >= date_from)
    if date_to:
        q = q.filter(Transaction.date <= date_to)

    rows = (
        q.with_entities(
            func.coalesce(Transaction.category_corrected, Transaction.category, "Other").label("cat"),
            func.sum(func.coalesce(Transaction.personal_share, Transaction.amount)).label("total"),
            func.sum(Transaction.amount).label("raw_total"),
            func.count(Transaction.id).label("count"),
        )
        .group_by("cat")
        .order_by(func.sum(func.coalesce(Transaction.personal_share, Transaction.amount)).desc())
        .all()
    )
    return [{"category": r.cat, "total": round(r.total, 2), "raw_total": round(r.raw_total, 2), "count": r.count} for r in rows]


@router.get("/by-month")
def by_month(
    db: Session = Depends(get_db),
    year: Optional[int] = Query(None),
):
    q = EXCLUDED_FROM_TOTALS(db.query(Transaction))
    if year:
        q = q.filter(extract("year", Transaction.date) == year)

    rows = (
        q.with_entities(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            func.sum(func.coalesce(Transaction.personal_share, Transaction.amount)).label("total"),
            func.sum(Transaction.amount).label("raw_total"),
            func.count(Transaction.id).label("count"),
        )
        .group_by("year", "month")
        .order_by("year", "month")
        .all()
    )
    return [
        {"year": int(r.year), "month": int(r.month), "total": round(r.total, 2), "raw_total": round(r.raw_total, 2), "count": r.count}
        for r in rows
    ]


@router.get("/by-card")
def by_card(
    db: Session = Depends(get_db),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    from app.models.card import Card
    q = (
        EXCLUDED_FROM_TOTALS(db.query(Transaction))
        .join(Card, Transaction.card_id == Card.id, isouter=True)
    )
    if date_from:
        q = q.filter(Transaction.date >= date_from)
    if date_to:
        q = q.filter(Transaction.date <= date_to)

    rows = (
        q.with_entities(
            Transaction.card_id,
            func.coalesce(Card.card_name, Card.bank_name, "Unknown").label("card_name"),
            func.sum(func.coalesce(Transaction.personal_share, Transaction.amount)).label("total"),
            func.sum(Transaction.amount).label("raw_total"),
            func.count(Transaction.id).label("count"),
        )
        .group_by(Transaction.card_id)
        .order_by(func.sum(func.coalesce(Transaction.personal_share, Transaction.amount)).desc())
        .all()
    )
    return [{"card_id": r.card_id, "card_name": r.card_name, "total": round(r.total, 2), "raw_total": round(r.raw_total, 2), "count": r.count} for r in rows]


@router.get("/top-merchants")
def top_merchants(
    db: Session = Depends(get_db),
    limit: int = Query(10),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    q = EXCLUDED_FROM_TOTALS(db.query(Transaction))
    if date_from:
        q = q.filter(Transaction.date >= date_from)
    if date_to:
        q = q.filter(Transaction.date <= date_to)

    rows = (
        q.with_entities(
            func.coalesce(Transaction.merchant_corrected, Transaction.merchant, "Unknown").label("merchant"),
            func.sum(func.coalesce(Transaction.personal_share, Transaction.amount)).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .group_by("merchant")
        .order_by(func.sum(func.coalesce(Transaction.personal_share, Transaction.amount)).desc())
        .limit(limit)
        .all()
    )
    return [{"merchant": r.merchant, "total": round(r.total, 2), "count": r.count} for r in rows]
