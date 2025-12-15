from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AppBillingSettings, AppCreditLedger, AppUser
from .app_auth import get_current_app_user

router = APIRouter()


def _get_or_create_settings(db: Session) -> AppBillingSettings:
    settings = db.query(AppBillingSettings).order_by(AppBillingSettings.id.asc()).first()
    if settings:
        return settings
    settings = AppBillingSettings(
        trial_days=30,
        monthly_price_cents=1500,
        referral_credit_cents=200,
        receipt_credit_cents=100,
        referral_credit_limit_per_month=5,
        receipt_credit_limit_per_month=5,
        is_active=True,
    )
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def _month_start(now: datetime) -> datetime:
    return datetime(now.year, now.month, 1, tzinfo=UTC)


class BillingStatusOut(BaseModel):
    trial_ends_at: datetime | None
    subscription_ends_at: datetime | None
    monthly_price_cents: int
    credit_balance_cents: int
    amount_due_cents: int
    referral_code: str | None

    referral_credit_cents: int
    receipt_credit_cents: int
    referral_credit_limit_per_month: int
    receipt_credit_limit_per_month: int

    referral_credits_used_this_month: int
    receipt_credits_used_this_month: int


@router.get("/billing/status", response_model=BillingStatusOut)
def billing_status(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    s = _get_or_create_settings(db)

    balance = (
        db.query(func.coalesce(func.sum(AppCreditLedger.amount_cents), 0))
        .filter(AppCreditLedger.user_id == current_user.id)
        .scalar()
    )
    balance = int(balance or 0)

    amount_due = max(int(s.monthly_price_cents) - balance, 0)

    now = datetime.now(UTC)
    start = _month_start(now)

    referral_used = (
        db.query(func.count(AppCreditLedger.id))
        .filter(
            AppCreditLedger.user_id == current_user.id,
            AppCreditLedger.entry_type == "referral",
            AppCreditLedger.created_at >= start,
        )
        .scalar()
    )
    receipt_used = (
        db.query(func.count(AppCreditLedger.id))
        .filter(
            AppCreditLedger.user_id == current_user.id,
            AppCreditLedger.entry_type == "receipt",
            AppCreditLedger.created_at >= start,
        )
        .scalar()
    )

    return BillingStatusOut(
        trial_ends_at=current_user.trial_ends_at,
        subscription_ends_at=current_user.subscription_ends_at,
        monthly_price_cents=int(s.monthly_price_cents),
        credit_balance_cents=balance,
        amount_due_cents=amount_due,
        referral_code=current_user.referral_code,
        referral_credit_cents=int(s.referral_credit_cents),
        receipt_credit_cents=int(s.receipt_credit_cents),
        referral_credit_limit_per_month=int(s.referral_credit_limit_per_month),
        receipt_credit_limit_per_month=int(s.receipt_credit_limit_per_month),
        referral_credits_used_this_month=int(referral_used or 0),
        receipt_credits_used_this_month=int(receipt_used or 0),
    )
