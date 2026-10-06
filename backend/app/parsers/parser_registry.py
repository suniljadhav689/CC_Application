"""
Parser Registry — auto-detects bank and routes to the correct parser.
"""
import pdfplumber
from app.parsers.utils import open_pdf
from app.parsers.base_parser import BaseParser, ParseResult
from app.parsers.hdfc_parser import HDFCParser
from app.parsers.icici_parser import ICICIParser
from app.parsers.axis_parser import AxisParser
from app.parsers.sbi_parser import SBIParser
from app.parsers.kotak_parser import KotakParser


# All parsers registered in priority order
PARSERS: list[BaseParser] = [
    HDFCParser(),
    ICICIParser(),
    AxisParser(),
    SBIParser(),
    KotakParser(),
]


def detect_bank(pdf_path: str) -> str:
    """Read the first 3 pages of the PDF and return detected bank name."""
    try:
        with open_pdf(pdf_path) as pdf:
            text = ""
            for page in pdf.pages[:3]:
                t = page.extract_text()
                if t:
                    text += t
        for parser in PARSERS:
            if parser.can_parse(text):
                return parser.bank_name
    except Exception:
        pass
    return "UNKNOWN"


def get_parser(bank_name: str) -> BaseParser | None:
    for parser in PARSERS:
        if parser.bank_name == bank_name.upper():
            return parser
    return None


def parse_statement(pdf_path: str) -> ParseResult:
    """Auto-detect bank and parse the statement. Falls back to generic text scan."""
    try:
        with open_pdf(pdf_path) as pdf:
            text = ""
            for page in pdf.pages[:2]:
                t = page.extract_text()
                if t:
                    text += t
    except Exception as e:
        result = ParseResult(bank_name="UNKNOWN")
        result.parse_errors.append(f"Could not open PDF: {str(e)}")
        return result

    # Find matching parser
    for parser in PARSERS:
        if parser.can_parse(text):
            return parser.parse(pdf_path)

    # Try scanning all pages for detection
    try:
        with open_pdf(pdf_path) as pdf:
            full_text = ""
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    full_text += t
        for parser in PARSERS:
            if parser.can_parse(full_text):
                return parser.parse(pdf_path)
    except Exception:
        pass


def _generic_parse(pdf_path: str, text: str) -> ParseResult:
    """Last-resort generic line parser."""
    import re
    from app.parsers.base_parser import ParsedTransaction
    result = ParseResult(bank_name="UNKNOWN")
    result.parse_errors.append("Bank not auto-detected. Used generic parser — please review all transactions.")

    pattern = re.compile(
        r"(\d{2}[/-]\d{2}[/-]\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(Cr|Dr)?",
        re.IGNORECASE,
    )
    dummy = HDFCParser()
    for line in text.splitlines():
        m = pattern.search(line)
        if m:
            date_val = dummy.parse_date(m.group(1))
            merchant = m.group(2).strip()
            res = dummy.clean_amount(m.group(3))
            if date_val and res:
                amount, is_cr = res
                txn_type = "credit" if (is_cr or (m.group(4) and "cr" in m.group(4).lower())) else "debit"
                result.transactions.append(ParsedTransaction(
                    date=date_val, merchant=merchant, amount=amount,
                    transaction_type=txn_type, raw_text=line, confidence=0.5,
                ))
    return result
