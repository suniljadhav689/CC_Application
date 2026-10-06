"""
ICICI Credit Card Statement Parser
Real format (observed from actual PDFs, incl. Amazon Pay ICICI):

Page 1 'SPENDS OVERVIEW' section:
  Date     SerNo.        Transaction Details          Reward   Intl.#   Amount (in`)
  02/03/2026  12970694586   BBPS Payment received        0               1,569.31 CR
  06/03/2026  13002335971   FLIPKART INTERNET PVT L     402              20,145.00

Rules:
- Line starts with DD/MM/YYYY
- Followed by a numeric serial number
- Then description (may be multi-word)
- Ends with an amount, optionally followed by 'CR'
- 'CR' suffix → credit (payment)
- No CR → debit (purchase)
"""
import re
from typing import List, Optional
import pdfplumber
from app.parsers.utils import open_pdf
from app.parsers.base_parser import BaseParser, ParseResult, ParsedTransaction


# ICICI transaction line pattern
# DD/MM/YYYY  SerialNo  Description  [RewardPts]  Amount [CR]
ICICI_LINE = re.compile(
    r'^(\d{2}/\d{2}/\d{4})\s+(\d{8,})\s+(.+?)\s+(\d+)\s+([\d,]+\.\d{2})(\s+CR)?$',
    re.IGNORECASE,
)

# Simpler fallback: date, serial, description, optional points, amount, optional CR
ICICI_SIMPLE = re.compile(
    r'^(\d{2}/\d{2}/\d{4})\s+\d+\s+(.+?)\s+([\d,]+\.\d{2})(\s+CR)?\s*$',
    re.IGNORECASE,
)


class ICICIParser(BaseParser):
    bank_name = "ICICI"

    def can_parse(self, text: str) -> bool:
        return bool(re.search(r'icici\s*bank|icicidirect|icici credit|iMobile Pay', text, re.IGNORECASE))

    def parse(self, pdf_path: str) -> ParseResult:
        result = ParseResult(bank_name=self.bank_name)
        all_transactions: List[ParsedTransaction] = []

        try:
            with open_pdf(pdf_path) as pdf:
                full_text = ""
                for page in pdf.pages:
                    t = page.extract_text() or ""
                    full_text += t + "\n"

                # Extract statement period
                sp = re.search(
                    r'Statement period\s*:\s*(\w+ \d+,\s*\d{4})\s+to\s+(\w+ \d+,\s*\d{4})',
                    full_text, re.IGNORECASE
                )
                if sp:
                    try:
                        result.statement_period_start = self.parse_date(sp.group(1))
                        result.statement_period_end = self.parse_date(sp.group(2))
                    except Exception:
                        pass

                for line in full_text.splitlines():
                    txn = self._parse_line(line.strip())
                    if txn:
                        all_transactions.append(txn)

        except Exception as e:
            result.parse_errors.append(f"ICICI parse error: {e}")

        result.transactions = self._deduplicate(all_transactions)
        return result

    def _parse_line(self, line: str) -> Optional[ParsedTransaction]:
        """Parse a single ICICI transaction line."""
        # Must start with date
        if not re.match(r'^\d{2}/\d{2}/\d{4}\s', line):
            return None

        date_match = re.match(r'^(\d{2}/\d{2}/\d{4})\s+', line)
        if not date_match:
            return None

        date_val = self.parse_date(date_match.group(1))
        if not date_val:
            return None

        remainder = line[date_match.end():]

        # Skip pure serial number at front
        remainder = re.sub(r'^\d{8,}\s+', '', remainder)

        # Amount is at the end, optionally followed by ' CR'
        cr_flag = False
        amount_match = re.search(r'([\d,]+\.\d{2})(\s+CR)?\s*$', remainder, re.IGNORECASE)
        if not amount_match:
            return None

        raw_amount = amount_match.group(1)
        cr_flag = bool(amount_match.group(2))
        amount = float(raw_amount.replace(',', ''))
        if amount <= 0:
            return None

        # Description is everything before the amount (minus trailing reward points)
        desc = remainder[:amount_match.start()].strip()
        # Strip trailing reward points (single number at end)
        desc = re.sub(r'\s+\d+\s*$', '', desc).strip()
        # Strip trailing intl marker
        desc = re.sub(r'\s+(IN|#)\s*$', '', desc).strip()

        merchant = desc[:60] if desc else "Unknown"
        txn_type = "credit" if cr_flag else "debit"

        return ParsedTransaction(
            date=date_val,
            merchant=merchant,
            amount=amount,
            transaction_type=txn_type,
            raw_text=line,
            confidence=0.95,
        )

    def _deduplicate(self, txns: List[ParsedTransaction]) -> List[ParsedTransaction]:
        seen = set()
        result = []
        for t in txns:
            key = (t.date, round(t.amount, 2), t.merchant[:15] if t.merchant else '')
            if key not in seen:
                seen.add(key)
                result.append(t)
        return result
