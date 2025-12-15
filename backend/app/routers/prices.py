"""Router para operações com preços."""

import logging
from datetime import datetime, timedelta
from math import ceil

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import and_, func

from ..database import DbSession
from ..models import Price, Product, Store
from ..schemas import PriceCreate, PriceOut

logger = logging.getLogger(__name__)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# === Schemas adicionais ===


class PriceListResponse(BaseModel):
    """Response para listagem de preços."""
    items: list[PriceOut]
    total: int
    page: int
    page_size: int
    pages: int


class PriceCompareItem(BaseModel):
    """Item de comparação de preço."""
    loja_id: int
    loja_nome: str | None
    loja_cidade: str | None
    preco: float
    data_coleta: datetime


class PriceCompareResponse(BaseModel):
    """Response para comparação de preços."""
    produto_id: int
    produto_descricao: str
    menor_preco: float | None
    maior_preco: float | None
    preco_medio: float | None
    total_lojas: int
    precos: list[PriceCompareItem]


class PriceHistoryItem(BaseModel):
    """Item do histórico de preços."""
    preco: float
    data_coleta: datetime
    loja_nome: str | None


class PriceHistoryResponse(BaseModel):
    """Response para histórico de preços."""
    produto_id: int
    produto_descricao: str
    loja_id: int | None
    loja_nome: str | None
    historico: list[PriceHistoryItem]


# === Endpoints ===


