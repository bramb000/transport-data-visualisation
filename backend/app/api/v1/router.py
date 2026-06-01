"""API v1 route aggregator."""

from fastapi import APIRouter

from app.api.routes import commute_router
from app.api.v1.routes import health, vehicle_profiles

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(vehicle_profiles.router, tags=["vehicle-profiles"])
api_router.include_router(commute_router)
