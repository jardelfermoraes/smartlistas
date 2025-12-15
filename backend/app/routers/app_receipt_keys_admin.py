"""Router admin (painel) para visualizar e gerenciar chaves de cupom recebidas do app.

Protegido por autenticação do usuário do painel (User).
"""

import logging
from datetime import UTC, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AppBillingSettings, AppCreditLedger, AppReceiptKeySubmission, User
from .auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


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


def _month_start(now: datetime) -> datetime:
    return datetime(now.year, now.month, 1, tzinfo=UTC)


class ReceiptKeyAdminOut(BaseModel):
    id: int
    user_id: int
    purchase_id: Optional[int] = None
    chave_acesso: str
    raw_text: Optional[str] = None
    source: str
    status: str
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewed_by_user_id: Optional[int] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class ReceiptKeyAdminUpdateIn(BaseModel):
    status: str = Field(..., max_length=20)
    notes: Optional[str] = Field(default=None, max_length=255)


@router.get("/admin/receipt-keys", response_model=List[ReceiptKeyAdminOut])
def list_receipt_keys_admin(
    page: int = 1,
    limit: int = 50,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 1
    if limit > 200:
        limit = 200

    q = db.query(AppReceiptKeySubmission)

    if status:
        q = q.filter(AppReceiptKeySubmission.status == status)

    if search:
        term = f"%{search.strip()}%"
        q = q.filter(AppReceiptKeySubmission.chave_acesso.ilike(term))

    q = q.order_by(AppReceiptKeySubmission.created_at.desc())
    return q.offset((page - 1) * limit).limit(limit).all()


@router.put("/admin/receipt-keys/{submission_id}", response_model=ReceiptKeyAdminOut)
def update_receipt_key_admin(
    submission_id: int,
    data: ReceiptKeyAdminUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(AppReceiptKeySubmission, submission_id)
    if not row:
        raise HTTPException(status_code=404, detail="Registro não encontrado")

    prev_status = row.status
    row.status = (data.status or "pending")[:20]
    row.notes = (data.notes or None)
    row.reviewed_at = datetime.now(UTC)
    row.reviewed_by_user_id = current_user.id

    # Credita cupom quando o operador marca como processed
    if row.status == "processed" and row.credited_at is None:
        s = _get_or_create_settings(db)
        now = datetime.now(UTC)
        start = _month_start(now)
        used = (
            db.query(AppCreditLedger)
            .filter(
                AppCreditLedger.user_id == row.user_id,
                AppCreditLedger.entry_type == "receipt",
                AppCreditLedger.created_at >= start,
            )
            .count()
        )
        if used < int(s.receipt_credit_limit_per_month):
            db.add(
                AppCreditLedger(
                    user_id=row.user_id,
                    entry_type="receipt",
                    amount_cents=int(s.receipt_credit_cents),
                    source_id=row.id,
                    notes=f"Cupom validado (submission {row.id})",
                    created_at=now,
                )
            )
        row.credited_at = now

    db.commit()
    db.refresh(row)
    return row
