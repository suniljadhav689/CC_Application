"""
Kotak Mahindra Bank Credit Card Statement Parser
Real format (observed from actual PDF):

Page 2 'Transactions Details' table:
  Date          | Description Spends         | Category  | Amount (₹)
  Payments and Other Credits section header (skip)
  03-Mar-2026   | DP016062001347TMCIFZ       |           | 4,101.00 Cr
  Purchases made in this cycle - Primary Card X0877 (skip)
  21-Feb-2026   | UPI-535837405768-MATOSHRI  | Medical   | 80.00
  26-Feb-2026   | Effortless Cashback RCC UPI |          | 250.00 Cr

Rules:
- Table columns: Date | Description | Category | Amount
- Date format: DD-Mon-YYYY (e.g., 21-Feb-2026)
- Amount ends with ' Cr' → credit
- Plain amount → debit
- Skip rows where date cell doesn't match date pattern
- 'Purchases made' / 'Payments and' / section headers → skip
"""
import re
from typing import List, Optional
import pdfplumber
from app.parsers.utils import open_pdf
from app.parsers.base_parser import BaseParser, ParseResult, ParsedTransaction

# Kotak date pattern: 21-Feb-2026 or 21-02-2026
KOTAK_DATE = re.compile(r'^\d{2}[-/]\w{3,}[-/]\d{4}$|^\d{2}[-/]\d{2}[-/]\d{4}$')
KOTAK_AMOUNT = re.compile(r'^([\d,]+\.\d{2})(\s*Cr)?\s*$', re.IGNORECASE)

SKIP_DESC = re.compile(
    r'Purchases made|Payments and|Opening balance|Closing balance|Total Purchase|'
    r'TRANSACTIONS TOTAL|Need quick|Most Important|GST applicable',
    re.IGNORECASE
)


class KotakParser(BaseParser):
    bank_name = "KOTAK"

    def can_parse(self, text: str) -> bool:
        return bool(re.search(
            r'kotak\s*mahindra|kotak\s*bank|kotakbank|kotak\.bank\.in|'
            r'AAACK4409J|League Credit Card|Feast Gold|Dream Different Credit Card|'
            r'Kotak Solitaire|Urbane Gold|Mojo Platinum',
            text, re.IGNORECASE
        ))

    def parse(self, pdf_path: str) -> ParseResult:
        result = ParseResult(bank_name=self.bank_name)
        all_transactions: List[ParsedTransaction] = []

        try:
            with open_pdf(pdf_path) as pdf:
                full_text = ""
                for page in pdf.pages:
                    full_text += (page.extract_text() or "") + "\n"

                # Extract statement period from text
                sp = re.search(
                    r'Transactions Details from\s+(\d{2}-\w+-\d{4})\s+to\s+(\d{2}-\w+-\d{4})',
                    full_text, re.IGNORECASE
                )
                if sp:
                    try:
                        result.statement_period_start = self.parse_date(sp.group(1))
                        result.statement_period_end = self.parse_date(sp.group(2))
                    except Exception:
                        pass

                # Try table extraction first (most reliable for Kotak)
                for page in pdf.pages:
                    tables = page.extract_tables()
                    for table in tables:
                        txns = self._parse_table(table)
                        all_transactions.extend(txns)

                # Fallback: text-based if no table transactions found
                if not all_transactions:
                    for line in full_text.splitlines():
                        txn = self._parse_text_line(line.strip())
                        if txn:
                            all_transactions.append(txn)

        except Exception as e:
            result.parse_errors.append(f"Kotak parse error: {e}")

        result.transactions = self._deduplicate(all_transactions)
        return result

    def _parse_table(self, table: list) -> List[ParsedTransaction]:
        """Parse Kotak's standard table format."""
        txns = []
        for row in (table or []):
            if not row or len(row) < 2:
                continue

            cells = [str(c).strip() if c else '' for c in row]

            # First cell should be a date
            date_cell = cells[0]
            if not KOTAK_DATE.match(date_cell.strip()):
                continue

            date_val = self.parse_date(date_cell)
            if not date_val:
                continue

            # Description in cell 1
            desc = cells[1] if len(cells) > 1 else ''
            if not desc or SKIP_DESC.search(desc):
                continue

            # Category in cell 2 (optional)
            # Amount in last cell
            amount_cell = cells[-1] if cells else ''
            if not amount_cell:
                continue

            am = KOTAK_AMOUNT.match(amount_cell.strip())
            if not am:
                # Try to find amount anywhere in last cell
                am2 = re.search(r'([\d,]+\.\d{2})(\s*Cr)?', amount_cell, re.IGNORECASE)
                if not am2:
                    continue
                raw_amt = am2.group(1)
                is_cr = bool(am2.group(2))
            else:
                raw_amt = am.group(1)
                is_cr = bool(am.group(2))

            amount = float(raw_amt.replace(',', ''))
            if amount <= 0:
                continue

            merchant = self._clean_kotak_desc(desc)
            txn_type = "credit" if is_cr else "debit"

            txns.append(ParsedTransaction(
                date=date_val,
                merchant=merchant,
                amount=amount,
                transaction_type=txn_type,
                raw_text=' | '.join(cells),
                confidence=0.95,
            ))
        return txns

    def _parse_text_line(self, line: str) -> Optional[ParsedTransaction]:
        """Fallback text-line parser for Kotak."""
        # Pattern: DD-Mon-YYYY  Description  [Category]  Amount [Cr]
        m = re.match(
            r'^(\d{2}[-/]\w{3,}[-/]\d{4})\s+(.+?)\s+([\d,]+\.\d{2})(\s*Cr)?\s*$',
            line, re.IGNORECASE
        )
        if not m:
            return None

        date_val = self.parse_date(m.group(1))
        if not date_val:
            return None

        desc = m.group(2).strip()
        if SKIP_DESC.search(desc):
            return None

        amount = float(m.group(3).replace(',', ''))
        if amount <= 0:
            return None

        is_cr = bool(m.group(4))
        merchant = self._clean_kotak_desc(desc)

        return ParsedTransaction(
            date=date_val,
            merchant=merchant,
            amount=amount,
            transaction_type="credit" if is_cr else "debit",
            raw_text=line,
            confidence=0.85,
        )

    def _clean_kotak_desc(self, desc: str) -> str:
        """Clean up Kotak UPI description like 'UPI-535837405768-MATOSHRI CLIN'."""
        # Remove leading UPI reference numbers
        cleaned = re.sub(r'^UPI-\d+-', '', desc)
        cleaned = cleaned.strip()
        return cleaned[:60] if cleaned else desc[:40]

    def _deduplicate(self, txns: List[ParsedTransaction]) -> List[ParsedTransaction]:
        seen = set()
        result = []
        for t in txns:
            key = (t.date, round(t.amount, 2), t.merchant[:15] if t.merchant else '')
            if key not in seen:
                seen.add(key)
                result.append(t)
        return result
