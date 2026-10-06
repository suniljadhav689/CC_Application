"""
REST API — Health endpoint (used by frontend for mode detection).
"""
from fastapi import APIRouter
from datetime import datetime

router = APIRouter()


@router.get("/health")
async def health():
    return {
        "status": "live",
        "timestamp": datetime.now().isoformat(),
        "service": "Credit Card Analyzer Backend",
    }
