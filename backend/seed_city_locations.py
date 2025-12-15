from __future__ import annotations

import json
import sys
from typing import Any

import httpx
from datetime import UTC, datetime
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import CityLocation

MUNICIPIOS_URL = "https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/json/municipios.json"
ESTADOS_URL = "https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/json/estados.json"


def _load_json_from_url(url: str) -> Any:
    with httpx.Client(timeout=120.0) as client:
        resp = client.get(url)
        resp.raise_for_status()
        # alguns arquivos vêm com BOM
        text = resp.text.lstrip("\ufeff")
        return json.loads(text)


def _build_uf_map(estados: list[dict[str, Any]]) -> dict[int, str]:
    out: dict[int, str] = {}
    for e in estados:
        codigo_uf = int(e["codigo_uf"])
        uf = str(e["uf"]).strip().upper()
        out[codigo_uf] = uf
    return out


def seed_city_locations(db: Session, batch_size: int = 1000) -> int:
    estados = _load_json_from_url(ESTADOS_URL)
    municipios = _load_json_from_url(MUNICIPIOS_URL)

    uf_map = _build_uf_map(estados)

    total = 0
    batch: list[dict[str, Any]] = []

    now = datetime.now(UTC)

    for m in municipios:
        codigo_uf = int(m["codigo_uf"])
        uf = uf_map.get(codigo_uf)
        if not uf:
            continue

        city = str(m["nome"]).strip()
        lat = float(m["latitude"])
        lng = float(m["longitude"])

        batch.append(
            {
                "uf": uf,
                "city": city,
                "latitude": lat,
                "longitude": lng,
                "created_at": now,
                "updated_at": now,
            }
        )

        if len(batch) >= batch_size:
            _upsert_batch(db, batch)
            total += len(batch)
            batch = []

    if batch:
        _upsert_batch(db, batch)
        total += len(batch)

    db.commit()
    return total


def _upsert_batch(db: Session, rows: list[dict[str, Any]]) -> None:
    stmt = insert(CityLocation).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_city_locations_uf_city",
        set_={
            "latitude": stmt.excluded.latitude,
            "longitude": stmt.excluded.longitude,
            "updated_at": stmt.excluded.updated_at,
        },
    )
    db.execute(stmt)


def main() -> None:
    batch_size = 1000
    if len(sys.argv) >= 2:
        batch_size = int(sys.argv[1])

    db = SessionLocal()
    try:
        count = seed_city_locations(db, batch_size=batch_size)
        print(f"OK: upserted {count} city locations")
    finally:
        db.close()


if __name__ == "__main__":
    main()
