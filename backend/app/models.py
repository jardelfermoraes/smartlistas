"""Models SQLAlchemy para o MelhorCompra."""

from datetime import UTC, datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Table,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from .database import Base


def utc_now() -> datetime:
    """Retorna datetime atual em UTC."""
    return datetime.now(UTC)


# =============================================================================
# AUTENTICAÇÃO E AUTORIZAÇÃO
# =============================================================================

# Tabela de associação Role <-> Permission (N:N)
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", Integer, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class Permission(Base):
    """Modelo para permissões granulares do sistema."""

    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(100), unique=True, nullable=False, index=True)  # Ex: users.create, receipts.delete
    name = Column(String(100), nullable=False)  # Nome amigável
    description = Column(String(255), nullable=True)
    module = Column(String(50), nullable=False, index=True)  # Módulo: users, receipts, stores, etc.
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    roles = relationship("Role", secondary=role_permissions, back_populates="permissions")


class Role(Base):
    """Modelo para papéis/níveis de acesso."""

    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)  # super_admin, admin, manager, viewer
    display_name = Column(String(100), nullable=False)  # Nome para exibição
    description = Column(String(255), nullable=True)
    is_system = Column(Boolean, default=False)  # Roles do sistema não podem ser deletadas
    level = Column(Integer, default=0)  # Nível hierárquico (maior = mais permissões)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles")
    users = relationship("User", back_populates="role")


