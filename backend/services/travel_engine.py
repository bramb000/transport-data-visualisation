"""Core commute data fetching and cost calculation engine.

Fetches multimodal public transport routes from TfNSW and driving routes from
OpenRouteService, then normalizes results with Opal bus fare bands and FuelCheck
fuel costs.

Run standalone:
    cd backend && python -m services.travel_engine
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import httpx

logger = logging.getLogger(__name__)

Coords = Tuple[float, float]  # (latitude, longitude)

TFNSW_TRIP_URL = "https://api.transport.nsw.gov.au/v1/tp/trip"
ORS_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/json"
FUELCHECK_TOKEN_URL = "https://api.onegov.nsw.gov.au/oauth/client_credential/accesstoken"

DEFAULT_REQUEST_TIMEOUT = 30.0
DEFAULT_FUEL_CONSUMPTION_L_PER_100KM = 10.0
MAX_PT_JOURNEY_OPTIONS = 3
FALLBACK_UNLEADED_91_PRICE_AUD = 1.95  # Used only when FuelCheck credentials are absent
FUELCHECK_UNLEADED_91_CODE = "U91"  # Unleaded 91 — not E7 (see FuelPriceCheck v1 ref data)

# Adult Opal bus fare bands (peak), effective 14 July 2025.
# Source: https://www.transportnsw.info/tickets-fares/fares/adult-opal-fares
WALKING_PRODUCT_CLASSES = {100}


class TravelEngineError(Exception):
    """Raised when commute data cannot be fetched or normalized."""


def _load_dotenv() -> None:
    """Load backend/.env into os.environ when running as a standalone script."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _haversine_metres(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_m = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius_m * math.asin(math.sqrt(a))


def _tfnsw_coord(lat: float, lon: float) -> str:
    """Format coordinates for TfNSW (longitude first)."""
    return f"{lon}:{lat}:EPSG:4326"


def _is_walking_leg(leg: Dict[str, Any]) -> bool:
    product = leg.get("transportation", {}).get("product", {})
    if product.get("class") in WALKING_PRODUCT_CLASSES:
        return True
    name = (product.get("name") or "").lower()
    return name in {"footpath", "walking", "walk"}


def calculate_opal_fare(distance_km: float, peak: bool = True) -> Dict[str, Union[float, str]]:
    """Map transit distance to Sydney adult Opal bus fare bands.

    Bands (km): 0–3, 3–8, 8+.
    Returns peak fare by default; off-peak values are included for reference.
    """
    if distance_km < 0:
        raise ValueError("distance_km must be non-negative")

    off_peak_map = {"0_3km": 2.31, "3_8km": 3.14, "over_8km": 4.03}

    if distance_km <= 3.0:
        band_label, peak_fare = "0_3km", 3.30
    elif distance_km <= 8.0:
        band_label, peak_fare = "3_8km", 4.49
    else:
        band_label, peak_fare = "over_8km", 5.77

    selected_fare = peak_fare if peak else off_peak_map[band_label]

    return {
        "distance_km": round(distance_km, 3),
        "fare_band": band_label,
        "fare_aud": round(selected_fare, 2),
        "fare_peak_aud": round(peak_fare, 2),
        "fare_off_peak_aud": round(off_peak_map[band_label], 2),
        "fare_type": "opal_adult_bus_peak" if peak else "opal_adult_bus_off_peak",
    }


