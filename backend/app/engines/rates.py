"""Demo operating rates used by the AI engines — port of `src/lib/ai/rates.ts`.

These are intentionally explicit demo rates (configurable in a future config
version). Anything that already exists in the org thresholds (e.g.
diesel_kg_co2_per_litre) must be read from the org config instead.
"""
DIESEL_PRICE_INR_PER_LITRE = 95
TOLL_INR_PER_KM = 1.9
DRIVER_WEAR_INR_PER_KM = 22
BILLING_INR_PER_KM = 118
BASELINE_FUEL_EFF_KMPL = 3.6
FUEL_EFF_LIGHT_KMPL = 3.8
FUEL_EFF_HEAVY_KMPL = 3.2
RETURN_PAY_INR_PER_KM = 140
RETURN_COST_INR_PER_KM = 95
RETURN_DETOUR_INR_PER_KM = 85
CONSOL_HANDLING_RATE = 0.35
AVG_FREE_FLOW_SPEED_KMPH = 62
RETURN_SEARCH_RADIUS_KM = 300
DEFAULT_CONGESTION = 0.35
DEFAULT_WEATHER_RISK = 0.3
DEFAULT_TOLL_DENSITY = 0.5
