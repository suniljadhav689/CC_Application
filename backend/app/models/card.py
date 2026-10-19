from sqlalchemy import Column, Integer, String, DateTime, func
from app.db.database import Base


class Card(Base):
    __tablename__ = "cards"

    id = Column(Integer, primary_key=True, index=True)
    bank_name = Column(String, nullable=False)   # HDFC, ICICI, AXIS, SBI, KOTAK
    card_name = Column(String)                   # e.g. "HDFC Regalia"
    last_four = Column(String(4))                # last 4 digits
    parser_id = Column(String)                   # links to parser module
    created_at = Column(DateTime, default=func.now())

    @property
    def display_name(self):
        return f"{self.card_name or self.bank_name}{f' ••{self.last_four}' if self.last_four else ''}"
