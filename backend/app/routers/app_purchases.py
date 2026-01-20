"""Router para registrar compras concluídas do AppUser (snapshot + QR do cupom)."""

import logging
from datetime import UTC, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
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

    # Métricas/snapshot para analytics
    items_total: Optional[int] = Field(default=None, ge=0)
    items_checked: Optional[int] = Field(default=None, ge=0)
    has_optimization: Optional[bool] = None
    max_stores: Optional[int] = Field(default=None, ge=1, le=5)
    stores_count: Optional[int] = Field(default=None, ge=0)
    optimized_total: Optional[float] = Field(default=None, ge=0)
    baseline_total: Optional[float] = Field(default=None, ge=0)
    savings_amount: Optional[float] = Field(default=None, ge=0)
    savings_percent: Optional[float] = Field(default=None, ge=0)

    # Metadados do cliente (analytics/debug)
    client_platform: Optional[str] = Field(default=None, max_length=20)
    client_app_version: Optional[str] = Field(default=None, max_length=50)
    client_os_version: Optional[str] = Field(default=None, max_length=50)
    client_device_model: Optional[str] = Field(default=None, max_length=100)
    client_locale: Optional[str] = Field(default=None, max_length=30)
    client_time_zone: Optional[str] = Field(default=None, max_length=60)
    client_timezone_offset_min: Optional[int] = None

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
    response: Response,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    if not data.items:
        raise HTTPException(status_code=400, detail="Informe ao menos 1 item")

    normalized_status = data.status_final
    if normalized_status not in ("completed", "closed"):
        normalized_status = "completed"

    chave = extract_chave_from_text(data.receipt_qr_raw) if data.receipt_qr_raw else None

    # Idempotência: se já existe compra para (user_id, local_list_id), retorna a existente
    if data.local_list_id:
        existing = (
            db.query(AppPurchase)
            .filter(AppPurchase.user_id == current_user.id, AppPurchase.local_list_id == data.local_list_id)
            .first()
        )
        if existing:
            if existing.status_final != "closed" or normalized_status == "closed":
                existing.status_final = normalized_status
            existing.list_name = data.list_name or existing.list_name
            existing.finished_at = data.finished_at or existing.finished_at or datetime.now(UTC)
            if data.receipt_qr_raw and not existing.receipt_qr_raw:
                existing.receipt_qr_raw = data.receipt_qr_raw
            if chave:
                existing.receipt_chave_acesso = chave

            existing.items_total = data.items_total if data.items_total is not None else len(data.items)
            if data.items_checked is not None:
                existing.items_checked = data.items_checked
            if data.has_optimization is not None:
                existing.has_optimization = data.has_optimization
            if data.max_stores is not None:
                existing.max_stores = data.max_stores
            if data.stores_count is not None:
                existing.stores_count = data.stores_count
            if data.optimized_total is not None:
                existing.optimized_total = data.optimized_total
            if data.baseline_total is not None:
                existing.baseline_total = data.baseline_total
            if data.savings_amount is not None:
                existing.savings_amount = data.savings_amount
            if data.savings_percent is not None:
                existing.savings_percent = data.savings_percent

            if data.client_platform is not None:
                existing.client_platform = data.client_platform
            if data.client_app_version is not None:
                existing.client_app_version = data.client_app_version
            if data.client_os_version is not None:
                existing.client_os_version = data.client_os_version
            if data.client_device_model is not None:
                existing.client_device_model = data.client_device_model
            if data.client_locale is not None:
                existing.client_locale = data.client_locale
            if data.client_time_zone is not None:
                existing.client_time_zone = data.client_time_zone
            if data.client_timezone_offset_min is not None:
                existing.client_timezone_offset_min = data.client_timezone_offset_min

            db.query(AppPurchaseItem).filter(AppPurchaseItem.purchase_id == existing.id).delete(
                synchronize_session=False
            )
            for it in data.items:
                db.add(
                    AppPurchaseItem(
                        purchase_id=existing.id,
                        canonical_id=it.canonical_id,
                        product_name_snapshot=it.product_name_snapshot,
                        quantity=it.quantity,
                        unit=it.unit,
                        is_checked=it.is_checked,
                    )
                )

            if chave:
                receipt_existing = (
                    db.query(AppReceiptKeySubmission)
                    .filter(AppReceiptKeySubmission.chave_acesso == chave)
                    .first()
                )
                if receipt_existing:
                    if receipt_existing.purchase_id is None:
                        receipt_existing.purchase_id = existing.id
                    if receipt_existing.user_id != current_user.id:
                        receipt_existing.user_id = current_user.id
                    if not receipt_existing.raw_text:
                        receipt_existing.raw_text = data.receipt_qr_raw
                else:
                    db.add(
                        AppReceiptKeySubmission(
                            user_id=current_user.id,
                            purchase_id=existing.id,
                            chave_acesso=chave,
                            raw_text=data.receipt_qr_raw,
                            source="qr",
                            status="pending",
                        )
                    )

            db.commit()
            db.refresh(existing)

            response.status_code = status.HTTP_200_OK
            return PurchaseCreateOut(id=existing.id, receipt_chave_acesso=existing.receipt_chave_acesso)

    purchase = AppPurchase(
        user_id=current_user.id,
        local_list_id=data.local_list_id,
        list_name=data.list_name,
        status_final=normalized_status,
        finished_at=data.finished_at or datetime.now(UTC),
        receipt_qr_raw=data.receipt_qr_raw,
        receipt_chave_acesso=chave,
        items_total=data.items_total if data.items_total is not None else len(data.items),
        items_checked=data.items_checked,
        has_optimization=data.has_optimization,
        max_stores=data.max_stores,
        stores_count=data.stores_count,
        optimized_total=data.optimized_total,
        baseline_total=data.baseline_total,
        savings_amount=data.savings_amount,
        savings_percent=data.savings_percent,
        client_platform=data.client_platform,
        client_app_version=data.client_app_version,
        client_os_version=data.client_os_version,
        client_device_model=data.client_device_model,
        client_locale=data.client_locale,
        client_time_zone=data.client_time_zone,
        client_timezone_offset_min=data.client_timezone_offset_min,
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
