"""Commute calculation API routes."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from app.models.commute import CommuteMetricsResponse, UserProfileSchema
from app.services.travel_service import CommuteCalculationError, calculate_commute_metrics

logger = logging.getLogger(__name__)

commute_router = APIRouter(prefix="/commute", tags=["commute"])


@commute_router.post(
    "/calculate",
    response_model=CommuteMetricsResponse,
    summary="Calculate commute time and cost",
    responses={
        status.HTTP_503_SERVICE_UNAVAILABLE: {
            "description": "Travel engine unavailable or all commute modes failed",
        },
    },
)
async def calculate_commute(profile: UserProfileSchema) -> CommuteMetricsResponse:
    """Compare public transport vs driving for the given origin, destination, and vehicle profile."""
    try:
        return await calculate_commute_metrics(profile)
    except CommuteCalculationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("Unhandled error in commute calculate endpoint")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred while calculating commute metrics.",
        ) from exc
