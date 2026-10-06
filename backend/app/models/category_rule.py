from sqlalchemy import Column, Integer, String, func, DateTime
from app.db.database import Base


class CategoryRule(Base):
    __tablename__ = "category_rules"

    id = Column(Integer, primary_key=True, index=True)
    pattern = Column(String, nullable=False)     # keyword or regex to match merchant
    category = Column(String, nullable=False)    # category to assign
    priority = Column(Integer, default=0)        # higher = checked first
    created_at = Column(DateTime, default=func.now())


# Default category seed data
DEFAULT_RULES = [
    # Food & Dining
    ("zomato", "Food & Dining", 10),
    ("swiggy", "Food & Dining", 10),
    ("dominos", "Food & Dining", 10),
    ("mcdonald", "Food & Dining", 10),
    ("kfc", "Food & Dining", 10),
    ("cafe", "Food & Dining", 5),
    ("restaurant", "Food & Dining", 5),
    ("pizza", "Food & Dining", 5),
    ("biryani", "Food & Dining", 5),

    # Groceries
    ("bigbasket", "Groceries", 10),
    ("grofers", "Groceries", 10),
    ("blinkit", "Groceries", 10),
    ("dmart", "Groceries", 10),
    ("reliance fresh", "Groceries", 10),
    ("more supermarket", "Groceries", 10),
    ("supermarket", "Groceries", 5),
    ("grocery", "Groceries", 5),

    # Travel & Transport
    ("uber", "Travel & Transport", 10),
    ("ola", "Travel & Transport", 10),
    ("rapido", "Travel & Transport", 10),
    ("irctc", "Travel & Transport", 10),
    ("makemytrip", "Travel & Transport", 10),
    ("goibibo", "Travel & Transport", 10),
    ("indigo", "Travel & Transport", 10),
    ("air india", "Travel & Transport", 10),
    ("vistara", "Travel & Transport", 10),
    ("metro", "Travel & Transport", 5),
    ("railway", "Travel & Transport", 5),
    ("airline", "Travel & Transport", 5),
    ("flight", "Travel & Transport", 5),
    ("taxi", "Travel & Transport", 5),

    # Fuel
    ("hp petrol", "Fuel", 10),
    ("indian oil", "Fuel", 10),
    ("bharat petroleum", "Fuel", 10),
    ("petrolu", "Fuel", 10),
    ("petrol", "Fuel", 5),
    ("fuel", "Fuel", 5),

    # Shopping
    ("amazon", "Shopping", 10),
    ("flipkart", "Shopping", 10),
    ("myntra", "Shopping", 10),
    ("ajio", "Shopping", 10),
    ("meesho", "Shopping", 10),
    ("nykaa", "Shopping", 10),
    ("tatacliq", "Shopping", 10),
    ("snapdeal", "Shopping", 10),

    # Entertainment
    ("netflix", "Entertainment", 10),
    ("prime video", "Entertainment", 10),
    ("hotstar", "Entertainment", 10),
    ("spotify", "Entertainment", 10),
    ("youtube", "Entertainment", 10),
    ("bookmyshow", "Entertainment", 10),
    ("pvr", "Entertainment", 10),
    ("inox", "Entertainment", 10),

    # Utilities & Bills
    ("electricity", "Utilities & Bills", 10),
    ("water bill", "Utilities & Bills", 10),
    ("gas bill", "Utilities & Bills", 10),
    ("airtel", "Utilities & Bills", 10),
    ("jio", "Utilities & Bills", 10),
    ("vi ", "Utilities & Bills", 10),
    ("bsnl", "Utilities & Bills", 10),
    ("tata sky", "Utilities & Bills", 10),
    ("dish tv", "Utilities & Bills", 10),
    ("recharge", "Utilities & Bills", 5),

    # Healthcare
    ("pharmacy", "Healthcare", 10),
    ("medical", "Healthcare", 10),
    ("hospital", "Healthcare", 10),
    ("clinic", "Healthcare", 10),
    ("apollo", "Healthcare", 10),
    ("fortis", "Healthcare", 10),
    ("1mg", "Healthcare", 10),
    ("netmeds", "Healthcare", 10),
    ("pharmeasy", "Healthcare", 10),
    ("doctor", "Healthcare", 5),

    # Education
    ("byju", "Education", 10),
    ("unacademy", "Education", 10),
    ("udemy", "Education", 10),
    ("coursera", "Education", 10),
    ("school fee", "Education", 10),
    ("college fee", "Education", 10),
    ("tuition", "Education", 5),

    # EMI & Finance
    ("emi", "EMI & Finance", 10),
    ("loan", "EMI & Finance", 10),
    ("insurance", "EMI & Finance", 10),
    ("lic", "EMI & Finance", 10),
    ("mutual fund", "EMI & Finance", 10),
    ("sip", "EMI & Finance", 10),
    ("zerodha", "EMI & Finance", 10),
    ("groww", "EMI & Finance", 10),
    ("hdfc bank", "EMI & Finance", 5),
]
