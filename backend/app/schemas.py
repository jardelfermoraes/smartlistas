"""Schemas Pydantic para validação e serialização."""

import re
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# === Enums ===


class ReceiptStatus(str, Enum):
    """Status possíveis de um cupom."""

    PENDENTE = "pendente"
    BAIXANDO = "baixando"
    BAIXADO = "baixado"
    PROCESSADO = "processado"
    ERRO = "erro"


class JobStatus(str, Enum):
    """Status possíveis de um job RQ."""

    QUEUED = "queued"
    STARTED = "started"
    FINISHED = "finished"
    FAILED = "failed"
    DEFERRED = "deferred"
    SCHEDULED = "scheduled"


# === Validators ===


CHAVE_PATTERN = re.compile(r"^\d{44}$")
CNPJ_PATTERN = re.compile(r"^\d{14}$")


def extract_chave_from_text(text: str) -> str | None:
    """Extrai chave de 44 dígitos de um texto (QR code, URL, etc)."""
    match = re.search(r"\d{44}", text)
    return match.group(0) if match else None


# === Request Schemas ===


class ReceiptImportRequest(BaseModel):
    """Request para importar um cupom fiscal."""

    qr_text: str | None = Field(None, description="Texto do QR code do cupom")
    chave_acesso: str | None = Field(None, description="Chave de acesso de 44 dígitos")

    @model_validator(mode="after")
    def validate_has_chave(self) -> "ReceiptImportRequest":
        """Valida que pelo menos uma forma de identificar o cupom foi fornecida."""
        if not self.qr_text and not self.chave_acesso:
            raise ValueError("Forneça qr_text ou chave_acesso")
        return self

    @field_validator("chave_acesso")
    @classmethod
    def validate_chave_format(cls, v: str | None) -> str | None:
        """Valida formato da chave de acesso."""
        if v is not None:
            # Tenta extrair a chave se vier com outros caracteres
            extracted = extract_chave_from_text(v)
            if not extracted:
                raise ValueError("chave_acesso deve conter 44 dígitos numéricos")
            return extracted
        return v

    def get_chave(self) -> str | None:
        """Retorna a chave de acesso, extraindo do qr_text se necessário."""
        if self.chave_acesso:
            return self.chave_acesso
        if self.qr_text:
            return extract_chave_from_text(self.qr_text)
        return None


# === Response Schemas ===


class ImportResponse(BaseModel):
    """Response após enfileirar importação."""

    job_id: str
    status: str
    message: str = "Cupom enfileirado para processamento"


class JobStatusResponse(BaseModel):
    """Response com status de um job."""

    job_id: str
    status: JobStatus
    enqueued_at: datetime | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    result: dict | None = None
    error: str | None = None


# === Item Schemas ===


class ReceiptItemBase(BaseModel):
    """Schema base para item de cupom."""

    descricao: str = Field(..., min_length=1, max_length=255)
    qtd: float = Field(default=1.0, ge=0)
    unidade: str = Field(default="un", max_length=10)
    preco_unit: float = Field(default=0.0, ge=0)
    preco_total: float = Field(default=0.0, ge=0)
    desconto: float = Field(default=0.0, ge=0)
    gtin: str | None = Field(None, max_length=32)


