from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Date, func
from app.db.database import Base


class Statement(Base):
    __tablename__ = "statements"

    id = Column(Integer, primary_key=True, index=True)
    card_id = Column(Integer, ForeignKey("cards.id"), nullable=True)
    filename = Column(String, nullable=False)
    bank_detected = Column(String)               # auto-detected bank name
    card_name = Column(String, nullable=True)    # parsed card name/number
    upload_date = Column(DateTime, default=func.now())
    statement_period_start = Column(Date, nullable=True)
    statement_period_end = Column(Date, nullable=True)
    status = Column(String, default="pending")   # pending | processing | done | error
    error_message = Column(String, nullable=True)
    transaction_count = Column(Integer, default=0)
    last_synced_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
