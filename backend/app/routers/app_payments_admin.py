from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AppPayment, AppUser, User
from .auth import get_current_user
from .app_payments import _sync_mp_payment

router = APIRouter()


class AppPaymentOut(BaseModel):
    id: int
    user_id: int
    user_email: str | None = None
    user_name: str | None = None

    provider: str
    provider_payment_id: str | None
    status: str

    amount_cents: int
    credits_applied_cents: int
    currency: str
    description: str | None

    period_start: datetime | None
    period_end: datetime | None
    approved_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaymentsListOut(BaseModel):
    items: List[AppPaymentOut]
    total: int


class PaymentsKpisOut(BaseModel):
    total_count: int
    total_amount_cents: int
    total_credits_applied_cents: int
    approved_count: int
    approved_amount_cents: int
    pending_count: int
    pending_amount_cents: int


@router.get("/admin/payments", response_model=PaymentsListOut)
def list_app_payments_admin(
    status: Optional[str] = None,
    provider: Optional[str] = None,
    user_id: Optional[int] = None,
    search: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 1
    if limit > 200:
        limit = 200

    q = db.query(AppPayment, AppUser.email, AppUser.name).join(AppUser, AppUser.id == AppPayment.user_id)

    if status:
        q = q.filter(AppPayment.status == status)
    if provider:
        q = q.filter(AppPayment.provider == provider)
    if user_id:
        q = q.filter(AppPayment.user_id == user_id)
    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            (AppUser.email.ilike(s))
            | (AppUser.name.ilike(s))
            | (AppPayment.provider_payment_id.ilike(s))
        )

    if start_date:
        q = q.filter(AppPayment.created_at >= start_date)
    if end_date:
        q = q.filter(AppPayment.created_at <= end_date)

    total = q.with_entities(func.count(AppPayment.id)).scalar() or 0

    rows = (
        q.order_by(desc(AppPayment.created_at))
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    items: List[AppPaymentOut] = []
    for p, email, name in rows:
        items.append(
            AppPaymentOut(
                id=p.id,
                user_id=p.user_id,
                user_email=email,
                user_name=name,
                provider=p.provider,
                provider_payment_id=p.provider_payment_id,
                status=p.status,
                amount_cents=p.amount_cents,
                credits_applied_cents=p.credits_applied_cents,
                currency=p.currency,
                description=p.description,
                period_start=p.period_start,
                period_end=p.period_end,
                approved_at=p.approved_at,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
        )

    return PaymentsListOut(items=items, total=int(total))


@router.get("/admin/payments/kpis", response_model=PaymentsKpisOut)
def get_app_payments_kpis_admin(
    status: Optional[str] = None,
    provider: Optional[str] = None,
    user_id: Optional[int] = None,
    search: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(AppPayment).join(AppUser, AppUser.id == AppPayment.user_id)

    if status:
        q = q.filter(AppPayment.status == status)
    if provider:
        q = q.filter(AppPayment.provider == provider)
    if user_id:
        q = q.filter(AppPayment.user_id == user_id)
    if search:
        s = f"%{search.strip()}%"
        q = q.filter(
            (AppUser.email.ilike(s))
            | (AppUser.name.ilike(s))
            | (AppPayment.provider_payment_id.ilike(s))
        )
    if start_date:
        q = q.filter(AppPayment.created_at >= start_date)
    if end_date:
        q = q.filter(AppPayment.created_at <= end_date)

    total_count = q.with_entities(func.count(AppPayment.id)).scalar() or 0
    total_amount_cents = q.with_entities(func.coalesce(func.sum(AppPayment.amount_cents), 0)).scalar() or 0
    total_credits_applied_cents = (
        q.with_entities(func.coalesce(func.sum(AppPayment.credits_applied_cents), 0)).scalar() or 0
    )

    approved_count = q.filter(AppPayment.status == "approved").with_entities(func.count(AppPayment.id)).scalar() or 0
    approved_amount_cents = (
        q.filter(AppPayment.status == "approved")
        .with_entities(func.coalesce(func.sum(AppPayment.amount_cents), 0))
        .scalar()
        or 0
    )

    pending_count = q.filter(AppPayment.status == "pending").with_entities(func.count(AppPayment.id)).scalar() or 0
    pending_amount_cents = (
        q.filter(AppPayment.status == "pending")
        .with_entities(func.coalesce(func.sum(AppPayment.amount_cents), 0))
        .scalar()
        or 0
    )

    return PaymentsKpisOut(
        total_count=int(total_count),
        total_amount_cents=int(total_amount_cents),
        total_credits_applied_cents=int(total_credits_applied_cents),
        approved_count=int(approved_count),
        approved_amount_cents=int(approved_amount_cents),
        pending_count=int(pending_count),
        pending_amount_cents=int(pending_amount_cents),
    )


@router.get("/admin/payments/{payment_id}", response_model=AppPaymentOut)
def get_app_payment_admin(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        db.query(AppPayment, AppUser.email, AppUser.name)
        .join(AppUser, AppUser.id == AppPayment.user_id)
        .filter(AppPayment.id == payment_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")

    p, email, name = row
    return AppPaymentOut(
        id=p.id,
        user_id=p.user_id,
        user_email=email,
        user_name=name,
        provider=p.provider,
        provider_payment_id=p.provider_payment_id,
        status=p.status,
        amount_cents=p.amount_cents,
        credits_applied_cents=p.credits_applied_cents,
        currency=p.currency,
        description=p.description,
        period_start=p.period_start,
        period_end=p.period_end,
        approved_at=p.approved_at,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


class SyncResultOut(BaseModel):
    ok: bool
    mp_status: str | None = None
    renewed: bool | None = None
    subscription_ends_at: datetime | None = None


@router.post("/admin/payments/{payment_id}/sync", response_model=SyncResultOut)
async def sync_app_payment_admin(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payment = db.get(AppPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")

    if payment.provider != "mercadopago" or not payment.provider_payment_id:
        raise HTTPException(status_code=400, detail="Sync disponível apenas para Mercado Pago")

    result = await _sync_mp_payment(db, payment.provider_payment_id)

    return SyncResultOut(
        ok=True,
        mp_status=result.mp_status,
        renewed=result.renewed,
        subscription_ends_at=result.subscription_ends_at,
    )
