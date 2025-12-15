"""Endpoints utilitários de localização (UF/Cidades) para o app mobile."""

from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import CityLocation

router = APIRouter()


class UfOut(BaseModel):
    uf: str


class CityOut(BaseModel):
    city: str


@router.get("/locations/ufs", response_model=List[UfOut])
def list_ufs(db: Session = Depends(get_db)):
    rows = (
        db.query(CityLocation.uf)
        .filter(CityLocation.uf.isnot(None))
        .group_by(CityLocation.uf)
        .order_by(CityLocation.uf.asc())
        .all()
    )
    return [UfOut(uf=r[0]) for r in rows]


@router.get("/locations/cities", response_model=List[CityOut])
def list_cities(uf: str, search: Optional[str] = None, limit: int = 50, db: Session = Depends(get_db)):
    nuf = (uf or "").strip().upper()
    q = db.query(CityLocation.city).filter(CityLocation.uf == nuf)

    if search:
        like = f"%{search.strip()}%"
        q = q.filter(CityLocation.city.ilike(like))

    q = q.group_by(CityLocation.city).order_by(func.min(CityLocation.city).asc()).limit(limit)
    rows = q.all()
    return [CityOut(city=r[0]) for r in rows]
