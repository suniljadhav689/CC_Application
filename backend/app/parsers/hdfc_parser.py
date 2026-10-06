"""
HDFC Credit Card Statement Parser
Real format confirmed from actual PDFs:

Transaction lines: DD/MM/YYYY| HH:MM  MERCHANT NAME  [+ ]C AMOUNT  l

CRITICAL RULES:
  - 'C' before amount is the RUPEE CURRENCY SYMBOL (not credit indicator)
  - '+ C' before amount means CREDIT (payment received / cashback)
  - Plain 'C AMOUNT' means DEBIT (a purchase)
  - Lines with '+ C' and no merchant description = payment received
  - 'l' at end is the PI (Purchase Indicator) column marker

Examples from real PDF:
  DEBIT:  '08/03/2026| 17:55 UPI-Hp services center C 1,785.00 l'
  CREDIT: '03/03/2026| 00:06 BPPY CC PAYMENT ... + C 1,313.00 l'
  CREDIT: '18/02/2026| 00:00 10% Swiggy Cashback_Reversal C 20.80 l'
          (Cashback_Reversal in name = credit despite no '+')
"""
import re
from typing import List, Optional
import pdfplumber
from app.parsers.utils import open_pdf
from app.parsers.base_parser import BaseParser, ParseResult, ParsedTransaction

# Detect if a HDFC line is a credit based on '+' prefix before currency symbol
# Format: <description> + C <amount> l
PLUS_C_PATTERN = re.compile(r'\+\s*C\s+[\d,]+\.\d{2}\s*l?\s*$')

# Main line regex: date|time then content then C/+C then amount then optional l
HDFC_TXN = re.compile(
    r'^(\d{2}/\d{2}/\d{4})\|\s*\d{2}:\d{2}\s+(.*?)\s*\+?\s*C\s+([\d,]+\.\d{2})\s*l?\s*$'
)

# Keywords in description that indicate a credit/reversal
CREDIT_KEYWORDS = re.compile(
    r'cashback.*reversal|reversal|payment received|cc payment|refund|'
    r'BPPY CC|credit|cashback(?![\w])',
    re.IGNORECASE
)

SKIP_DESCRIPTION = re.compile(
    r'^(page \d+|HSN Code|HDFC Bank|GSTIN|Important|Useful Links|note:|'
    r'Digitally|Date:|2026\.\d|GST Entry|SGST|I/We hereby)',
    re.IGNORECASE
)


class HDFCParser(BaseParser):
    bank_name = "HDFC"

    def can_parse(self, text: str) -> bool:
        return bool(re.search(r'HDFC\s*Bank\s*Credit\s*Card|HDFC Bank Cards GSTIN', text, re.IGNORECASE))

    def parse(self, pdf_path: str) -> ParseResult:
        result = ParseResult(bank_name=self.bank_name)
        all_transactions: List[ParsedTransaction] = []

        try:
            with open_pdf(pdf_path) as pdf:
                full_text = ""
                for page in pdf.pages:
                    t = page.extract_text() or ""
                    full_text += t + "\n"

                # Extract billing period
                bp = re.search(
                    r'Billing Period\s+(\d{2}\s+\w+,\s+\d{4})\s*[-–]\s*(\d{2}\s+\w+,\s+\d{4})',
                    full_text
                )
                if bp:
                    try:
                        result.statement_period_start = self.parse_date(bp.group(1))
                        result.statement_period_end = self.parse_date(bp.group(2))
                    except Exception:
                        pass

                for line in full_text.splitlines():
                    txn = self._parse_line(line.strip())
                    if txn:
                        all_transactions.append(txn)

        except Exception as e:
            result.parse_errors.append(f"HDFC parse error: {e}")

        result.transactions = self._deduplicate(all_transactions)
        return result

    def _parse_line(self, line: str) -> Optional[ParsedTransaction]:
        """Parse a single HDFC transaction line."""
        if not re.match(r'^\d{2}/\d{2}/\d{4}\|', line):
            return None

        m = HDFC_TXN.match(line)
        if not m:
            return None

        date_str = m.group(1)
        raw_desc = m.group(2).strip()
        raw_amount = m.group(3)

        date_val = self.parse_date(date_str)
        if not date_val:
            return None

        amount = float(raw_amount.replace(',', ''))
        if amount <= 0:
            return None

        # Determine credit vs debit:
        # '+ C' before amount (which HDFC_TXN already consumed via \+?\s*C) 
        # If raw_desc ends with '+' that means it was '+ C' → credit
        # Also detect by keywords in description
        has_plus = raw_desc.endswith('+') or PLUS_C_PATTERN.search(line)
        is_credit = bool(has_plus) or bool(CREDIT_KEYWORDS.search(raw_desc))

        # Clean description from '+' trailing marker
        desc = raw_desc.rstrip('+').strip()

        merchant = self._clean_hdfc_desc(desc)
        if not merchant:
            merchant = "Payment Received" if is_credit else "Unknown"

        return ParsedTransaction(
            date=date_val,
            merchant=merchant,
            amount=amount,
            transaction_type="credit" if is_credit else "debit",
            raw_text=line,
            confidence=0.93,
        )

    def _clean_hdfc_desc(self, raw: str) -> str:
        """Clean up HDFC merchant description."""
        cleaned = raw
        # Remove reference block like '(Ref# ST260240083000010243195)'
        cleaned = re.sub(r'\s*\(Ref#\s*\S+\)', '', cleaned)
        # Remove DP reference codes like 'DP016022222114Jgch4'
        cleaned = re.sub(r'\s+DP\d{10,}\S*', '', cleaned)
        # Remove trailing '+' left from line parsing
        cleaned = cleaned.rstrip('+').strip()
        # Limit length
        if len(cleaned) > 60:
            cleaned = cleaned[:60].strip()
        return cleaned or raw[:40]

    def _deduplicate(self, txns: List[ParsedTransaction]) -> List[ParsedTransaction]:
        seen = set()
        result = []
        for t in txns:
            key = (t.date, round(t.amount, 2), (t.merchant or '')[:15])
            if key not in seen:
                seen.add(key)
                result.append(t)
        return result
