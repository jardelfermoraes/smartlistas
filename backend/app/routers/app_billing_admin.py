from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AppBillingSettings, User
from .auth import get_current_user

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


class BillingSettingsOut(BaseModel):
    trial_days: int
    monthly_price_cents: int
    referral_credit_cents: int
    receipt_credit_cents: int
    referral_credit_limit_per_month: int
    receipt_credit_limit_per_month: int
    is_active: bool

    class Config:
        from_attributes = True


class BillingSettingsUpdateIn(BaseModel):
    trial_days: int = Field(ge=0, le=365)
    monthly_price_cents: int = Field(ge=0, le=10_000_00)
    referral_credit_cents: int = Field(ge=0, le=10_000_00)
    receipt_credit_cents: int = Field(ge=0, le=10_000_00)
    referral_credit_limit_per_month: int = Field(ge=0, le=1000)
    receipt_credit_limit_per_month: int = Field(ge=0, le=1000)
    is_active: bool = True


@router.get("/admin/billing/settings", response_model=BillingSettingsOut)
def get_billing_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = _get_or_create_settings(db)
    return settings


@router.put("/admin/billing/settings", response_model=BillingSettingsOut)
def update_billing_settings(
    data: BillingSettingsUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = _get_or_create_settings(db)
    settings.trial_days = int(data.trial_days)
    settings.monthly_price_cents = int(data.monthly_price_cents)
    settings.referral_credit_cents = int(data.referral_credit_cents)
    settings.receipt_credit_cents = int(data.receipt_credit_cents)
    settings.referral_credit_limit_per_month = int(data.referral_credit_limit_per_month)
    settings.receipt_credit_limit_per_month = int(data.receipt_credit_limit_per_month)
    settings.is_active = bool(data.is_active)

    db.commit()
    db.refresh(settings)
    return settings
