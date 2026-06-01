"""Pydantic schemas for commute calculation requests and responses."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

VehicleProfileId = Literal["small_car", "medium_car", "suv", "ute_van"]


class CoordinatesSchema(BaseModel):
    lat: float = Field(..., ge=-90, le=90, description="Latitude (EPSG:4326)")
    lon: float = Field(..., ge=-180, le=180, description="Longitude (EPSG:4326)")
    label: Optional[str] = Field(None, max_length=200, description="Human-readable place name")


class UserProfileSchema(BaseModel):
    """User commute profile and route inputs."""

    origin: CoordinatesSchema
    destination: CoordinatesSchema
    vehicle_profile_id: VehicleProfileId = Field(
        default="medium_car",
        description="Vehicle category when fuel_consumption_l_per_100km is not overridden",
    )
    fuel_consumption_l_per_100km: Optional[float] = Field(
        default=None,
        gt=0,
        le=50,
        description="Override default vehicle fuel consumption (L/100 km)",
    )
    fuel_suburb: str = Field(
        default="Sydney",
        min_length=1,
        max_length=100,
        description="Named location fallback for FuelCheck price lookup",
    )

    @model_validator(mode="after")
    def destination_must_differ_from_origin(self) -> UserProfileSchema:
        if (
            self.origin.lat == self.destination.lat
            and self.origin.lon == self.destination.lon
        ):
            raise ValueError("destination must differ from origin")
        return self


class CoordinatePoint(BaseModel):
    lat: float
    lon: float


class OpalFareDetail(BaseModel):
    distance_km: float
    fare_band: str
    fare_aud: float
    fare_peak_aud: float
    fare_off_peak_aud: float
    fare_type: str


class TransitLeg(BaseModel):
    mode: str
    duration_min: float
    distance_km: float
    route_number: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None


class PublicTransportMetrics(BaseModel):
    duration_min: Optional[float] = None
    distance_km: Optional[float] = None
    cost_aud: Optional[float] = None
    modes: List[str] = Field(default_factory=list)
    route_numbers: List[str] = Field(default_factory=list)
    route_label: Optional[str] = None
    option_rank: Optional[int] = None
    legs: List[TransitLeg] = Field(default_factory=list)
    interchanges: Optional[int] = None
    fare: Optional[OpalFareDetail] = None
    error: Optional[str] = None


class DrivingMetrics(BaseModel):
    duration_min: Optional[float] = None
    distance_km: Optional[float] = None
    cost_aud: Optional[float] = None
    fuel_price_per_litre: Optional[float] = None
    fuel_price_source: Optional[str] = None
    consumption_l_per_100km: Optional[float] = None
    litres_used: Optional[float] = None
    geometry: Optional[str] = None
    warning: Optional[str] = None
    error: Optional[str] = None


class CommuteMetricsResponse(BaseModel):
    origin: CoordinatePoint
    destination: CoordinatePoint
    public_transport: PublicTransportMetrics
    public_transport_options: List[PublicTransportMetrics] = Field(default_factory=list)
    driving: DrivingMetrics
    errors: List[str] = Field(default_factory=list)
    fetched_at: str

    @model_validator(mode="after")
    def backfill_public_transport_options(self) -> CommuteMetricsResponse:
        """Support cached payloads saved before multi-option PT was added."""
        if not self.public_transport_options and self.public_transport.error is None:
            primary = self.public_transport.model_copy()
            if primary.option_rank is None:
                primary.option_rank = 1
            self.public_transport_options = [primary]
        return self
