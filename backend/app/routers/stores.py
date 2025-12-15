"""Router para operações com lojas/estabelecimentos."""

import logging
from math import ceil

from fastapi import APIRouter, HTTPException, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import or_

from ..database import DbSession
from ..models import Store
from ..schemas import StoreCreate, StoreOut

logger = logging.getLogger(__name__)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# === Schemas adicionais ===

from pydantic import BaseModel, Field
from datetime import datetime


class StoreUpdate(BaseModel):
    """Schema para atualizar loja."""
    nome: str | None = Field(None, max_length=255)
    nome_fantasia: str | None = Field(None, max_length=255)
    endereco: str | None = Field(None, max_length=255)
    cidade: str | None = Field(None, max_length=120)
    uf: str | None = Field(None, max_length=2)
    cep: str | None = Field(None, max_length=20)
    telefone: str | None = Field(None, max_length=20)
    lat: float | None = None
    lng: float | None = None
    verificado: bool | None = None


class StoreListResponse(BaseModel):
    """Response para listagem de lojas."""
    items: list[StoreOut]
    total: int
    page: int
    page_size: int
    pages: int


# === Endpoints ===


@router.post("/", response_model=StoreOut, status_code=201)
@limiter.limit("30/minute")
def create_store(request: Request, payload: StoreCreate, db: DbSession):
    """
    Cria uma nova loja.

    - **cnpj**: CNPJ do estabelecimento (obrigatório, único)
    - **nome**: Nome/razão social
    - **endereco**: Endereço completo
    - **cidade**: Cidade
    - **uf**: Estado (2 letras)
    - **cep**: CEP
    """
    # Verifica se CNPJ já existe
    existing = db.query(Store).filter(Store.cnpj == payload.cnpj).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Loja com CNPJ {payload.cnpj} já existe"
        )

    store = Store(
        cnpj=payload.cnpj,
        nome=payload.nome,
        endereco=payload.endereco,
        cidade=payload.cidade,
        uf=payload.uf.upper() if payload.uf else None,
        cep=payload.cep,
    )
    db.add(store)
    db.commit()
    db.refresh(store)

    logger.info(f"Loja criada: {store.id} - {store.nome}")
    return store


@router.get("/", response_model=StoreListResponse)
@limiter.limit("60/minute")
def list_stores(
    request: Request,
    db: DbSession,
    page: int = Query(1, ge=1, description="Número da página"),
    page_size: int = Query(20, ge=1, le=100, description="Itens por página"),
    search: str | None = Query(None, description="Buscar por nome, CNPJ ou cidade"),
    uf: str | None = Query(None, max_length=2, description="Filtrar por estado"),
    cidade: str | None = Query(None, description="Filtrar por cidade"),
):
    """
    Lista lojas com paginação e filtros.

    - **search**: Busca por nome, CNPJ ou cidade
    - **uf**: Filtrar por estado (UF)
    - **cidade**: Filtrar por cidade
    """
    query = db.query(Store)

    # Filtros
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Store.nome.ilike(search_term),
                Store.cnpj.ilike(search_term),
                Store.cidade.ilike(search_term),
            )
        )
    if uf:
        query = query.filter(Store.uf == uf.upper())
    if cidade:
        query = query.filter(Store.cidade.ilike(f"%{cidade}%"))

    # Contagem total
    total = query.count()

    # Paginação
    offset = (page - 1) * page_size
    stores = (
        query.order_by(Store.nome)
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return StoreListResponse(
        items=stores,
        total=total,
        page=page,
        page_size=page_size,
        pages=ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/{store_id}", response_model=StoreOut)
@limiter.limit("60/minute")
def get_store(request: Request, store_id: int, db: DbSession):
    """
    Busca uma loja pelo ID.

    - **store_id**: ID da loja
    """
    store = db.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Loja não encontrada")
    return store


@router.get("/cnpj/{cnpj}", response_model=StoreOut)
@limiter.limit("60/minute")
def get_store_by_cnpj(request: Request, cnpj: str, db: DbSession):
    """
    Busca uma loja pelo CNPJ.

    - **cnpj**: CNPJ do estabelecimento
    """
    # Remove formatação do CNPJ
    cnpj_clean = "".join(c for c in cnpj if c.isdigit())
    
    store = db.query(Store).filter(Store.cnpj == cnpj_clean).first()
    if not store:
        raise HTTPException(status_code=404, detail="Loja não encontrada")
    return store


@router.put("/{store_id}", response_model=StoreOut)
@limiter.limit("30/minute")
def update_store(request: Request, store_id: int, payload: StoreUpdate, db: DbSession):
    """
    Atualiza uma loja existente.

    - **store_id**: ID da loja
    - Apenas campos fornecidos serão atualizados
    """
    store = db.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Loja não encontrada")

    # Atualiza apenas campos fornecidos
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "uf" and value:
            value = value.upper()
        setattr(store, field, value)

    db.commit()
    db.refresh(store)

    logger.info(f"Loja atualizada: {store.id}")
    return store


@router.delete("/{store_id}")
@limiter.limit("10/minute")
def delete_store(request: Request, store_id: int, db: DbSession):
    """
    Remove uma loja.

    - **store_id**: ID da loja
    
    ⚠️ Não é possível remover lojas que possuem cupons vinculados.
    """
    store = db.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Loja não encontrada")

    # Verifica se tem cupons vinculados
    if store.cupons:
        raise HTTPException(
            status_code=409,
            detail=f"Não é possível remover: loja possui {len(store.cupons)} cupom(s) vinculado(s)"
        )

    db.delete(store)
    db.commit()

    logger.info(f"Loja removida: {store_id}")
    return {"message": "Loja removida com sucesso", "id": store_id}
