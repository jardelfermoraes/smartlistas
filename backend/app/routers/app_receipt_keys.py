"""Router para envio de chaves de cupom (NFC-e) pelo AppUser.

Neste fluxo inicial, o app apenas envia a chave (44 dígitos) e o backend registra como
pendente para triagem/processamento manual no painel.
"""

import logging
from datetime import UTC, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AppReceiptKeySubmission, AppUser
from ..schemas import extract_chave_from_text
from .app_auth import get_current_app_user

logger = logging.getLogger(__name__)
router = APIRouter()


class ReceiptKeyCreateIn(BaseModel):
    raw_text: Optional[str] = None
    chave_acesso: Optional[str] = Field(default=None, description="Chave de acesso (44 dígitos)")
    source: str = Field(default="manual", max_length=20, description="qr|barcode|manual")


class ReceiptKeyOut(BaseModel):
    id: int
    chave_acesso: str
    source: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ReceiptKeyCreateOut(BaseModel):
    id: int
    status: str
    message: str


@router.get("/receipt-keys", response_model=List[ReceiptKeyOut])
def list_receipt_keys(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    q = (
        db.query(AppReceiptKeySubmission)
        .filter(AppReceiptKeySubmission.user_id == current_user.id)
        .order_by(AppReceiptKeySubmission.created_at.desc())
    )
    return q.limit(50).all()


@router.post("/receipt-keys", response_model=ReceiptKeyCreateOut, status_code=status.HTTP_201_CREATED)
def create_receipt_key(
    data: ReceiptKeyCreateIn,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    chave = None
    if data.chave_acesso:
        chave = extract_chave_from_text(data.chave_acesso)
    if not chave and data.raw_text:
        chave = extract_chave_from_text(data.raw_text)

    if not chave:
        raise HTTPException(status_code=400, detail="Não foi possível extrair chave de acesso (44 dígitos).")

    existing = db.query(AppReceiptKeySubmission).filter(AppReceiptKeySubmission.chave_acesso == chave).first()
    if existing:
        # Se já existir, apenas retorna (evita duplicidade global)
        return ReceiptKeyCreateOut(id=existing.id, status=existing.status, message="Chave já foi enviada anteriormente")

    row = AppReceiptKeySubmission(
        user_id=current_user.id,
        chave_acesso=chave,
        raw_text=(data.raw_text or data.chave_acesso),
        source=(data.source or "manual")[:20],
        status="pending",
        created_at=datetime.now(UTC),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    logger.info("AppUser %s enviou chave %s", current_user.id, chave)
    return ReceiptKeyCreateOut(id=row.id, status=row.status, message="Chave enviada com sucesso")
