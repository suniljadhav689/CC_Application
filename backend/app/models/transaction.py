from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Date, func
from app.db.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    statement_id = Column(Integer, ForeignKey("statements.id"), nullable=True)
    card_id = Column(Integer, ForeignKey("cards.id"), nullable=True)

    # Core fields (from PDF)
    date = Column(Date, nullable=False)
    merchant = Column(String)                    # raw from PDF
    merchant_corrected = Column(String)          # user override
    amount = Column(Float, nullable=False)
    currency = Column(String, default="INR")
    transaction_type = Column(String, default="debit")  # debit | credit

    # Categorization
    category = Column(String)                    # auto-categorized
    category_corrected = Column(String)          # user override

    # Split Tracking
    personal_share = Column(Float, nullable=True) # if null, assume 100% is personal
    friends_share = Column(Float, nullable=True)  # if null, assume 0

    # Flags
    is_fraud = Column(Boolean, default=False)    # flagged as fraud
    is_friends = Column(Boolean, default=False)  # entirely friends expense (legacy/quick flag)
    is_excluded = Column(Boolean, default=False) # excluded from all analytics

    # Review / correction tracking
    parse_reviewed = Column(Boolean, default=False)  # user reviewed after parse

    # Notes
    notes = Column(String, nullable=True)
    raw_text = Column(String, nullable=True)     # original PDF text for this row

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    @property
    def display_merchant(self):
        """Return corrected merchant name if available, else raw."""
        return self.merchant_corrected or self.merchant or "Unknown"

    @property
    def display_category(self):
        """Return corrected category if available, else auto."""
        return self.category_corrected or self.category or "Other"
