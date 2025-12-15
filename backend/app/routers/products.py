"""Router para operações com produtos."""

import logging
from math import ceil

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import or_

from ..database import DbSession
from ..models import Product
from ..schemas import ProductCreate, ProductOut

logger = logging.getLogger(__name__)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# === Schemas adicionais ===


class ProductUpdate(BaseModel):
    """Schema para atualizar produto."""
    gtin: str | None = Field(None, max_length=32)
    descricao_norm: str | None = Field(None, min_length=1, max_length=255)
    marca: str | None = Field(None, max_length=120)
    categoria: str | None = Field(None, max_length=120)
    unidade_base: str | None = Field(None, max_length=10)


class ProductListResponse(BaseModel):
    """Response para listagem de produtos."""
    items: list[ProductOut]
    total: int
    page: int
    page_size: int
    pages: int


# === Endpoints ===


@router.post("/", response_model=ProductOut, status_code=201)
@limiter.limit("30/minute")
def create_product(request: Request, payload: ProductCreate, db: DbSession):
    """
    Cria um novo produto.

    - **gtin**: Código de barras EAN/GTIN (opcional)
    - **descricao_norm**: Descrição normalizada (obrigatório)
    - **marca**: Marca do produto
    - **categoria**: Categoria do produto
    - **unidade_base**: Unidade base (un, kg, l, etc)
    """
    # Se tem GTIN, verifica se já existe
    if payload.gtin:
        existing = db.query(Product).filter(Product.gtin == payload.gtin).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"Produto com GTIN {payload.gtin} já existe (ID: {existing.id})"
            )

    product = Product(
        gtin=payload.gtin,
        descricao_norm=payload.descricao_norm,
        marca=payload.marca,
        categoria=payload.categoria,
        unidade_base=payload.unidade_base or "un",
    )
    db.add(product)
    db.commit()
    db.refresh(product)

    logger.info(f"Produto criado: {product.id} - {product.descricao_norm}")
    return product


@router.get("/", response_model=ProductListResponse)
@limiter.limit("60/minute")
def list_products(
    request: Request,
    db: DbSession,
    page: int = Query(1, ge=1, description="Número da página"),
    page_size: int = Query(20, ge=1, le=100, description="Itens por página"),
    search: str | None = Query(None, description="Buscar por descrição, GTIN ou marca"),
    categoria: str | None = Query(None, description="Filtrar por categoria"),
    marca: str | None = Query(None, description="Filtrar por marca"),
):
    """
    Lista produtos com paginação e filtros.

    - **search**: Busca por descrição, GTIN ou marca
    - **categoria**: Filtrar por categoria
    - **marca**: Filtrar por marca
    """
    query = db.query(Product)

    # Filtros
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Product.descricao_norm.ilike(search_term),
                Product.gtin.ilike(search_term),
                Product.marca.ilike(search_term),
            )
        )
    if categoria:
        query = query.filter(Product.categoria.ilike(f"%{categoria}%"))
    if marca:
        query = query.filter(Product.marca.ilike(f"%{marca}%"))

    # Contagem total
    total = query.count()

    # Paginação
    offset = (page - 1) * page_size
    products = (
        query.order_by(Product.descricao_norm)
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return ProductListResponse(
        items=products,
        total=total,
        page=page,
        page_size=page_size,
        pages=ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/{product_id}", response_model=ProductOut)
@limiter.limit("60/minute")
def get_product(request: Request, product_id: int, db: DbSession):
    """
    Busca um produto pelo ID.

    - **product_id**: ID do produto
    """
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return product


@router.get("/gtin/{gtin}", response_model=ProductOut)
@limiter.limit("60/minute")
def get_product_by_gtin(request: Request, gtin: str, db: DbSession):
    """
    Busca um produto pelo código de barras (GTIN/EAN).

    - **gtin**: Código de barras
    """
    product = db.query(Product).filter(Product.gtin == gtin).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return product


@router.put("/{product_id}", response_model=ProductOut)
@limiter.limit("30/minute")
def update_product(request: Request, product_id: int, payload: ProductUpdate, db: DbSession):
    """
    Atualiza um produto existente.

    - **product_id**: ID do produto
    - Apenas campos fornecidos serão atualizados
    """
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    # Se está atualizando GTIN, verifica duplicidade
    if payload.gtin and payload.gtin != product.gtin:
        existing = db.query(Product).filter(Product.gtin == payload.gtin).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"GTIN {payload.gtin} já está em uso por outro produto"
            )

    # Atualiza apenas campos fornecidos
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(product, field, value)

    db.commit()
    db.refresh(product)

    logger.info(f"Produto atualizado: {product.id}")
    return product


@router.delete("/{product_id}")
@limiter.limit("10/minute")
def delete_product(request: Request, product_id: int, db: DbSession):
    """
    Remove um produto.

    - **product_id**: ID do produto
    
    ⚠️ Não é possível remover produtos que possuem itens de cupom vinculados.
    """
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    # Verifica se tem itens vinculados
    if product.itens:
        raise HTTPException(
            status_code=409,
            detail=f"Não é possível remover: produto possui {len(product.itens)} item(ns) de cupom vinculado(s)"
        )

    db.delete(product)
    db.commit()

    logger.info(f"Produto removido: {product_id}")
    return {"message": "Produto removido com sucesso", "id": product_id}


@router.get("/{product_id}/prices")
@limiter.limit("60/minute")
def get_product_prices(
    request: Request,
    product_id: int,
    db: DbSession,
    limit: int = Query(10, ge=1, le=100, description="Quantidade de registros"),
):
    """
    Retorna os últimos preços de um produto em diferentes lojas.

    - **product_id**: ID do produto
    - **limit**: Quantidade de registros (default: 10)
    """
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    prices = []
    for price in product.precos[:limit]:
        prices.append({
            "id": price.id,
            "preco_por_unidade": price.preco_por_unidade,
            "unidade_base": price.unidade_base,
            "data_coleta": price.data_coleta,
            "fonte": price.fonte,
            "loja": {
                "id": price.loja.id,
                "nome": price.loja.nome,
                "cidade": price.loja.cidade,
            } if price.loja else None,
        })

    return {
        "product_id": product_id,
        "descricao": product.descricao_norm,
        "prices": prices,
    }