@router.post("/", response_model=PriceOut, status_code=201)
@limiter.limit("30/minute")
def create_price(request: Request, payload: PriceCreate, db: DbSession):
    """
    Registra um novo preço.

    - **produto_id**: ID do produto (obrigatório)
    - **loja_id**: ID da loja (obrigatório)
    - **preco_por_unidade**: Preço por unidade (obrigatório)
    - **unidade_base**: Unidade base (un, kg, l, etc)
    - **fonte**: Fonte do preço (cupom, manual, api)
    - **cupom_id**: Chave do cupom de origem (opcional)
    """
    # Verifica se produto existe
    product = db.get(Product, payload.produto_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    # Verifica se loja existe
    store = db.get(Store, payload.loja_id)
    if not store:
        raise HTTPException(status_code=404, detail="Loja não encontrada")

    price = Price(
        produto_id=payload.produto_id,
        loja_id=payload.loja_id,
        preco_por_unidade=payload.preco_por_unidade,
        unidade_base=payload.unidade_base or product.unidade_base,
        fonte=payload.fonte,
        cupom_id=payload.cupom_id,
    )
    db.add(price)
    db.commit()
    db.refresh(price)

    logger.info(f"Preço registrado: produto={payload.produto_id}, loja={payload.loja_id}, valor={payload.preco_por_unidade}")
    return price


@router.get("/", response_model=PriceListResponse)
@limiter.limit("60/minute")
def list_prices(
    request: Request,
    db: DbSession,
    page: int = Query(1, ge=1, description="Número da página"),
    page_size: int = Query(20, ge=1, le=100, description="Itens por página"),
    produto_id: int | None = Query(None, description="Filtrar por produto"),
    loja_id: int | None = Query(None, description="Filtrar por loja"),
    fonte: str | None = Query(None, description="Filtrar por fonte"),
    data_inicio: datetime | None = Query(None, description="Data inicial"),
    data_fim: datetime | None = Query(None, description="Data final"),
):
    """
    Lista preços com paginação e filtros.

    - **produto_id**: Filtrar por produto
    - **loja_id**: Filtrar por loja
    - **fonte**: Filtrar por fonte (cupom, manual, api)
    - **data_inicio**: Data inicial do período
    - **data_fim**: Data final do período
    """
    query = db.query(Price)

    # Filtros
    if produto_id:
        query = query.filter(Price.produto_id == produto_id)
    if loja_id:
        query = query.filter(Price.loja_id == loja_id)
    if fonte:
        query = query.filter(Price.fonte == fonte)
    if data_inicio:
        query = query.filter(Price.data_coleta >= data_inicio)
    if data_fim:
        query = query.filter(Price.data_coleta <= data_fim)

    # Contagem total
    total = query.count()

    # Paginação
    offset = (page - 1) * page_size
    prices = (
        query.order_by(Price.data_coleta.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return PriceListResponse(
        items=prices,
        total=total,
        page=page,
        page_size=page_size,
        pages=ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/compare/{produto_id}", response_model=PriceCompareResponse)
@limiter.limit("60/minute")
def compare_prices(
    request: Request,
    produto_id: int,
    db: DbSession,
    dias: int = Query(7, ge=1, le=90, description="Considerar preços dos últimos N dias"),
):
    """
    Compara preços de um produto em diferentes lojas.

    - **produto_id**: ID do produto
    - **dias**: Considerar preços dos últimos N dias (default: 7)
    
    Retorna o menor preço, maior preço, média e lista de preços por loja.
    """
    product = db.get(Product, produto_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    # Data limite
    data_limite = datetime.utcnow() - timedelta(days=dias)

    # Busca o preço mais recente de cada loja
    # Subquery para pegar o preço mais recente por loja
    subquery = (
        db.query(
            Price.loja_id,
            func.max(Price.data_coleta).label("max_data")
        )
        .filter(Price.produto_id == produto_id)
        .filter(Price.data_coleta >= data_limite)
        .group_by(Price.loja_id)
        .subquery()
    )

    # Query principal
    prices = (
        db.query(Price)
        .join(
            subquery,
            and_(
                Price.loja_id == subquery.c.loja_id,
                Price.data_coleta == subquery.c.max_data,
                Price.produto_id == produto_id,
            )
        )
        .all()
    )

    if not prices:
        return PriceCompareResponse(
            produto_id=produto_id,
            produto_descricao=product.descricao_norm,
            menor_preco=None,
            maior_preco=None,
            preco_medio=None,
            total_lojas=0,
            precos=[],
        )

    # Calcula estatísticas
    valores = [p.preco_por_unidade for p in prices]
    
    precos_list = []
    for p in sorted(prices, key=lambda x: x.preco_por_unidade):
        precos_list.append(PriceCompareItem(
            loja_id=p.loja_id,
            loja_nome=p.loja.nome if p.loja else None,
            loja_cidade=p.loja.cidade if p.loja else None,
            preco=p.preco_por_unidade,
            data_coleta=p.data_coleta,
        ))

    return PriceCompareResponse(
        produto_id=produto_id,
        produto_descricao=product.descricao_norm,
        menor_preco=min(valores),
        maior_preco=max(valores),
        preco_medio=sum(valores) / len(valores),
        total_lojas=len(prices),
        precos=precos_list,
    )


@router.get("/history/{produto_id}", response_model=PriceHistoryResponse)
@limiter.limit("60/minute")
def price_history(
    request: Request,
    produto_id: int,
    db: DbSession,
    loja_id: int | None = Query(None, description="Filtrar por loja específica"),
    dias: int = Query(30, ge=1, le=365, description="Histórico dos últimos N dias"),
    limit: int = Query(100, ge=1, le=500, description="Máximo de registros"),
):
    """
    Retorna o histórico de preços de um produto.

    - **produto_id**: ID do produto
    - **loja_id**: Filtrar por loja específica (opcional)
    - **dias**: Histórico dos últimos N dias (default: 30)
    - **limit**: Máximo de registros (default: 100)
    """
    product = db.get(Product, produto_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    # Data limite
    data_limite = datetime.utcnow() - timedelta(days=dias)

    # Query
    query = (
        db.query(Price)
        .filter(Price.produto_id == produto_id)
        .filter(Price.data_coleta >= data_limite)
    )

    store = None
    if loja_id:
        store = db.get(Store, loja_id)
        if not store:
            raise HTTPException(status_code=404, detail="Loja não encontrada")
        query = query.filter(Price.loja_id == loja_id)

    prices = (
        query.order_by(Price.data_coleta.desc())
        .limit(limit)
        .all()
    )

    historico = []
    for p in prices:
        historico.append(PriceHistoryItem(
            preco=p.preco_por_unidade,
            data_coleta=p.data_coleta,
            loja_nome=p.loja.nome if p.loja else None,
        ))

    return PriceHistoryResponse(
        produto_id=produto_id,
        produto_descricao=product.descricao_norm,
        loja_id=loja_id,
        loja_nome=store.nome if store else None,
        historico=historico,
    )


@router.get("/{price_id}", response_model=PriceOut)
@limiter.limit("60/minute")
def get_price(request: Request, price_id: int, db: DbSession):
    """
    Busca um registro de preço pelo ID.

    - **price_id**: ID do registro de preço
    """
    price = db.get(Price, price_id)
    if not price:
        raise HTTPException(status_code=404, detail="Preço não encontrado")
    return price


@router.delete("/{price_id}")
@limiter.limit("10/minute")
def delete_price(request: Request, price_id: int, db: DbSession):
    """
    Remove um registro de preço.

    - **price_id**: ID do registro de preço
    """
    price = db.get(Price, price_id)
    if not price:
        raise HTTPException(status_code=404, detail="Preço não encontrado")

    db.delete(price)
    db.commit()

    logger.info(f"Preço removido: {price_id}")
    return {"message": "Preço removido com sucesso", "id": price_id}