class User(Base):
    """Modelo para usuários do sistema."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    nome = Column(String(255), nullable=False)
    telefone = Column(String(20), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)  # Email verificado
    
    # Role
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False, index=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    last_login = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    role = relationship("Role", back_populates="users")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user")
    shopping_lists = relationship("ShoppingList", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_users_email_active", "email", "is_active"),
    )

    def has_permission(self, permission_code: str) -> bool:
        """Verifica se o usuário tem uma permissão específica."""
        if not self.role:
            return False
        return any(p.code == permission_code for p in self.role.permissions)
    
    def has_any_permission(self, *permission_codes: str) -> bool:
        """Verifica se o usuário tem qualquer uma das permissões."""
        if not self.role:
            return False
        user_permissions = {p.code for p in self.role.permissions}
        return bool(user_permissions.intersection(permission_codes))


class UserSession(Base):
    """Modelo para sessões de usuário (tokens de refresh)."""

    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    refresh_token_hash = Column(String(255), nullable=False, unique=True)
    device_info = Column(String(255), nullable=True)  # User-Agent ou info do dispositivo
    ip_address = Column(String(45), nullable=True)  # IPv4 ou IPv6
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    last_used_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    user = relationship("User", back_populates="sessions")

    __table_args__ = (
        Index("ix_sessions_user_active", "user_id", "is_active"),
        Index("ix_sessions_expires", "expires_at"),
    )


class AuditLog(Base):
    """Modelo para logs de auditoria."""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(100), nullable=False, index=True)  # login, logout, create_user, delete_receipt, etc.
    resource_type = Column(String(50), nullable=True)  # user, receipt, store, etc.
    resource_id = Column(String(100), nullable=True)  # ID do recurso afetado
    details = Column(Text, nullable=True)  # JSON com detalhes adicionais
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, index=True)

    # Relationships
    user = relationship("User", back_populates="audit_logs")

    __table_args__ = (
        Index("ix_audit_user_action", "user_id", "action"),
        Index("ix_audit_resource", "resource_type", "resource_id"),
        Index("ix_audit_created", "created_at"),
    )


class PasswordResetToken(Base):
    """Modelo para tokens de recuperação de senha."""

    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(255), nullable=False, unique=True)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        Index("ix_reset_token_expires", "expires_at"),
    )


# =============================================================================
# USUÁRIOS DO APP (CONSUMIDORES)
# =============================================================================

class AppUser(Base):
    """Modelo para usuários do aplicativo mobile (consumidores)."""

    __tablename__ = "app_users"

    id = Column(Integer, primary_key=True, index=True)
    
    # Dados de autenticação
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    
    # Dados pessoais (campos principais do cadastro)
    name = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True, index=True)  # Celular
    birth_date = Column(DateTime(timezone=True), nullable=True)  # Data de nascimento
    gender = Column(String(20), nullable=True)  # male|female|other|prefer_not_say
    avatar_url = Column(String(500), nullable=True)
    
    # Localização
    state = Column(String(2), nullable=True)  # Estado (UF)
    city = Column(String(100), nullable=True)  # Cidade
    latitude = Column(Float, nullable=True)  # Para cálculo de distância
    longitude = Column(Float, nullable=True)
    
    # Configuração de compras
    shopping_radius_km = Column(Float, default=10.0)  # Raio de compra em km (padrão 10km)
    
    # Status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)  # Email verificado

    # Billing / referrals
    referral_code = Column(String(20), nullable=True, unique=True, index=True)
    referred_by_user_id = Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True, index=True)
    trial_ends_at = Column(DateTime(timezone=True), nullable=True, index=True)
    subscription_ends_at = Column(DateTime(timezone=True), nullable=True, index=True)
    
    # Preferências de notificação
    notification_enabled = Column(Boolean, default=True)
    notification_deals = Column(Boolean, default=True)  # Ofertas
    notification_price_drop = Column(Boolean, default=True)  # Queda de preço
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    last_login = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    shopping_lists = relationship("AppShoppingList", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("AppUserSession", back_populates="user", cascade="all, delete-orphan")

    referred_by = relationship("AppUser", remote_side=[id], foreign_keys=[referred_by_user_id])
    credit_ledger_entries = relationship("AppCreditLedger", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_app_users_email_active", "email", "is_active"),
        Index("ix_app_users_city_state", "city", "state"),
        Index("ix_app_users_referrer", "referred_by_user_id"),
    )


class AppBillingSettings(Base):
    """Configurações de billing/promos do App (editáveis no painel)."""

    __tablename__ = "app_billing_settings"

    id = Column(Integer, primary_key=True, index=True)
    is_active = Column(Boolean, default=True)

    trial_days = Column(Integer, default=30)
    monthly_price_cents = Column(Integer, default=1500)

    referral_credit_cents = Column(Integer, default=200)
    receipt_credit_cents = Column(Integer, default=100)

    referral_credit_limit_per_month = Column(Integer, default=5)
    receipt_credit_limit_per_month = Column(Integer, default=5)

    created_at = Column(DateTime(timezone=True), default=utc_now, index=True)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class AppCreditLedger(Base):
    """Ledger de créditos (e débitos futuros) do usuário do app, em centavos."""

    __tablename__ = "app_credit_ledger"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)

    entry_type = Column(String(30), nullable=False, index=True)  # referral|receipt|manual|debit
    amount_cents = Column(Integer, nullable=False)  # positivo=crédito, negativo=débito
    source_id = Column(Integer, nullable=True, index=True)
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, index=True)

    user = relationship("AppUser", back_populates="credit_ledger_entries")

    __table_args__ = (
        Index("ix_app_credit_ledger_user_type_created", "user_id", "entry_type", "created_at"),
    )


class AppPayment(Base):
    """Pagamentos do app (assinatura), registrados a partir de provedores externos (ex: Mercado Pago)."""

    __tablename__ = "app_payments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)

    provider = Column(String(30), nullable=False, index=True)  # mercadopago
    provider_payment_id = Column(String(80), nullable=True, index=True)
    status = Column(String(30), nullable=False, index=True)  # pending|approved|rejected|cancelled|refunded|...

    amount_cents = Column(Integer, nullable=False)
    credits_applied_cents = Column(Integer, nullable=False, default=0)
    currency = Column(String(10), nullable=False, default="BRL")
    description = Column(String(255), nullable=True)

    period_start = Column(DateTime(timezone=True), nullable=True, index=True)
    period_end = Column(DateTime(timezone=True), nullable=True, index=True)

    approved_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, index=True)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    raw_payload = Column(Text, nullable=True)

    user = relationship("AppUser")

    __table_args__ = (
        UniqueConstraint("provider", "provider_payment_id", name="uq_app_payments_provider_payment"),
        Index("ix_app_payments_user_created", "user_id", "created_at"),
    )


class AppUserSession(Base):
    """Modelo para sessões de usuários do app."""

    __tablename__ = "app_user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)
    refresh_token_hash = Column(String(255), nullable=False, unique=True)
    device_id = Column(String(255), nullable=True)  # ID único do dispositivo
    device_name = Column(String(255), nullable=True)  # Ex: "iPhone 14 Pro"
    device_os = Column(String(50), nullable=True)  # Ex: "iOS 17.1", "Android 14"
    push_token = Column(String(500), nullable=True)  # Token para push notifications
    ip_address = Column(String(45), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    last_used_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    user = relationship("AppUser", back_populates="sessions")

    __table_args__ = (
        Index("ix_app_sessions_user_active", "user_id", "is_active"),
        Index("ix_app_sessions_device", "device_id"),
    )


class AppShoppingList(Base):
    """Modelo para lista de compras do usuário do app."""

    __tablename__ = "app_shopping_lists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    status = Column(String(20), default="draft")
    
    # Configuração de otimização
    max_stores = Column(Integer, default=3)
    
    # Localização para busca
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    radius_km = Column(Float, default=10.0)
    
    # Resultado da otimização
    total_estimated = Column(Float, nullable=True)
    total_savings = Column(Float, nullable=True)
    optimized_at = Column(DateTime(timezone=True), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    user = relationship("AppUser", back_populates="shopping_lists")
    items = relationship("AppShoppingListItem", back_populates="shopping_list", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_app_shopping_lists_user_status", "user_id", "status"),
    )


class AppShoppingListItem(Base):
    """Modelo para itens da lista de compras do app."""

    __tablename__ = "app_shopping_list_items"

    id = Column(Integer, primary_key=True, index=True)
    shopping_list_id = Column(Integer, ForeignKey("app_shopping_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    canonical_id = Column(Integer, ForeignKey("produtos_canonicos.id"), nullable=False, index=True)
    quantity = Column(Float, default=1.0)
    unit = Column(String(20), default="un")
    notes = Column(String(255), nullable=True)
    is_checked = Column(Boolean, default=False)  # Marcado como comprado
    
    # Preenchido após otimização
    best_price = Column(Float, nullable=True)
    best_store_id = Column(Integer, ForeignKey("lojas.id"), nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    shopping_list = relationship("AppShoppingList", back_populates="items")
    canonical_product = relationship("CanonicalProduct")
    best_store = relationship("Store")

    __table_args__ = (
        UniqueConstraint("shopping_list_id", "canonical_id", name="uq_app_shopping_list_item"),
    )


class AppPurchase(Base):
    """Registro de compra concluída (snapshot) enviada pelo app."""

    __tablename__ = "app_purchases"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Identificadores/snapshot da lista
    local_list_id = Column(String(100), nullable=True, index=True)
    list_name = Column(String(120), nullable=True)
    status_final = Column(String(20), nullable=False, default="completed")
    finished_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)

    # Cupom
    receipt_qr_raw = Column(Text, nullable=True)
    receipt_chave_acesso = Column(String(44), nullable=True, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    user = relationship("AppUser")
    items = relationship("AppPurchaseItem", back_populates="purchase", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_app_purchases_user_finished", "user_id", "finished_at"),
    )


class AppPurchaseItem(Base):
    """Itens da compra concluída (snapshot)."""

    __tablename__ = "app_purchase_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_id = Column(Integer, ForeignKey("app_purchases.id", ondelete="CASCADE"), nullable=False, index=True)

    canonical_id = Column(Integer, ForeignKey("produtos_canonicos.id"), nullable=True, index=True)
    product_name_snapshot = Column(String(255), nullable=True)
    quantity = Column(Float, default=1.0)
    unit = Column(String(20), default="un")
    is_checked = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    purchase = relationship("AppPurchase", back_populates="items")
    canonical_product = relationship("CanonicalProduct")

    __table_args__ = (
        Index("ix_app_purchase_items_purchase", "purchase_id"),
        Index("ix_app_purchase_items_canonical", "canonical_id"),
    )


class AppReceiptKeySubmission(Base):
    """Chave de acesso (44 dígitos) enviada pelo AppUser para triagem/processamento manual."""

    __tablename__ = "app_receipt_key_submissions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)

    purchase_id = Column(Integer, ForeignKey("app_purchases.id", ondelete="SET NULL"), nullable=True, index=True)

    chave_acesso = Column(String(44), nullable=False, unique=True, index=True)
    raw_text = Column(Text, nullable=True)
    source = Column(String(20), nullable=False, default="manual")  # qr|barcode|manual
    status = Column(String(20), nullable=False, default="pending")  # pending|reviewed|rejected|processed

    created_at = Column(DateTime(timezone=True), default=utc_now, index=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes = Column(String(255), nullable=True)

    credited_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("AppUser")
    purchase = relationship("AppPurchase")
    reviewed_by = relationship("User")

    __table_args__ = (
        Index("ix_app_receipt_keys_user_created", "user_id", "created_at"),
        Index("ix_app_receipt_keys_status", "status"),
        Index("ix_app_receipt_keys_purchase", "purchase_id"),
        Index("ix_app_receipt_keys_credited", "credited_at"),
    )


class CityLocation(Base):
    __tablename__ = "city_locations"

    id = Column(Integer, primary_key=True, index=True)
    uf = Column(String(2), nullable=False, index=True)
    city = Column(String(120), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    __table_args__ = (
        UniqueConstraint("uf", "city", name="uq_city_locations_uf_city"),
        Index("ix_city_locations_uf_city", "uf", "city"),
    )


class Store(Base):
    """Modelo para lojas/estabelecimentos."""

    __tablename__ = "lojas"

    id = Column(Integer, primary_key=True, index=True)
    cnpj = Column(String(20), unique=True, index=True, nullable=False)
    nome = Column(String(255))  # Razão social
    nome_fantasia = Column(String(255))  # Nome popular/fantasia
    endereco = Column(String(255))
    cidade = Column(String(120))
    uf = Column(String(2))
    cep = Column(String(20))
    telefone = Column(String(20))
    lat = Column(Float)
    lng = Column(Float)
    verificado = Column(Boolean, default=False)  # Admin revisou os dados
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    cupons = relationship("Receipt", back_populates="loja")
    precos = relationship("Price", back_populates="loja")
    aliases = relationship("ProductAlias", back_populates="loja")

    __table_args__ = (
        Index("ix_lojas_cidade_uf", "cidade", "uf"),
    )


class CanonicalProduct(Base):
    """Modelo para produtos canônicos (padronizados)."""

    __tablename__ = "produtos_canonicos"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(255), nullable=False, index=True)  # Nome padronizado
    marca = Column(String(120), nullable=True, index=True)
    categoria = Column(String(120), nullable=True, index=True)
    subcategoria = Column(String(120), nullable=True)
    unidade_padrao = Column(String(10), nullable=False, default="un")  # un, kg, l, ml, g
    quantidade_padrao = Column(Float, nullable=True)  # Ex: 420 (para 420g)
    gtin_principal = Column(String(32), nullable=True, unique=True, index=True)  # GTIN principal se houver
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    aliases = relationship("ProductAlias", back_populates="canonical_product", cascade="all, delete-orphan")
    precos = relationship("Price", back_populates="canonical_product")

    __table_args__ = (
        Index("ix_canonicos_nome_marca", "nome", "marca"),
        Index("ix_canonicos_categoria", "categoria"),
    )


class ProductAlias(Base):
    """Modelo para aliases de produtos (descrições de cada loja)."""

    __tablename__ = "produtos_aliases"

    id = Column(Integer, primary_key=True, index=True)
    canonical_id = Column(Integer, ForeignKey("produtos_canonicos.id"), nullable=False, index=True)
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=True, index=True)  # Null = alias global
    descricao_original = Column(String(255), nullable=False, index=True)  # Descrição exata do cupom
    descricao_normalizada = Column(String(255), nullable=False, index=True)  # Descrição em maiúsculas, sem acentos
    gtin = Column(String(32), nullable=True, index=True)
    confianca = Column(Float, default=1.0)  # 0-1, confiança do match (1 = manual, <1 = IA)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    canonical_product = relationship("CanonicalProduct", back_populates="aliases")
    loja = relationship("Store", back_populates="aliases")

    __table_args__ = (
        Index("ix_aliases_descricao_loja", "descricao_normalizada", "loja_id"),
        UniqueConstraint("descricao_normalizada", "loja_id", name="uq_alias_descricao_loja"),
    )


class Product(Base):
    """Modelo para produtos normalizados (legado - será migrado para CanonicalProduct)."""

    __tablename__ = "produtos"

    id = Column(Integer, primary_key=True, index=True)
    gtin = Column(String(32), index=True, nullable=True)
    descricao_norm = Column(String(255), index=True, nullable=False)
    marca = Column(String(120), nullable=True)
    categoria = Column(String(120), nullable=True)
    unidade_base = Column(String(10), nullable=False, default="un")
    canonical_id = Column(Integer, ForeignKey("produtos_canonicos.id"), nullable=True, index=True)  # Link para canônico
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    itens = relationship("ReceiptItem", back_populates="produto")
    precos_legado = relationship("Price", back_populates="produto", foreign_keys="Price.produto_id")
    canonical_product = relationship("CanonicalProduct")

    __table_args__ = (
        Index("ix_produtos_gtin_descricao", "gtin", "descricao_norm"),
    )


class Receipt(Base):
    """Modelo para cupons fiscais (NFC-e)."""

    __tablename__ = "cupons"

    chave_acesso = Column(String(44), primary_key=True)
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=True, index=True)
    cnpj_emissor = Column(String(20), index=True)
    estado = Column(String(2), index=True)
    tipo = Column(String(10), default="NFC-e")
    data_emissao = Column(DateTime(timezone=True), index=True)
    total = Column(Float, default=0.0)
    status = Column(String(20), default="pendente", index=True)
    source_url = Column(String(500), nullable=True)
    raw_html = Column(Text, nullable=True)
    error_message = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    loja = relationship("Store", back_populates="cupons")
    itens = relationship("ReceiptItem", back_populates="cupom", cascade="all, delete-orphan")
    precos = relationship("Price", back_populates="cupom")

    __table_args__ = (
        Index("ix_cupons_estado_data", "estado", "data_emissao"),
        Index("ix_cupons_status_created", "status", "created_at"),
    )


class ReceiptItem(Base):
    """Modelo para itens de um cupom fiscal."""

    __tablename__ = "itens_cupom"

    id = Column(Integer, primary_key=True, index=True)
    cupom_id = Column(String(44), ForeignKey("cupons.chave_acesso"), nullable=False, index=True)
    produto_id = Column(Integer, ForeignKey("produtos.id"), nullable=True, index=True)
    seq = Column(Integer, default=1)  # Sequência do item no cupom
    descricao_raw = Column(String(255), nullable=False)
    qtd = Column(Float, default=1.0)
    unidade = Column(String(10), default="un")
    preco_unit = Column(Float, default=0.0)
    preco_total = Column(Float, default=0.0)
    desconto = Column(Float, default=0.0)
    gtin_opt = Column(String(32), nullable=True, index=True)
    ncm = Column(String(10), nullable=True)  # Código NCM do produto

    # Relationships
    cupom = relationship("Receipt", back_populates="itens")
    produto = relationship("Product", back_populates="itens")

    __table_args__ = (
        Index("ix_itens_cupom_gtin", "gtin_opt"),
        UniqueConstraint("cupom_id", "seq", name="uq_item_seq_cupom"),
    )


class Price(Base):
    """Modelo para histórico de preços."""

    __tablename__ = "precos"

    id = Column(Integer, primary_key=True, index=True)
    produto_id = Column(Integer, ForeignKey("produtos.id"), nullable=True, index=True)  # Legado
    canonical_id = Column(Integer, ForeignKey("produtos_canonicos.id"), nullable=True, index=True)  # Novo
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False, index=True)
    preco_por_unidade = Column(Float, nullable=False)
    unidade_base = Column(String(10), default="un")
    data_coleta = Column(DateTime(timezone=True), index=True, default=utc_now)
    fonte = Column(String(30), default="cupom")
    cupom_id = Column(String(44), ForeignKey("cupons.chave_acesso"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    produto = relationship("Product", back_populates="precos_legado", foreign_keys=[produto_id])
    canonical_product = relationship("CanonicalProduct", back_populates="precos")
    loja = relationship("Store", back_populates="precos")
    cupom = relationship("Receipt", back_populates="precos")

    __table_args__ = (
        Index("ix_precos_canonical_loja", "canonical_id", "loja_id"),
        Index("ix_precos_produto_loja", "produto_id", "loja_id"),
        Index("ix_precos_data_coleta", "data_coleta"),
    )


# =============================================================================
# LISTA DE COMPRAS
# =============================================================================

class ShoppingListStatus(PyEnum):
    """Status da lista de compras."""
    DRAFT = "draft"           # Em edição
    READY = "ready"           # Pronta para otimizar
    OPTIMIZED = "optimized"   # Otimizada
    COMPLETED = "completed"   # Compras realizadas
    ARCHIVED = "archived"     # Arquivada


class ShoppingList(Base):
    """Modelo para lista de compras do usuário."""

    __tablename__ = "shopping_lists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    status = Column(String(20), default=ShoppingListStatus.DRAFT.value)
    
    # Configuração de otimização
    max_stores = Column(Integer, default=3)  # Máximo de supermercados (1-5)
    
    # Localização para busca de lojas próximas
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    radius_km = Column(Float, default=10.0)  # Raio de busca em km
    
    # Resultado da otimização
    total_estimated = Column(Float, nullable=True)  # Total estimado após otimização
    total_savings = Column(Float, nullable=True)    # Economia estimada
    optimized_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    # Relationships
    user = relationship("User", back_populates="shopping_lists")
    items = relationship("ShoppingListItem", back_populates="shopping_list", cascade="all, delete-orphan")
    optimized_items = relationship("OptimizedShoppingItem", back_populates="shopping_list", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_shopping_lists_user_status", "user_id", "status"),
    )


class ShoppingListItem(Base):
    """Modelo para itens da lista de compras."""

    __tablename__ = "shopping_list_items"

    id = Column(Integer, primary_key=True, index=True)
    shopping_list_id = Column(Integer, ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    canonical_id = Column(Integer, ForeignKey("produtos_canonicos.id"), nullable=False, index=True)
    quantity = Column(Float, default=1.0)
    unit = Column(String(20), default="un")  # un, kg, L, etc.
    notes = Column(String(255), nullable=True)  # Observações do usuário
    
    # Preenchido após otimização
    best_price = Column(Float, nullable=True)
    best_store_id = Column(Integer, ForeignKey("lojas.id"), nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    shopping_list = relationship("ShoppingList", back_populates="items")
    canonical_product = relationship("CanonicalProduct")
    best_store = relationship("Store")

    __table_args__ = (
        UniqueConstraint("shopping_list_id", "canonical_id", name="uq_shopping_list_item"),
    )


class OptimizedShoppingItem(Base):
    """Modelo para itens otimizados por loja."""

    __tablename__ = "optimized_shopping_items"

    id = Column(Integer, primary_key=True, index=True)
    shopping_list_id = Column(Integer, ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    store_id = Column(Integer, ForeignKey("lojas.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("shopping_list_items.id", ondelete="CASCADE"), nullable=False)
    
    price = Column(Float, nullable=False)
    quantity = Column(Float, default=1.0)
    subtotal = Column(Float, nullable=False)
    
    # Ranking do item nesta loja (1 = mais barato)
    price_rank = Column(Integer, default=1)
    
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    shopping_list = relationship("ShoppingList", back_populates="optimized_items")
    store = relationship("Store")
    item = relationship("ShoppingListItem")

    __table_args__ = (
        Index("ix_optimized_items_list_store", "shopping_list_id", "store_id"),
    )
