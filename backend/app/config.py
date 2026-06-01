"""Application configuration via environment variables."""

from typing import Dict

from pydantic_settings import BaseSettings, SettingsConfigDict


class VehicleProfileDefaults:
    """Default fuel consumption (L/100 km) by vehicle category."""

    SMALL_CAR = 6.5
    MEDIUM_CAR = 8.0
    SUV = 11.0
    UTE_VAN = 12.5

    @classmethod
    def as_dict(cls) -> Dict[str, float]:
        return {
            "small_car": cls.SMALL_CAR,
            "medium_car": cls.MEDIUM_CAR,
            "suv": cls.SUV,
            "ute_van": cls.UTE_VAN,
        }


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    tfnsw_api_key: str = ""
    maptiler_api_key: str = ""
    openrouteservice_api_key: str = ""
    fuelcheck_api_key: str = ""
    fuelcheck_api_secret: str = ""
    fuelcheck_api_version: str = "v1"
    database_url: str = "sqlite:///./data/commute_compare.db"
    cache_ttl_hours: int = 24
    api_v1_prefix: str = "/api/v1"


settings = Settings()
