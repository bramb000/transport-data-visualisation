"""Vehicle profile defaults for car cost calculations."""

from __future__ import annotations

from typing import Dict, Union

from fastapi import APIRouter

from app.config import VehicleProfileDefaults

router = APIRouter()


@router.get("/vehicle-profiles")
def list_vehicle_profiles() -> Dict[str, Dict[str, Union[float, str]]]:
    """Return default fuel consumption by vehicle category (L/100 km)."""
    profiles = VehicleProfileDefaults.as_dict()
    return {
        key: {
            "id": key,
            "label": key.replace("_", " ").title(),
            "default_consumption_l_per_100km": value,
        }
        for key, value in profiles.items()
    }