async def _fetch_fuelcheck_token(client: httpx.AsyncClient) -> str:
    """Obtain OAuth bearer token (GET, not POST — per api.nsw.gov.au Fuel API docs)."""
    import base64

    api_key = _env("FUELCHECK_API_KEY")
    api_secret = _env("FUELCHECK_API_SECRET")
    if not api_key or not api_secret:
        raise TravelEngineError(
            "FuelCheck credentials missing. Set FUELCHECK_API_KEY and FUELCHECK_API_SECRET in backend/.env"
        )

    encoded = base64.b64encode(f"{api_key}:{api_secret}".encode()).decode()
    response = await client.get(
        FUELCHECK_TOKEN_URL,
        params={"grant_type": "client_credentials"},
        headers={"Authorization": f"Basic {encoded}", "Accept": "application/json"},
        timeout=DEFAULT_REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    if not response.text.strip():
        raise TravelEngineError("FuelCheck OAuth returned an empty response body")
    payload = response.json()
    token = payload.get("access_token")
    if not token:
        raise TravelEngineError("FuelCheck OAuth response did not include access_token")
    return token


def _fuelcheck_request_headers(api_key: str, token: str) -> Dict[str, str]:
    """Required headers for FuelPriceCheck v1/v2 POST endpoints."""
    return {
        "Authorization": f"Bearer {token}",
        "apikey": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "transactionID": str(uuid.uuid4()),
        "requestTimeStamp": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
    }


def _fuelcheck_url(endpoint: str) -> str:
    """Build a FuelPriceCheck URL for the configured API version (v1 or v2)."""
    version = _env("FUELCHECK_API_VERSION", "v1")
    return f"https://api.onegov.nsw.gov.au/FuelPriceCheck/{version}/fuel/prices/{endpoint}"


async def fetch_average_unleaded_91_price(
    client: httpx.AsyncClient,
    *,
    latitude: float = -33.8688,
    longitude: float = 151.2093,
    radius_km: int = 15,
    suburb: str = "Sydney",
) -> Dict[str, Any]:
    """Fetch average Unleaded 91 (E7) price via FuelCheck.

    Uses **v1 Prices Nearby** by default (NSW-only, POST with lat/lon/radius).
    Falls back to **v1 Prices For Location** if nearby returns no stations.
    See https://api.nsw.gov.au/Product/Index/22
    """
    api_key = _env("FUELCHECK_API_KEY")
    api_secret = _env("FUELCHECK_API_SECRET")

    if not api_key or not api_secret:
        return {
            "price_per_litre": FALLBACK_UNLEADED_91_PRICE_AUD,
            "source": "fallback_default",
            "station_count": 0,
            "warning": "FuelCheck credentials not configured; using fallback average price",
        }

    token = await _fetch_fuelcheck_token(client)
    headers = _fuelcheck_request_headers(api_key, token)

    # Primary: Prices Nearby (v1 POST) — radius in km around route midpoint
    nearby_body = {
        "fueltype": FUELCHECK_UNLEADED_91_CODE,
        "latitude": latitude,
        "longitude": longitude,
        "radius": radius_km,
    }
    response = await client.post(
        _fuelcheck_url("nearby"),
        json=nearby_body,
        headers=headers,
        timeout=DEFAULT_REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    prices_cents = _extract_fuel_prices_cents(response.json())

    # Fallback: Prices For Location (named suburb/postcode)
    if not prices_cents:
        location_response = await client.post(
            _fuelcheck_url("location"),
            json={"fueltype": FUELCHECK_UNLEADED_91_CODE, "namedlocation": suburb},
            headers=_fuelcheck_request_headers(api_key, token),
            timeout=DEFAULT_REQUEST_TIMEOUT,
        )
        location_response.raise_for_status()
        prices_cents = _extract_fuel_prices_cents(location_response.json())

    if not prices_cents:
        raise TravelEngineError(
            f"No Unleaded 91 ({FUELCHECK_UNLEADED_91_CODE}) prices returned near "
            f"({latitude}, {longitude}) or location '{suburb}'"
        )

    # API returns prices in cents per litre (e.g. 175.9 → $1.759/L)
    prices_aud = [p / 100.0 for p in prices_cents]
    average = sum(prices_aud) / len(prices_aud)
    return {
        "price_per_litre": round(average, 3),
        "source": "fuelcheck_api",
        "api_version": _env("FUELCHECK_API_VERSION", "v1"),
        "endpoint": "nearby",
        "fuel_type": FUELCHECK_UNLEADED_91_CODE,
        "station_count": len(prices_aud),
        "latitude": latitude,
        "longitude": longitude,
        "radius_km": radius_km,
        "namedlocation": suburb,
    }


def _extract_fuel_prices_cents(payload: Any) -> List[float]:
    """Parse FuelCheck nearby/location response; values are cents per litre."""
    if not isinstance(payload, dict):
        return []

    prices: List[float] = []
    for item in payload.get("prices") or []:
        if isinstance(item, dict):
            value = item.get("price") or item.get("Price")
            if value is not None:
                prices.append(float(value))

    return prices


async def calculate_driving_cost(
    distance_km: float,
    client: Optional[httpx.AsyncClient] = None,
    consumption_l_per_100km: float = DEFAULT_FUEL_CONSUMPTION_L_PER_100KM,
    *,
    latitude: float = -33.8688,
    longitude: float = 151.2093,
    suburb: str = "Sydney",
) -> Dict[str, Any]:
    """Calculate driving fuel cost using FuelCheck average Unleaded 91 price."""
    if distance_km < 0:
        raise ValueError("distance_km must be non-negative")

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient()

    try:
        fuel_info = await fetch_average_unleaded_91_price(
            client,
            latitude=latitude,
            longitude=longitude,
            suburb=suburb,
        )
        litres = distance_km * (consumption_l_per_100km / 100.0)
        cost_aud = litres * fuel_info["price_per_litre"]
        return {
            "distance_km": round(distance_km, 3),
            "consumption_l_per_100km": consumption_l_per_100km,
            "fuel_price_per_litre": fuel_info["price_per_litre"],
            "fuel_price_source": fuel_info.get("source"),
            "fuel_station_count": fuel_info.get("station_count", 0),
            "litres_used": round(litres, 3),
            "cost_aud": round(cost_aud, 2),
            "warning": fuel_info.get("warning"),
        }
    finally:
        if owns_client and client is not None:
            await client.aclose()


def _leg_distance_metres(leg: Dict[str, Any]) -> float:
    if leg.get("distance") is not None:
        return float(leg["distance"])

    origin = leg.get("origin", {}).get("coord") or []
    destination = leg.get("destination", {}).get("coord") or []
    if len(origin) >= 2 and len(destination) >= 2:
        # TfNSW coords are [lon, lat]
        return _haversine_metres(origin[1], origin[0], destination[1], destination[0])
    return 0.0


def _journey_route_signature(journey: Dict[str, Any]) -> tuple:
    """Unique key for deduplicating journeys (primarily by bus/train route numbers)."""
    signature: List[str] = []
    for leg in journey.get("legs") or []:
        if _is_walking_leg(leg):
            continue
        transport = leg.get("transportation") or {}
        route_number = transport.get("number")
        product = transport.get("product") or {}
        if route_number:
            signature.append(f"route:{route_number}")
        else:
            signature.append(f"mode:{product.get('name', 'unknown')}")
    return tuple(signature) if signature else ("unknown",)


def _build_route_label(route_numbers: List[str], modes: List[str]) -> str:
    if route_numbers:
        if len(route_numbers) == 1:
            return f"Route {route_numbers[0]}"
        return "Route " + " → ".join(route_numbers)
    if modes:
        return " / ".join(modes)
    return "Public transport"


def _parse_tfnsw_journey(journey: Dict[str, Any], option_rank: int = 1) -> Dict[str, Any]:
    legs = journey.get("legs") or []
    transit_legs: List[Dict[str, Any]] = []
    modes: List[str] = []
    route_numbers: List[str] = []
    total_duration_sec = 0
    transit_distance_m = 0.0

    for leg in legs:
        duration = leg.get("duration") or 0
        total_duration_sec += duration

        if _is_walking_leg(leg):
            continue

        transport = leg.get("transportation") or {}
        product = transport.get("product") or {}
        mode_name = product.get("name") or "unknown"
        route_number = transport.get("number")
        if route_number:
            route_numbers.append(str(route_number))
        modes.append(mode_name)

        leg_distance_m = _leg_distance_metres(leg)
        transit_distance_m += leg_distance_m

        transit_legs.append(
            {
                "mode": mode_name,
                "duration_min": round(duration / 60.0, 1),
                "distance_km": round(leg_distance_m / 1000.0, 3),
                "route_number": str(route_number) if route_number else None,
                "origin": leg.get("origin", {}).get("name"),
                "destination": leg.get("destination", {}).get("name"),
            }
        )

    distance_km = transit_distance_m / 1000.0
    fare = calculate_opal_fare(distance_km)

    return {
        "duration_min": round(total_duration_sec / 60.0, 1),
        "transit_distance_km": round(distance_km, 3),
        "modes": modes,
        "route_numbers": route_numbers,
        "route_label": _build_route_label(route_numbers, modes),
        "option_rank": option_rank,
        "legs": transit_legs,
        "cost_aud": fare["fare_aud"],
        "fare": fare,
        "interchanges": journey.get("interchanges"),
    }


def _dedupe_journey_options(journeys: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return up to MAX_PT_JOURNEY_OPTIONS unique journeys from TfNSW results."""
    seen: set = set()
    unique: List[Dict[str, Any]] = []
    for journey in journeys:
        signature = _journey_route_signature(journey)
        if signature in seen:
            continue
        seen.add(signature)
        unique.append(journey)
        if len(unique) >= MAX_PT_JOURNEY_OPTIONS:
            break
    return unique


def _pt_option_to_result(option: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "duration_min": option["duration_min"],
        "distance_km": option["transit_distance_km"],
        "cost_aud": option["cost_aud"],
        "modes": option["modes"],
        "route_numbers": option["route_numbers"],
        "route_label": option["route_label"],
        "option_rank": option["option_rank"],
        "legs": option["legs"],
        "interchanges": option.get("interchanges"),
        "fare": option["fare"],
        "error": None,
    }


async def _fetch_tfnsw_journey_options(
    client: httpx.AsyncClient,
    origin: Coords,
    destination: Coords,
) -> List[Dict[str, Any]]:
    """Fetch and parse up to three distinct public transport journey options."""
    api_key = _env("TFNSW_API_KEY")
    if not api_key:
        raise TravelEngineError("TFNSW_API_KEY is not configured")

    now = datetime.now()
    params = {
        "outputFormat": "rapidJSON",
        "coordOutputFormat": "EPSG:4326",
        "type_origin": "coord",
        "name_origin": _tfnsw_coord(origin[0], origin[1]),
        "type_destination": "coord",
        "name_destination": _tfnsw_coord(destination[0], destination[1]),
        "itdDate": now.strftime("%Y%m%d"),
        "itdTime": now.strftime("%H%M"),
        # Request extra journeys so dedupe by route number still yields 2–3 options
        "calcNumberOfTrips": 6,
        "TfNSWIT": "true",
    }
    headers = {"Authorization": f"apikey {api_key}"}

    response = await client.get(
        TFNSW_TRIP_URL,
        params=params,
        headers=headers,
        timeout=DEFAULT_REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    payload = response.json()

    journeys = payload.get("journeys") or []
    if not journeys:
        raise TravelEngineError("TfNSW returned no journeys for the requested route")

    unique_journeys = _dedupe_journey_options(journeys)
    return [
        _parse_tfnsw_journey(journey, option_rank=index)
        for index, journey in enumerate(unique_journeys, start=1)
    ]


async def _fetch_ors_driving_route(
    client: httpx.AsyncClient,
    origin: Coords,
    destination: Coords,
) -> Dict[str, Any]:
    api_key = _env("OPENROUTESERVICE_API_KEY")
    if not api_key:
        raise TravelEngineError(
            "OPENROUTESERVICE_API_KEY is not configured. "
            "Register a free key at https://openrouteservice.org/dev/#/signup"
        )

    body = {
        "coordinates": [
            [origin[1], origin[0]],
            [destination[1], destination[0]],
        ]
    }
    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    response = await client.post(
        ORS_DIRECTIONS_URL,
        json=body,
        headers=headers,
        timeout=DEFAULT_REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    payload = response.json()

    routes = payload.get("routes") or []
    if not routes:
        raise TravelEngineError("OpenRouteService returned no driving routes")

    route = routes[0]
    summary = route.get("summary") or {}
    distance_m = summary.get("distance")
    duration_sec = summary.get("duration")

    if distance_m is None or duration_sec is None:
        raise TravelEngineError("OpenRouteService response missing distance or duration")

    return {
        "distance_km": round(float(distance_m) / 1000.0, 3),
        "duration_min": round(float(duration_sec) / 60.0, 1),
        "geometry": route.get("geometry"),
    }


def _empty_mode_result(error: str) -> Dict[str, Any]:
    return {
        "duration_min": None,
        "distance_km": None,
        "cost_aud": None,
        "error": error,
    }


async def fetch_commute_data(
    origin_coords: Coords,
    dest_coords: Coords,
    *,
    fuel_suburb: str = "Sydney",
    fuel_consumption_l_per_100km: float = DEFAULT_FUEL_CONSUMPTION_L_PER_100KM,
) -> Dict[str, Any]:
    """Fetch and normalize multimodal PT and driving commute data in parallel."""
    errors: List[str] = []

    async with httpx.AsyncClient() as client:
        pt_task = asyncio.create_task(_fetch_tfnsw_journey_options(client, origin_coords, dest_coords))
        drive_task = asyncio.create_task(_fetch_ors_driving_route(client, origin_coords, dest_coords))

        pt_result: Optional[Dict[str, Any]] = None
        drive_route: Optional[Dict[str, Any]] = None

        pt_data, drive_data = await asyncio.gather(pt_task, drive_task, return_exceptions=True)

        if isinstance(pt_data, Exception):
            errors.append(f"public_transport: {pt_data}")
            pt_result = _empty_mode_result(str(pt_data))
            pt_options: List[Dict[str, Any]] = []
        else:
            pt_options = [_pt_option_to_result(option) for option in pt_data]
            pt_result = pt_options[0] if pt_options else _empty_mode_result("No public transport options returned")

        if isinstance(drive_data, Exception):
            errors.append(f"driving: {drive_data}")
            driving = _empty_mode_result(str(drive_data))
        else:
            drive_route = drive_data
            try:
                cost = await calculate_driving_cost(
                    drive_route["distance_km"],
                    client=client,
                    consumption_l_per_100km=fuel_consumption_l_per_100km,
                    latitude=(origin_coords[0] + dest_coords[0]) / 2,
                    longitude=(origin_coords[1] + dest_coords[1]) / 2,
                    suburb=fuel_suburb,
                )
                driving = {
                    "duration_min": drive_route["duration_min"],
                    "distance_km": drive_route["distance_km"],
                    "cost_aud": cost["cost_aud"],
                    "fuel_price_per_litre": cost["fuel_price_per_litre"],
                    "fuel_price_source": cost.get("fuel_price_source"),
                    "consumption_l_per_100km": cost["consumption_l_per_100km"],
                    "litres_used": cost["litres_used"],
                    "geometry": drive_route.get("geometry"),
                    "warning": cost.get("warning"),
                    "error": None,
                }
            except Exception as exc:  # noqa: BLE001 - normalize downstream failures
                errors.append(f"driving_cost: {exc}")
                driving = {
                    "duration_min": drive_route["duration_min"],
                    "distance_km": drive_route["distance_km"],
                    "cost_aud": None,
                    "geometry": drive_route.get("geometry"),
                    "error": str(exc),
                }

    return {
        "origin": {"lat": origin_coords[0], "lon": origin_coords[1]},
        "destination": {"lat": dest_coords[0], "lon": dest_coords[1]},
        "public_transport": pt_result,
        "public_transport_options": pt_options,
        "driving": driving,
        "errors": errors,
        "fetched_at": datetime.now().isoformat(timespec="seconds"),
    }


async def _main_async() -> None:
    # Campsie Station -> Central Station (approximate station coordinates)
    origin = (-33.9116, 151.1032)
    destination = (-33.8836, 151.2057)

    print("Fetching commute data: Campsie Station -> Central Station\n")
    result = await fetch_commute_data(origin, destination)
    print(json.dumps(result, indent=2))
    if result.get("public_transport_options"):
        print("\nPublic transport options:")
        for option in result["public_transport_options"]:
            print(
                f"  #{option.get('option_rank')} {option.get('route_label')} — "
                f"{option.get('duration_min')} min, ${option.get('cost_aud')}"
            )

    if result["errors"]:
        print("\nCompleted with errors:")
        for err in result["errors"]:
            print(f"  - {err}")
    else:
        print("\nSuccess — both public transport and driving data retrieved.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    _load_dotenv()
    asyncio.run(_main_async())
