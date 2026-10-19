"""
Credit Card Spend Analyzer — FastAPI Backend
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import init_db
from app.api.health import router as health_router
from app.api.statements import router as statements_router
from app.api.transactions import router as transactions_router
from app.api.analytics import router as analytics_router
from app.api.backup import router as backup_router
from app.api.gmail import router as gmail_router
from app.api.cards import router as cards_router

app = FastAPI(
    title="Credit Card Spend Analyzer",
    description="Personal finance backend — parses credit card statements and stores transactions.",
    version="1.0.0",
)

# CORS — allow your Firebase frontend and local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Restrict to Firebase URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health_router)
app.include_router(statements_router)
app.include_router(transactions_router)
app.include_router(analytics_router)
app.include_router(backup_router)
app.include_router(gmail_router)
app.include_router(cards_router)


@app.on_event("startup")
async def startup():
    """Initialize DB and seed categories on first run."""
    init_db()
    from app.db.database import SessionLocal
    from app.services.category_service import seed_categories
    db = SessionLocal()
    try:
        seed_categories(db)
    finally:
        db.close()
    print("[OK] Credit Card Analyzer backend started.")
    print("[INFO] Docs: http://localhost:8000/docs")
