"""FastAPI application entrypoint."""

from __future__ import annotations

from typing import Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import settings
from services.travel_engine import _load_dotenv

_load_dotenv()

app = FastAPI(
    title="Sydney Commute Compare API",
    description="Compare public transport vs private car commute time and cost in Sydney.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/")
def root() -> Dict[str, str]:
    return {"message": "Sydney Commute Compare API", "docs": "/docs"}
