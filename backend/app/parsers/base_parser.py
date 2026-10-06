"""
Base PDF Parser — all bank parsers extend this.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from typing import List, Optional
import re


@dataclass
class ParsedTransaction:
    date: date
    merchant: str
    amount: float
    transaction_type: str = "debit"   # debit | credit
    raw_text: str = ""
    confidence: float = 1.0           # 0-1, lower = needs review


@dataclass
class ParseResult:
    bank_name: str
    transactions: List[ParsedTransaction] = field(default_factory=list)
    statement_period_start: Optional[date] = None
    statement_period_end: Optional[date] = None
    parse_errors: List[str] = field(default_factory=list)
    raw_text_sample: str = ""


class BaseParser(ABC):
    """Abstract base class for all bank PDF parsers."""

    bank_name: str = "UNKNOWN"

    @abstractmethod
    def can_parse(self, text: str) -> bool:
        """Return True if this parser can handle the given PDF text."""
        pass

    @abstractmethod
    def parse(self, pdf_path: str) -> ParseResult:
        """Parse the PDF and return a ParseResult."""
        pass

    # ── Shared utility helpers ──────────────────────────────────────────── #

    def clean_amount(self, raw: str) -> Optional[float]:
        """Parse amount string like '1,234.56' or '1234.56 Cr' → float."""
        if not raw:
            return None
        raw = raw.strip().replace(",", "").replace(" ", "")
        raw = re.sub(r"[₹Rs]", "", raw, flags=re.IGNORECASE)
        # Strip trailing Cr/Dr
        is_credit = re.search(r"cr", raw, re.IGNORECASE) is not None
        raw = re.sub(r"(cr|dr)$", "", raw, flags=re.IGNORECASE)
        try:
            return (float(raw), is_credit)
        except ValueError:
            return None

    def parse_date(self, raw: str) -> Optional[date]:
        """Try multiple date formats."""
        from dateutil.parser import parse as dateutil_parse
        if not raw:
            return None
        raw = raw.strip()
        try:
            return dateutil_parse(raw, dayfirst=True).date()
        except Exception:
            return None

    def extract_text(self, pdf_path: str) -> str:
        """Extract all text from PDF using pdfplumber."""
        import pdfplumber
        full_text = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    full_text.append(t)
        return "\n".join(full_text)

    def extract_tables(self, pdf_path: str) -> List[List[List]]:
        """Extract all tables from PDF."""
        import pdfplumber
        all_tables = []
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                if tables:
                    all_tables.extend(tables)
        return all_tables
