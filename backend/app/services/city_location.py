from __future__ import annotations

import math
import unicodedata
from dataclasses import dataclass
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from ..models import CityLocation, Store


@dataclass(frozen=True)
class LatLng:
    lat: float
    lng: float


def _normalize_city(city: str) -> str:
    return (city or "").strip()


def _normalize_city_key(city: str) -> str:
    c = _normalize_city(city)
    c = unicodedata.normalize("NFKD", c)
    c = "".join(ch for ch in c if not unicodedata.combining(ch))
    return c.casefold()


def _normalize_uf(uf: str) -> str:
    return (uf or "").strip().upper()


def haversine_km(a: LatLng, b: LatLng) -> float:
    """Distância em KM entre dois pontos lat/lng."""
    r = 6371.0
    lat1 = math.radians(a.lat)
    lat2 = math.radians(b.lat)
    dlat = lat2 - lat1
    dlng = math.radians(b.lng - a.lng)

    sin_dlat = math.sin(dlat / 2.0)
    sin_dlng = math.sin(dlng / 2.0)
    h = sin_dlat * sin_dlat + math.cos(lat1) * math.cos(lat2) * sin_dlng * sin_dlng
    return 2.0 * r * math.asin(math.sqrt(h))


def resolve_city_centroid(db: Session, uf: str | None, city: str | None) -> Optional[LatLng]:
    """Resolve centroide de uma cidade.

    Estratégia:
    1) Tabela city_locations (fonte canônica)
    2) Fallback: média das coordenadas das lojas daquela cidade (quando existir)

    Retorna None se não houver dados.
    """
    nuf = _normalize_uf(uf or "")
    ncity = _normalize_city(city or "")
    if not nuf or not ncity:
        return None

    row = db.query(CityLocation).filter(CityLocation.uf == nuf, CityLocation.city == ncity).first()
    if row:
        return LatLng(lat=row.latitude, lng=row.longitude)

    # Fallback: comparação tolerante (acentos/caixa)
    wanted = _normalize_city_key(ncity)
    candidates = db.query(CityLocation).filter(CityLocation.uf == nuf).all()
    for cand in candidates:
        if _normalize_city_key(cand.city) == wanted:
            return LatLng(lat=cand.latitude, lng=cand.longitude)

    # Fallback: média de lat/lng de lojas na mesma cidade/UF
    stores = (
        db.query(Store.lat, Store.lng)
        .filter(Store.uf == nuf, Store.cidade == ncity)
        .filter(Store.lat.isnot(None), Store.lng.isnot(None))
        .all()
    )
    if not stores:
        # tenta achar lojas por cidade com comparação tolerante
        all_stores = (
            db.query(Store.cidade, Store.lat, Store.lng)
            .filter(Store.uf == nuf)
            .filter(Store.cidade.isnot(None), Store.lat.isnot(None), Store.lng.isnot(None))
            .all()
        )
        tolerant = [s for s in all_stores if _normalize_city_key(s[0]) == wanted]
        if not tolerant:
            return None
        lat_avg = sum(s[1] for s in tolerant) / len(tolerant)
        lng_avg = sum(s[2] for s in tolerant) / len(tolerant)
        return LatLng(lat=lat_avg, lng=lng_avg)

    lat_avg = sum(s[0] for s in stores) / len(stores)
    lng_avg = sum(s[1] for s in stores) / len(stores)
    return LatLng(lat=lat_avg, lng=lng_avg)


def upsert_city_centroid(db: Session, uf: str, city: str, lat: float, lng: float) -> CityLocation:
    nuf = _normalize_uf(uf)
    ncity = _normalize_city(city)
    existing = db.query(CityLocation).filter(CityLocation.uf == nuf, CityLocation.city == ncity).first()
    if existing:
        existing.latitude = lat
        existing.longitude = lng
        db.commit()
        db.refresh(existing)
        return existing

    row = CityLocation(uf=nuf, city=ncity, latitude=lat, longitude=lng)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