class ReceiptItemOut(ReceiptItemBase):
    """Schema de saída para item de cupom."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    seq: int


class ReceiptItemCreate(ReceiptItemBase):
    """Schema para criar item de cupom."""

    seq: int = Field(default=1, ge=1)


class ReceiptManualInput(BaseModel):
    """Schema para entrada manual de dados do cupom."""
    
    chave_acesso: str = Field(..., min_length=44, max_length=44, description="Chave de acesso de 44 dígitos")
    cnpj_emissor: str = Field(..., min_length=14, max_length=14, description="CNPJ do emissor (14 dígitos)")
    nome_emissor: str | None = Field(None, max_length=255, description="Nome/Razão social do emissor")
    endereco_emissor: str | None = Field(None, max_length=500, description="Endereço do emissor")
    cidade_emissor: str | None = Field(None, max_length=100, description="Cidade do emissor")
    uf_emissor: str | None = Field(None, max_length=2, description="UF do emissor")
    data_emissao: datetime | None = Field(None, description="Data/hora de emissão")
    total: float = Field(..., ge=0, description="Valor total do cupom")
    itens: list[ReceiptItemCreate] = Field(default_factory=list, description="Lista de itens do cupom")
    
    @field_validator("chave_acesso")
    @classmethod
    def validate_chave(cls, v: str) -> str:
        if not CHAVE_PATTERN.match(v):
            raise ValueError("Chave de acesso deve ter 44 dígitos numéricos")
        return v
    
    @field_validator("cnpj_emissor")
    @classmethod
    def validate_cnpj(cls, v: str) -> str:
        v = re.sub(r"\D", "", v)
        if len(v) != 14:
            raise ValueError("CNPJ deve ter 14 dígitos")
        return v


# === Receipt Schemas ===


class ReceiptBase(BaseModel):
    """Schema base para cupom."""

    chave_acesso: str = Field(..., min_length=44, max_length=44)
    cnpj_emissor: str | None = Field(None, max_length=20)
    estado: str | None = Field(None, max_length=2)
    data_emissao: datetime | None = None
    total: float = Field(default=0.0, ge=0)


class ReceiptOut(ReceiptBase):
    """Schema de saída para cupom."""

    model_config = ConfigDict(from_attributes=True)

    status: ReceiptStatus
    loja_id: int | None = None
    created_at: datetime | None = None
    itens: list[ReceiptItemOut] = []


class ReceiptSummary(BaseModel):
    """Schema resumido de cupom (sem itens)."""

    model_config = ConfigDict(from_attributes=True)

    chave_acesso: str
    cnpj_emissor: str | None = None
    data_emissao: datetime | None = None
    total: float
    status: ReceiptStatus


class ReceiptListResponse(BaseModel):
    """Response para listagem de cupons."""

    items: list[ReceiptSummary]
    total: int
    page: int
    page_size: int
    pages: int


# === Store Schemas ===


class StoreBase(BaseModel):
    """Schema base para loja."""

    cnpj: str = Field(..., min_length=14, max_length=20)
    nome: str | None = Field(None, max_length=255)
    nome_fantasia: str | None = Field(None, max_length=255)
    endereco: str | None = Field(None, max_length=255)
    cidade: str | None = Field(None, max_length=120)
    uf: str | None = Field(None, max_length=2)
    cep: str | None = Field(None, max_length=20)
    telefone: str | None = Field(None, max_length=20)


class StoreOut(StoreBase):
    """Schema de saída para loja."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    lat: float | None = None
    lng: float | None = None
    verificado: bool = False
    created_at: datetime | None = None


class StoreCreate(StoreBase):
    """Schema para criar loja."""

    pass


# === Product Schemas ===


class ProductBase(BaseModel):
    """Schema base para produto."""

    gtin: str | None = Field(None, max_length=32)
    descricao_norm: str = Field(..., min_length=1, max_length=255)
    marca: str | None = Field(None, max_length=120)
    categoria: str | None = Field(None, max_length=120)
    unidade_base: str = Field(default="un", max_length=10)


class ProductOut(ProductBase):
    """Schema de saída para produto."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime | None = None


class ProductCreate(ProductBase):
    """Schema para criar produto."""

    pass


# === Price Schemas ===


class PriceBase(BaseModel):
    """Schema base para preço."""

    produto_id: int
    loja_id: int
    preco_por_unidade: float = Field(..., ge=0)
    unidade_base: str = Field(default="un", max_length=10)
    fonte: str = Field(default="cupom", max_length=30)


class PriceOut(PriceBase):
    """Schema de saída para preço."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    data_coleta: datetime
    cupom_id: str | None = None
    created_at: datetime | None = None


class PriceCreate(PriceBase):
    """Schema para criar preço."""

    cupom_id: str | None = None


# === Health Check ===


class HealthResponse(BaseModel):
    """Response do health check."""

    status: str
    db: bool
    redis: bool
    version: str = "1.0.0"
