"""
Axis Bank Credit Card Statement Parser
"""
import re
from typing import List
import pdfplumber
from app.parsers.utils import open_pdf
from app.parsers.base_parser import BaseParser, ParseResult, ParsedTransaction


class AxisParser(BaseParser):
    bank_name = "AXIS"

    def can_parse(self, text: str) -> bool:
        return bool(re.search(r"axis\s*bank|axisbank", text, re.IGNORECASE))

    def parse(self, pdf_path: str) -> ParseResult:
        result = ParseResult(bank_name=self.bank_name)
        transactions: List[ParsedTransaction] = []

        try:
            with open_pdf(pdf_path) as pdf:
                for page in pdf.pages:
                    tables = page.extract_tables()
                    for table in tables:
                        for row in table:
                            txn = self._parse_row(row)
                            if txn:
                                transactions.append(txn)

                    if not transactions:
                        text = page.extract_text() or ""
                        transactions.extend(self._parse_text(text))

            result.transactions = self._deduplicate(transactions)
        except Exception as e:
            result.parse_errors.append(f"Axis parse error: {str(e)}")

        return result

    def _parse_row(self, row):
        if not row or len(row) < 3:
            return None
        try:
            raw_cells = [str(c).strip() if c else "" for c in row]
            date_val, merchant, amount, txn_type = None, "", None, "debit"
            for cell in raw_cells:
                if re.match(r"\d{2}[/-]\d{2}[/-]\d{2,4}", cell) and not date_val:
                    date_val = self.parse_date(cell)
                elif len(cell) > 4 and not re.match(r"^[\d,\.]+$", cell.replace(",", "")) and not re.match(r"\d{2}[/-]", cell):
                    if not merchant:
                        merchant = cell
                elif re.match(r"^[\d,]+\.\d{2}$", cell.replace(",", "")):
                    res = self.clean_amount(cell)
                    if res:
                        amount, is_cr = res
                        txn_type = "credit" if is_cr else "debit"
            if date_val and amount and amount > 0:
                return ParsedTransaction(
                    date=date_val, merchant=merchant, amount=amount,
                    transaction_type=txn_type, raw_text="|".join(raw_cells)
                )
        except Exception:
            pass
        return None

    def _parse_text(self, text: str) -> List[ParsedTransaction]:
        txns = []
        pattern = re.compile(
            r"(\d{2}[/-]\d{2}[/-]\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(Cr|Dr)?",
            re.IGNORECASE,
        )
        for line in text.splitlines():
            m = pattern.search(line)
            if m:
                date_val = self.parse_date(m.group(1))
                merchant = m.group(2).strip()
                res = self.clean_amount(m.group(3))
                if date_val and res:
                    amount, is_cr = res
                    txn_type = "credit" if (is_cr or (m.group(4) and "cr" in m.group(4).lower())) else "debit"
                    txns.append(ParsedTransaction(
                        date=date_val, merchant=merchant, amount=amount,
                        transaction_type=txn_type, raw_text=line
                    ))
        return txns

    def _deduplicate(self, txns):
        seen = set()
        result = []
        for t in txns:
            key = (t.date, t.merchant[:20] if t.merchant else "", t.amount)
            if key not in seen:
                seen.add(key)
                result.append(t)
        return result
