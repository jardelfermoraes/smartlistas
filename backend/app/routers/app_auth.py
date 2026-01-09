"""
Router para autenticação de usuários do app mobile.
Endpoints separados dos usuários admin.
"""

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, UTC
from typing import List, Optional

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import AppBillingSettings, AppCreditLedger, AppUser, AppUserSession

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# JWT Config
JWT_SECRET = settings.secret_key
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # 1 hora para app
REFRESH_TOKEN_EXPIRE_DAYS = 90   # 90 dias para app


# =============================================================================
# SCHEMAS
# =============================================================================

class AppUserRegister(BaseModel):
    """Schema para registro de usuário do app."""
    name: str = Field(..., min_length=2)
    email: EmailStr
    password: str = Field(..., min_length=6)
    birth_date: Optional[datetime] = None
    gender: Optional[str] = Field(default=None, max_length=20)
    phone: Optional[str] = None
    state: Optional[str] = Field(None, max_length=2)
    city: Optional[str] = None
    shopping_radius_km: float = Field(default=10.0, ge=0, le=200)  # 1km a 50km
    referral_code: Optional[str] = Field(default=None, max_length=20)


class AppUserLogin(BaseModel):
    """Schema para login do app."""
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: str
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    device_os: Optional[str] = None
    push_token: Optional[str] = None


class AppUserOut(BaseModel):
    """Schema de saída para usuário do app."""
    id: int
    name: str
    email: str
    phone: Optional[str]
    birth_date: Optional[datetime]
    gender: Optional[str]
    state: Optional[str]
    city: Optional[str]
    shopping_radius_km: float
    avatar_url: Optional[str]
    is_verified: bool
    notification_enabled: bool
    referral_code: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AppUserAdminBillingOut(BaseModel):
    user_id: int
    trial_ends_at: Optional[datetime] = None
    subscription_ends_at: Optional[datetime] = None
    referral_code: Optional[str] = None
    referred_by_user_id: Optional[int] = None

    monthly_price_cents: int
    credit_balance_cents: int
    amount_due_cents: int

    referral_credit_cents: int
    receipt_credit_cents: int
    referral_credit_limit_per_month: int
    receipt_credit_limit_per_month: int

    class Config:
        from_attributes = True


class AppCreditLedgerOut(BaseModel):
    id: int
    user_id: int
    entry_type: str
    amount_cents: int
    source_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AppUserProfile(BaseModel):
    """Schema completo do perfil do usuário."""
    id: int
    name: str
    email: str
    phone: Optional[str]
    birth_date: Optional[datetime]
    gender: Optional[str]
    avatar_url: Optional[str]
    state: Optional[str]
    city: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    shopping_radius_km: float
    is_verified: bool
    is_active: bool
    notification_enabled: bool
    notification_deals: bool
    notification_price_drop: bool
    referral_code: Optional[str] = None
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class AppUserUpdate(BaseModel):
    """Schema para atualização de perfil."""
    name: Optional[str] = Field(None, min_length=2)
    phone: Optional[str] = None
    birth_date: Optional[datetime] = None
    gender: Optional[str] = Field(default=None, max_length=20)
    avatar_url: Optional[str] = None
    state: Optional[str] = Field(None, max_length=2)
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    shopping_radius_km: Optional[float] = Field(None, ge=0, le=200)
    notification_enabled: Optional[bool] = None
    notification_deals: Optional[bool] = None
    notification_price_drop: Optional[bool] = None


class AppPushTokenIn(BaseModel):
    expo_push_token: str = Field(..., min_length=10, max_length=500)
    provider: str = Field(default="expo", max_length=30)


class AppPushTokenOut(BaseModel):
    ok: bool


