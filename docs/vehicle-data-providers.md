# KARMASS external vehicle catalogue

The vehicle upload form now defaults to the live provider-backed selector.

## Backend environment

Set these variables in the backend `.env` file (never in the frontend):

```env
VEHICLESDB_API_KEY=your_vehiclesdb_private_key
CARSXE_API_KEY=your_carsxe_api_key
VEHICLE_PROVIDER_TIMEOUT_MS=12000
```

The API keys are optional at application boot so the existing saved catalogue and manual fallback continue to work if a provider is temporarily unavailable.

## Provider responsibilities

- **CarsXE**: live make/model/year/variant dropdown options through `GET /v1/ymm-options`.
- **VehiclesDB**: supplementary global make/model catalogue. Its dataset includes vehicle categories beyond passenger cars; this integration currently requests `kind=car`.
- **KARMASS listing record**: stores the seller-confirmed make, model, year and optional variant as a listing snapshot. External provider identifiers are not treated as KARMASS database IDs.

Generation codes are not returned consistently by these dropdown endpoints. KARMASS intentionally leaves `generationName` empty rather than fabricating a generation. Generation enrichment can be added later from a provider endpoint that returns verified production-run data.

## KARMASS endpoints

All paths are under `/api/v1/vehicles`:

- `GET /external/providers` — reports which provider keys are configured (never returns key values).
- `GET /external/makes?provider=carsxe|vehiclesdb`
- `GET /external/models?provider=carsxe|vehiclesdb&make=Toyota`
- `GET /external/options?dimension=years&make=Toyota&model=Camry`
- `GET /external/options?dimension=variants&make=Toyota&model=Camry&year=2020`

External option responses are cached in the backend process for six hours to reduce latency and provider usage. Cache is in-memory; it resets when the backend restarts.

## Important coverage note

Neither provider should be represented as guaranteeing every vehicle ever sold or imported into Nigeria. Provider coverage must be tested against KARMASS's real inventory, especially Japanese domestic-market, Chinese-market, older imported and low-volume vehicles. The saved catalogue and manual fallback remain available for exceptions.
