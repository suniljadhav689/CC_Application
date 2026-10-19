"""Manage the user's credit card catalog."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.card import Card

router = APIRouter(prefix="/cards", tags=["cards"])


def card_to_dict(card: Card) -> dict:
    return {
        "id": card.id,
        "bank_name": card.bank_name,
        "card_name": card.card_name,
        "last_four": card.last_four,
        "display_name": f"{card.card_name or card.bank_name}{f' ••{card.last_four}' if card.last_four else ''}",
    }


@router.get("/")
def list_cards(db: Session = Depends(get_db)):
    return [card_to_dict(card) for card in db.query(Card).order_by(Card.bank_name, Card.card_name).all()]


class CardCreate(BaseModel):
    bank_name: str = Field(min_length=1, max_length=80)
    card_name: str = Field(min_length=1, max_length=120)
    last_four: str | None = Field(default=None, pattern=r"^\d{4}$")


@router.post("/")
def create_card(payload: CardCreate, db: Session = Depends(get_db)):
    bank_name = payload.bank_name.strip()
    card_name = payload.card_name.strip()
    if not bank_name or not card_name:
        raise HTTPException(400, detail="Bank and card name are required.")
    query = db.query(Card).filter(Card.bank_name.ilike(bank_name), Card.card_name.ilike(card_name))
    if payload.last_four:
        query = query.filter(Card.last_four == payload.last_four)
    else:
        query = query.filter(Card.last_four.is_(None))
    existing = query.first()
    if existing:
        return card_to_dict(existing)
    card = Card(bank_name=bank_name, card_name=card_name, last_four=payload.last_four)
    db.add(card)
    db.commit()
    db.refresh(card)
    return card_to_dict(card)