class TokenResponse(BaseModel):
    """Schema de resposta com tokens."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: AppUserOut


class RefreshRequest(BaseModel):
    """Schema para refresh de token."""
    refresh_token: str


class ReferralOpenIn(BaseModel):
    referral_code: str = Field(..., min_length=1, max_length=20)


# =============================================================================
# HELPERS
# =============================================================================

def hash_password(password: str) -> str:
    """Gera hash bcrypt da senha."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    """Verifica senha contra hash."""
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_access_token(user_id: int) -> str:
    """Cria JWT de acesso."""
    expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "type": "app_access",
        "exp": expire,
        "iat": datetime.now(UTC),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token() -> str:
    """Cria token de refresh."""
    return secrets.token_urlsafe(64)


def hash_token(token: str) -> str:
    """Gera hash SHA-256 do token."""
    return hashlib.sha256(token.encode()).hexdigest()


def _get_or_create_billing_settings(db: Session) -> AppBillingSettings:
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


def _generate_referral_code() -> str:
    # short URL-safe code
    return secrets.token_urlsafe(6).replace('-', '').replace('_', '')[:10].upper()


def _ensure_user_referral_code(db: Session, user: AppUser) -> None:
    current = (user.referral_code or '').strip().upper()
    if current:
        if current != (user.referral_code or ''):
            user.referral_code = current
        return

    for _ in range(10):
        candidate = _generate_referral_code()
        exists = db.query(AppUser).filter(AppUser.referral_code == candidate).first()
        if exists:
            continue

        user.referral_code = candidate
        try:
            db.commit()
            db.refresh(user)
            return
        except IntegrityError:
            db.rollback()
            continue


def decode_token(token: str) -> dict:
    """Decodifica e valida JWT."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "app_access":
            raise HTTPException(status_code=401, detail="Token inválido")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


# =============================================================================
# DEPENDENCIES
# =============================================================================

