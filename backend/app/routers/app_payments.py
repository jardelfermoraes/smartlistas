from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import Settings, settings
from ..database import get_db
from ..models import AppBillingSettings, AppCreditLedger, AppPayment, AppUser
from .app_auth import get_current_app_user

router = APIRouter()


def _mp_settings() -> Settings:
    s = settings
    if s.mp_access_token:
        return s
    return Settings()


def _get_or_create_settings(db: Session) -> AppBillingSettings:
    s = db.query(AppBillingSettings).order_by(AppBillingSettings.id.asc()).first()
    if s:
        return s
    s = AppBillingSettings(
        trial_days=30,
        monthly_price_cents=1500,
        referral_credit_cents=200,
        receipt_credit_cents=100,
        referral_credit_limit_per_month=5,
        receipt_credit_limit_per_month=5,
        is_active=True,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def _credit_balance_cents(db: Session, user_id: int) -> int:
    balance = (
        db.query(func.coalesce(func.sum(AppCreditLedger.amount_cents), 0))
        .filter(AppCreditLedger.user_id == user_id)
        .scalar()
    )
    return int(balance or 0)


def _extend_subscription(user: AppUser, now: datetime, days: int) -> tuple[datetime, datetime]:
    base = user.subscription_ends_at
    if base is None or base < now:
        base = now
    start = base
    end = base + timedelta(days=days)
    return start, end


class CreatePixCheckoutOut(BaseModel):
    provider: str
    payment_id: str | None
    status: str
    amount_cents: int
    credits_applied_cents: int
    amount_due_cents: int
    pix_qr_code: str | None = None
    pix_qr_code_base64: str | None = None
    pix_ticket_url: str | None = None


class CreatePixCheckoutIn(BaseModel):
    description: str = Field(default="Assinatura SmartListas")


@router.post("/billing/checkout/pix", response_model=CreatePixCheckoutOut)
async def create_pix_checkout(
    data: CreatePixCheckoutIn,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    mp_settings = _mp_settings()
    if not mp_settings.mp_access_token:
        raise HTTPException(status_code=500, detail="Mercado Pago não configurado")

    s = _get_or_create_settings(db)
    monthly_price_cents = int(s.monthly_price_cents)

    balance = _credit_balance_cents(db, current_user.id)
    credits_applied = min(balance, monthly_price_cents)
    amount_due_cents = max(monthly_price_cents - credits_applied, 0)

    if amount_due_cents <= 0:
        # Sem cobrança externa: apenas renova e debita os créditos
        now = datetime.now(UTC)
        period_start, period_end = _extend_subscription(current_user, now, 30)

        payment = AppPayment(
            user_id=current_user.id,
            provider="internal",
            provider_payment_id=None,
            status="approved",
            amount_cents=0,
            credits_applied_cents=credits_applied,
            currency="BRL",
            description=data.description,
            approved_at=now,
            period_start=period_start,
            period_end=period_end,
            raw_payload=json.dumps({"reason": "amount_due_zero"}),
        )
        db.add(payment)

        if credits_applied > 0:
            db.add(
                AppCreditLedger(
                    user_id=current_user.id,
                    entry_type="debit",
                    amount_cents=-int(credits_applied),
                    source_id=None,
                    notes=f"Débito de créditos aplicado à assinatura (payment internal)",
                    created_at=now,
                )
            )

        current_user.subscription_ends_at = period_end
        db.commit()

        return CreatePixCheckoutOut(
            provider="internal",
            payment_id=None,
            status="approved",
            amount_cents=0,
            credits_applied_cents=credits_applied,
            amount_due_cents=0,
        )

    transaction_amount = round(amount_due_cents / 100.0, 2)

    idem_key = str(uuid4())

    payload = {
        "transaction_amount": transaction_amount,
        "description": data.description,
        "payment_method_id": "pix",
        "payer": {"email": current_user.email},
        "external_reference": f"app_user:{current_user.id}",
        "notification_url": None,
    }

    headers = {
        "Authorization": f"Bearer {mp_settings.mp_access_token}",
        "Content-Type": "application/json",
        "X-Idempotency-Key": idem_key,
    }

    async with httpx.AsyncClient(base_url=mp_settings.mp_base_url, timeout=10.0) as client:
        resp = await client.post("/v1/payments", headers=headers, json=payload)

    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Erro Mercado Pago: {resp.text}")

    mp = resp.json()
    mp_id = str(mp.get("id")) if mp.get("id") is not None else None
    status = str(mp.get("status") or "pending")

    now = datetime.now(UTC)
    payment = AppPayment(
        user_id=current_user.id,
        provider="mercadopago",
        provider_payment_id=mp_id,
        status=status,
        amount_cents=int(amount_due_cents),
        credits_applied_cents=int(credits_applied),
        currency="BRL",
        description=data.description,
        raw_payload=json.dumps({"idempotency_key": idem_key, "mp": mp}),
        created_at=now,
    )
    db.add(payment)
    db.commit()

    poi = (mp.get("point_of_interaction") or {}).get("transaction_data") or {}

    return CreatePixCheckoutOut(
        provider="mercadopago",
        payment_id=mp_id,
        status=status,
        amount_cents=int(amount_due_cents),
        credits_applied_cents=int(credits_applied),
        amount_due_cents=int(amount_due_cents),
        pix_qr_code=poi.get("qr_code"),
        pix_qr_code_base64=poi.get("qr_code_base64"),
        pix_ticket_url=poi.get("ticket_url"),
    )


async def _fetch_mp_payment(payment_id: str) -> dict:
    mp_settings = _mp_settings()
    headers = {"Authorization": f"Bearer {mp_settings.mp_access_token}"}
    async with httpx.AsyncClient(base_url=mp_settings.mp_base_url, timeout=10.0) as client:
        resp = await client.get(f"/v1/payments/{payment_id}", headers=headers)
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Erro Mercado Pago: {resp.text}")
    return resp.json()


class WebhookAck(BaseModel):
    ok: bool = True


class SyncOut(BaseModel):
    ok: bool = True
    payment_id: str
    mp_status: str
    renewed: bool
    subscription_ends_at: datetime | None = None


async def _sync_mp_payment(db: Session, payment_id: str) -> SyncOut:
    mp = await _fetch_mp_payment(payment_id)
    status = str(mp.get("status") or "unknown")

    payment = (
        db.query(AppPayment)
        .filter(AppPayment.provider == "mercadopago", AppPayment.provider_payment_id == payment_id)
        .order_by(AppPayment.id.desc())
        .first()
    )

    if not payment:
        ext = str(mp.get("external_reference") or "")
        user_id = None
        if ext.startswith("app_user:"):
            try:
                user_id = int(ext.split(":", 1)[1])
            except Exception:
                user_id = None
        if not user_id:
            return SyncOut(ok=True, payment_id=payment_id, mp_status=status, renewed=False, subscription_ends_at=None)

        payment = AppPayment(
            user_id=user_id,
            provider="mercadopago",
            provider_payment_id=payment_id,
            status=status,
            amount_cents=int(round(float(mp.get("transaction_amount") or 0) * 100)),
            credits_applied_cents=0,
            currency=str(mp.get("currency_id") or "BRL"),
            description=str(mp.get("description") or ""),
            raw_payload=json.dumps(mp),
            created_at=datetime.now(UTC),
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)

    renewed = False
    payment.status = status
    payment.raw_payload = json.dumps(mp)
    db.commit()

    if status == "approved" and payment.approved_at is None:
        now = datetime.now(UTC)
        user = db.get(AppUser, payment.user_id)
        if user:
            period_start, period_end = _extend_subscription(user, now, 30)
            user.subscription_ends_at = period_end

            credits_applied = int(payment.credits_applied_cents or 0)
            if credits_applied > 0:
                db.add(
                    AppCreditLedger(
                        user_id=user.id,
                        entry_type="debit",
                        amount_cents=-credits_applied,
                        source_id=payment.id,
                        notes=f"Débito de créditos aplicado à assinatura (MP {payment_id})",
                        created_at=now,
                    )
                )

            payment.approved_at = now
            payment.period_start = period_start
            payment.period_end = period_end
            db.commit()
            renewed = True

    user = db.get(AppUser, payment.user_id)
    return SyncOut(
        ok=True,
        payment_id=payment_id,
        mp_status=status,
        renewed=renewed,
        subscription_ends_at=user.subscription_ends_at if user else None,
    )


@router.post("/payments/webhook/mercadopago", response_model=WebhookAck)
async def mercadopago_webhook(request: Request, db: Session = Depends(get_db)):
    mp_settings = _mp_settings()
    if not mp_settings.mp_access_token:
        raise HTTPException(status_code=500, detail="Mercado Pago não configurado")

    body = await request.json()

    payment_id = None
    data = body.get("data") if isinstance(body, dict) else None
    if isinstance(data, dict) and data.get("id") is not None:
        payment_id = str(data.get("id"))
    elif isinstance(body, dict) and body.get("id") is not None:
        payment_id = str(body.get("id"))

    if not payment_id:
        # Mercado Pago também envia notificações sem id; nesse caso só ACK
        return WebhookAck(ok=True)

    await _sync_mp_payment(db, payment_id)
    return WebhookAck(ok=True)


@router.post("/payments/sync/mercadopago/{payment_id}", response_model=SyncOut)
async def mercadopago_sync(payment_id: str, db: Session = Depends(get_db)):
    mp_settings = _mp_settings()
    if not mp_settings.mp_access_token:
        raise HTTPException(status_code=500, detail="Mercado Pago não configurado")

    return await _sync_mp_payment(db, payment_id)
