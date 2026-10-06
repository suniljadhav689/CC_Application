import pdfplumber
from pdfminer.pdfdocument import PDFPasswordIncorrect

DEFAULT_PASSWORDS = ["", "suni0509", "SUNI0509"]

def open_pdf(pdf_path: str):
    """Try to open a PDF using a list of default passwords."""
    for pwd in DEFAULT_PASSWORDS:
        try:
            # We return the context manager
            return pdfplumber.open(pdf_path, password=pwd)
        except PDFPasswordIncorrect:
            continue
        except Exception as e:
            raise e
    
    raise ValueError("PDF is encrypted and none of the default passwords worked.")
