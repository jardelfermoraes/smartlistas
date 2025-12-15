"""Router para registrar compras concluídas do AppUser (snapshot + QR do cupom)."""

import logging
from datetime import UTC, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import AppPurchase, AppPurchaseItem, AppReceiptKeySubmission, AppUser
from ..schemas import extract_chave_from_text
from .app_auth import get_current_app_user

logger = logging.getLogger(__name__)
router = APIRouter()


class PurchaseItemIn(BaseModel):
    canonical_id: Optional[int] = None
    product_name_snapshot: Optional[str] = Field(default=None, max_length=255)
    quantity: float = Field(default=1.0, gt=0)
    unit: str = Field(default="un", max_length=20)
    is_checked: bool = False


class PurchaseCreateIn(BaseModel):
    local_list_id: Optional[str] = Field(default=None, max_length=100)
    list_name: Optional[str] = Field(default=None, max_length=120)
    status_final: str = Field(default="completed", max_length=20)
    finished_at: Optional[datetime] = None

    receipt_qr_raw: Optional[str] = None

    items: List[PurchaseItemIn] = Field(default_factory=list)


class PurchaseCreateOut(BaseModel):
    id: int
    receipt_chave_acesso: Optional[str] = None

    class Config:
        from_attributes = True


class PurchaseItemOut(BaseModel):
    id: int
    canonical_id: Optional[int] = None
    product_name_snapshot: Optional[str] = None
    quantity: float
    unit: str
    is_checked: bool

    class Config:
        from_attributes = True


class PurchaseOut(BaseModel):
    id: int
    local_list_id: Optional[str] = None
    list_name: Optional[str] = None
    status_final: str
    finished_at: datetime
    receipt_chave_acesso: Optional[str] = None
    items: List[PurchaseItemOut]

    class Config:
        from_attributes = True


@router.get("/purchases", response_model=List[PurchaseOut])
def list_purchases(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 1
    if page_size > 50:
        page_size = 50

    q = (
        db.query(AppPurchase)
        .filter(AppPurchase.user_id == current_user.id)
        .options(joinedload(AppPurchase.items))
        .order_by(AppPurchase.finished_at.desc())
    )

    purchases = q.offset((page - 1) * page_size).limit(page_size).all()
    return purchases


@router.post("/purchases", response_model=PurchaseCreateOut, status_code=status.HTTP_201_CREATED)
def create_purchase(
    data: PurchaseCreateIn,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    if not data.items:
        raise HTTPException(status_code=400, detail="Informe ao menos 1 item")

    chave = extract_chave_from_text(data.receipt_qr_raw) if data.receipt_qr_raw else None

    purchase = AppPurchase(
        user_id=current_user.id,
        local_list_id=data.local_list_id,
        list_name=data.list_name,
        status_final=data.status_final,
        finished_at=data.finished_at or datetime.now(UTC),
        receipt_qr_raw=data.receipt_qr_raw,
        receipt_chave_acesso=chave,
    )

    db.add(purchase)
    db.flush()

    if chave:
        existing = db.query(AppReceiptKeySubmission).filter(AppReceiptKeySubmission.chave_acesso == chave).first()
        if existing:
            if existing.purchase_id is None:
                existing.purchase_id = purchase.id
            if existing.user_id != current_user.id:
                existing.user_id = current_user.id
            if not existing.raw_text:
                existing.raw_text = data.receipt_qr_raw
        else:
            db.add(
                AppReceiptKeySubmission(
                    user_id=current_user.id,
                    purchase_id=purchase.id,
                    chave_acesso=chave,
                    raw_text=data.receipt_qr_raw,
                    source="qr",
                    status="pending",
                )
            )

    for it in data.items:
        db.add(
            AppPurchaseItem(
                purchase_id=purchase.id,
                canonical_id=it.canonical_id,
                product_name_snapshot=it.product_name_snapshot,
                quantity=it.quantity,
                unit=it.unit,
                is_checked=it.is_checked,
            )
        )

    db.commit()
    db.refresh(purchase)

    return PurchaseCreateOut(id=purchase.id, receipt_chave_acesso=purchase.receipt_chave_acesso)