def get_current_app_user(
    request: Request,
    db: Session = Depends(get_db)
) -> AppUser:
    """Obtém usuário atual do app a partir do token."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token não fornecido")
    
    token = auth_header.split(" ")[1]
    payload = decode_token(token)
    
    user_id = int(payload["sub"])
    user = db.get(AppUser, user_id)
    
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuário não encontrado ou inativo")
    
    return user


# =============================================================================
# ENDPOINTS - AUTENTICAÇÃO
# =============================================================================

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, data: AppUserRegister, db: Session = Depends(get_db)):
    """Registra novo usuário do app."""
    # Verifica se email já existe
    existing = db.query(AppUser).filter(AppUser.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    
    # Verifica telefone se fornecido
    if data.phone:
        existing_phone = db.query(AppUser).filter(AppUser.phone == data.phone).first()
        if existing_phone:
            raise HTTPException(status_code=400, detail="Telefone já cadastrado")
    
    s = _get_or_create_billing_settings(db)
    now = datetime.now(UTC)

    # Resolve indicação
    ref_code = (data.referral_code or '').strip().upper()
    referrer: AppUser | None = None
    if ref_code:
        referrer = db.query(AppUser).filter(AppUser.referral_code == ref_code).first()

    # Gera referral_code único para o novo usuário
    new_ref_code = None
    for _ in range(10):
        candidate = _generate_referral_code()
        exists = db.query(AppUser).filter(AppUser.referral_code == candidate).first()
        if not exists:
            new_ref_code = candidate
            break

    # Cria usuário
    user = AppUser(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        phone=data.phone,
        birth_date=data.birth_date,
        gender=data.gender,
        state=data.state.upper() if data.state else None,
        city=data.city,
        shopping_radius_km=data.shopping_radius_km,
        referral_code=new_ref_code,
        referred_by_user_id=referrer.id if referrer else None,
        trial_ends_at=now + timedelta(days=int(s.trial_days)),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Credita indicação (R$ 2,00) quando o indicado cadastra
    if referrer and referrer.id != user.id:
        start = _month_start(now)
        used = (
            db.query(AppCreditLedger)
            .filter(
                AppCreditLedger.user_id == referrer.id,
                AppCreditLedger.entry_type == "referral",
                AppCreditLedger.created_at >= start,
            )
            .count()
        )
        if used < int(s.referral_credit_limit_per_month):
            db.add(
                AppCreditLedger(
                    user_id=referrer.id,
                    entry_type="referral",
                    amount_cents=int(s.referral_credit_cents),
                    source_id=user.id,
                    notes=f"Indicação: cadastro do usuário {user.id}",
                    created_at=now,
                )
            )
            db.commit()
    
    # Gera tokens
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token()
    
    # Salva sessão
    session = AppUserSession(
        user_id=user.id,
        refresh_token_hash=hash_token(refresh_token),
        expires_at=datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(session)
    db.commit()
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=AppUserOut.model_validate(user)
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, data: AppUserLogin, db: Session = Depends(get_db)):
    """Login do usuário do app."""
    # Busca por email ou telefone
    user = None
    if data.email:
        user = db.query(AppUser).filter(AppUser.email == data.email).first()
    elif data.phone:
        user = db.query(AppUser).filter(AppUser.phone == data.phone).first()
    else:
        raise HTTPException(status_code=400, detail="Email ou telefone é obrigatório")
    
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Conta desativada")

    _ensure_user_referral_code(db, user)
    
    # Atualiza último login
    user.last_login = datetime.now(UTC)
    
    # Gera tokens
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token()
    
    # Salva sessão
    session = AppUserSession(
        user_id=user.id,
        refresh_token_hash=hash_token(refresh_token),
        device_id=data.device_id,
        device_name=data.device_name,
        device_os=data.device_os,
        push_token=data.push_token,
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(session)
    db.commit()
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=AppUserOut.model_validate(user)
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(data: RefreshRequest, db: Session = Depends(get_db)):
    """Renova tokens usando refresh token."""
    token_hash = hash_token(data.refresh_token)
    
    session = db.query(AppUserSession).filter(
        AppUserSession.refresh_token_hash == token_hash,
        AppUserSession.is_active == True,
        AppUserSession.expires_at > datetime.now(UTC)
    ).first()
    
    if not session:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")
    
    user = db.get(AppUser, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuário não encontrado ou inativo")

    _ensure_user_referral_code(db, user)
    
    # Invalida sessão antiga
    session.is_active = False
    
    # Gera novos tokens
    new_access_token = create_access_token(user.id)
    new_refresh_token = create_refresh_token()
    
    # Cria nova sessão
    new_session = AppUserSession(
        user_id=user.id,
        refresh_token_hash=hash_token(new_refresh_token),
        device_id=session.device_id,
        device_name=session.device_name,
        device_os=session.device_os,
        push_token=session.push_token,
        expires_at=datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_session)
    db.commit()
    
    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        user=AppUserOut.model_validate(user)
    )


@router.post("/logout")
def logout(
    request: Request,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user)
):
    """Logout do usuário (invalida sessão atual)."""
    auth_header = request.headers.get("Authorization", "")
    # Podemos invalidar todas as sessões ou apenas a atual
    # Por simplicidade, invalidamos todas
    db.query(AppUserSession).filter(
        AppUserSession.user_id == current_user.id,
        AppUserSession.is_active == True
    ).update({"is_active": False})
    db.commit()
    
    return {"message": "Logout realizado com sucesso"}


@router.post("/me/push-token", response_model=AppPushTokenOut)
def update_push_token(
    data: AppPushTokenIn,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    token = (data.expo_push_token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token inválido")

    # Atualiza o token nas sessões ativas do usuário (o /admin/notifications usa AppUserSession.push_token)
    updated = (
        db.query(AppUserSession)
        .filter(AppUserSession.user_id == current_user.id, AppUserSession.is_active == True)
        .update({"push_token": token}, synchronize_session=False)
    )
    if updated:
        db.commit()
    else:
        # se não houver sessão ativa, ainda assim não falhar (o app pode estar em edge case)
        try:
            db.commit()
        except Exception:
            pass

    return AppPushTokenOut(ok=True)


@router.post("/referrals/open")
@limiter.limit("60/minute")
def referral_open(request: Request, data: ReferralOpenIn):
    code = data.referral_code.strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Código inválido")
    logger.info(f"Referral open: code={code} ip={request.client.host if request.client else None}")
    return {"ok": True}


# =============================================================================
# ENDPOINTS - PERFIL
# =============================================================================

@router.get("/me", response_model=AppUserProfile)
def get_profile(db: Session = Depends(get_db), current_user: AppUser = Depends(get_current_app_user)):
    """Obtém perfil do usuário atual."""
    _ensure_user_referral_code(db, current_user)
    return AppUserProfile.model_validate(current_user)


@router.put("/me", response_model=AppUserProfile)
def update_profile(
    data: AppUserUpdate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user)
):
    """Atualiza perfil do usuário."""
    # Verifica telefone único
    if data.phone and data.phone != current_user.phone:
        existing = db.query(AppUser).filter(
            AppUser.phone == data.phone,
            AppUser.id != current_user.id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Telefone já cadastrado")
    
    # Atualiza campos
    update_data = data.model_dump(exclude_unset=True)
    
    # Converte estado para maiúsculas
    if 'state' in update_data and update_data['state']:
        update_data['state'] = update_data['state'].upper()
    
    for field, value in update_data.items():
        setattr(current_user, field, value)
    
    db.commit()
    db.refresh(current_user)
    
    return AppUserProfile.model_validate(current_user)


@router.delete("/me")
def delete_account(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user)
):
    """Desativa conta do usuário."""
    current_user.is_active = False
    db.commit()
    return {"message": "Conta desativada com sucesso"}


# =============================================================================
# ENDPOINTS - ADMIN (para painel web)
# =============================================================================

class AppUserAdminOut(BaseModel):
    """Schema para listagem admin."""
    id: int
    name: str
    email: str
    phone: Optional[str]
    birth_date: Optional[datetime]
    gender: Optional[str]
    state: Optional[str]
    city: Optional[str]
    shopping_radius_km: float
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login: Optional[datetime]
    lists_count: int = 0

    class Config:
        from_attributes = True


@router.get("/admin/users", response_model=List[AppUserAdminOut])
def list_app_users_admin(
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    # TODO: Adicionar verificação de permissão admin
):
    """Lista usuários do app (para painel admin)."""
    query = db.query(AppUser)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (AppUser.name.ilike(search_term)) |
            (AppUser.email.ilike(search_term)) |
            (AppUser.phone.ilike(search_term))
        )
    
    if is_active is not None:
        query = query.filter(AppUser.is_active == is_active)
    
    total = query.count()
    users = query.order_by(AppUser.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    
    result = []
    for user in users:
        result.append(AppUserAdminOut(
            id=user.id,
            name=user.name,
            email=user.email,
            phone=user.phone,
            birth_date=user.birth_date,
            gender=user.gender,
            state=user.state,
            city=user.city,
            shopping_radius_km=user.shopping_radius_km,
            is_active=user.is_active,
            is_verified=user.is_verified,
            created_at=user.created_at,
            last_login=user.last_login,
            lists_count=len(user.shopping_lists)
        ))
    
    return result


@router.get("/admin/users/{user_id}", response_model=AppUserProfile)
def get_app_user_admin(
    user_id: int,
    db: Session = Depends(get_db),
    # TODO: Adicionar verificação de permissão admin
):
    """Obtém detalhes de um usuário do app (para painel admin)."""
    user = db.get(AppUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return AppUserProfile.model_validate(user)


@router.put("/admin/users/{user_id}/toggle-active")
def toggle_app_user_active(
    user_id: int,
    db: Session = Depends(get_db),
    # TODO: Adicionar verificação de permissão admin
):
    """Ativa/desativa usuário do app."""
    user = db.get(AppUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    user.is_active = not user.is_active
    db.commit()
    
    return {"message": f"Usuário {'ativado' if user.is_active else 'desativado'}", "is_active": user.is_active}


@router.get("/admin/users/{user_id}/billing", response_model=AppUserAdminBillingOut)
def get_app_user_billing_admin(
    user_id: int,
    db: Session = Depends(get_db),
):
    user = db.get(AppUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    s = _get_or_create_billing_settings(db)

    balance = (
        db.query(func.coalesce(func.sum(AppCreditLedger.amount_cents), 0))
        .filter(AppCreditLedger.user_id == user.id)
        .scalar()
    )
    balance = int(balance or 0)
    amount_due = max(int(s.monthly_price_cents) - balance, 0)

    return AppUserAdminBillingOut(
        user_id=user.id,
        trial_ends_at=user.trial_ends_at,
        subscription_ends_at=user.subscription_ends_at,
        referral_code=user.referral_code,
        referred_by_user_id=user.referred_by_user_id,
        monthly_price_cents=int(s.monthly_price_cents),
        credit_balance_cents=balance,
        amount_due_cents=amount_due,
        referral_credit_cents=int(s.referral_credit_cents),
        receipt_credit_cents=int(s.receipt_credit_cents),
        referral_credit_limit_per_month=int(s.referral_credit_limit_per_month),
        receipt_credit_limit_per_month=int(s.receipt_credit_limit_per_month),
    )


@router.get("/admin/users/{user_id}/credits", response_model=List[AppCreditLedgerOut])
def list_app_user_credit_ledger_admin(
    user_id: int,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    if limit < 1:
        limit = 1
    if limit > 500:
        limit = 500

    user = db.get(AppUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    rows = (
        db.query(AppCreditLedger)
        .filter(AppCreditLedger.user_id == user.id)
        .order_by(AppCreditLedger.created_at.desc())
        .limit(limit)
        .all()
    )
    return rows
