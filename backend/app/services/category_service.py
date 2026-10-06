"""
Category Service — auto-categorizes transaction by merchant name.
"""
import re
from sqlalchemy.orm import Session
from app.models.category_rule import CategoryRule, DEFAULT_RULES


def categorize(merchant: str, db: Session) -> str:
    """Match merchant against category rules (highest priority first)."""
    if not merchant:
        return "Other"

    merchant_lower = merchant.lower()

    # Load rules ordered by priority DESC
    rules = db.query(CategoryRule).order_by(CategoryRule.priority.desc()).all()

    for rule in rules:
        try:
            if re.search(rule.pattern.lower(), merchant_lower):
                return rule.category
        except re.error:
            if rule.pattern.lower() in merchant_lower:
                return rule.category

    return "Other"


def seed_categories(db: Session):
    """Seed default category rules if the table is empty."""
    if db.query(CategoryRule).count() == 0:
        for pattern, category, priority in DEFAULT_RULES:
            db.add(CategoryRule(pattern=pattern, category=category, priority=priority))
        db.commit()
