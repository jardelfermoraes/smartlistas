"""Router para operações com produtos canônicos."""

import logging
from typing import List, Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func

from ..database import DbSession
from ..models import CanonicalProduct, Price, ProductAlias, Store
from ..services.product_normalizer import normalize_existing_products

logger = logging.getLogger(__name__)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# === Schemas ===

class CanonicalProductOut(BaseModel):
    """Schema de saída para produto canônico."""
    id: int
    nome: str
    marca: Optional[str] = None
    categoria: Optional[str] = None
    subcategoria: Optional[str] = None
    unidade_padrao: str
    quantidade_padrao: Optional[float] = None
    gtin_principal: Optional[str] = None
    alias_count: int = 0
    preco_atual: Optional[float] = None  # Preço mais recente (menor entre lojas)
    preco_data: Optional[str] = None  # Data do preço mais recente
    
    class Config:
        from_attributes = True


class CanonicalProductCreate(BaseModel):
    """Schema para criar produto canônico."""
    nome: str
    marca: Optional[str] = None
    categoria: Optional[str] = None
    subcategoria: Optional[str] = None
    unidade_padrao: str = "un"
    quantidade_padrao: Optional[float] = None
    gtin_principal: Optional[str] = None


class CanonicalProductUpdate(BaseModel):
    """Schema para atualizar produto canônico."""
    nome: Optional[str] = None
    marca: Optional[str] = None
    categoria: Optional[str] = None
    subcategoria: Optional[str] = None
    unidade_padrao: Optional[str] = None
    quantidade_padrao: Optional[float] = None


class AliasOut(BaseModel):
    """Schema de saída para alias."""
    id: int
    descricao_original: str
    descricao_normalizada: str
    loja_nome: Optional[str] = None
    confianca: float
    
    class Config:
        from_attributes = True


class PriceComparisonOut(BaseModel):
    """Schema para comparação de preços."""
    loja_id: int
    loja_nome: str
    loja_fantasia: Optional[str] = None
    loja_cidade: Optional[str] = None
    preco: float
    data_coleta: str


class ProductDetailOut(BaseModel):
    """Schema completo com aliases e preços."""
    id: int
    nome: str
    marca: Optional[str] = None
    categoria: Optional[str] = None
    subcategoria: Optional[str] = None
    unidade_padrao: str
    quantidade_padrao: Optional[float] = None
    gtin_principal: Optional[str] = None
    aliases: List[AliasOut] = []
    precos: List[PriceComparisonOut] = []
    

class CanonicalListResponse(BaseModel):
    """Resposta paginada de produtos canônicos."""
    items: List[CanonicalProductOut]
    total: int
    page: int
    page_size: int
    pages: int


class CategoryCountOut(BaseModel):
    categoria: str
    total: int


class TopInsertedOut(BaseModel):
    canonical_id: int
    nome: str
    categoria: Optional[str] = None
    inserts: int


class CanonicalKpisOut(BaseModel):
    total_products: int
    categories: List[CategoryCountOut]
    new_last_7d: int
    new_last_30d: int
    top_inserted: List[TopInsertedOut]


# === Endpoints ===

@router.get("/", response_model=CanonicalListResponse)
@limiter.limit("60/minute")
def list_canonical_products(
    request: Request,
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    categoria: Optional[str] = None,
):
    """Lista produtos canônicos com paginação e filtros."""
    query = db.query(CanonicalProduct)
    
    if search:
        query = query.filter(
            CanonicalProduct.nome.ilike(f"%{search}%") |
            CanonicalProduct.marca.ilike(f"%{search}%")
        )
    
    if categoria:
        query = query.filter(CanonicalProduct.categoria == categoria)
    
    total = query.count()
    pages = (total + page_size - 1) // page_size
    
    items = query.order_by(CanonicalProduct.nome).offset((page - 1) * page_size).limit(page_size).all()
    
    # Conta aliases e busca preço mais recente para cada produto
    result = []
    for item in items:
        alias_count = db.query(ProductAlias).filter(ProductAlias.canonical_id == item.id).count()
        
        # Busca o preço mais recente (menor preço entre as lojas com dados recentes)
        # Subquery para pegar a data mais recente de cada loja
        subquery = db.query(
            Price.loja_id,
            func.max(Price.data_coleta).label("max_date")
        ).filter(
            Price.canonical_id == item.id
        ).group_by(Price.loja_id).subquery()
        
        # Busca os preços mais recentes de cada loja
        recent_prices = db.query(Price).join(
            subquery,
            (Price.loja_id == subquery.c.loja_id) & 
            (Price.data_coleta == subquery.c.max_date) &
            (Price.canonical_id == item.id)
        ).all()
        
        # Pega o menor preço entre os mais recentes
        preco_atual = None
        preco_data = None
        if recent_prices:
            menor_preco = min(recent_prices, key=lambda p: p.preco_por_unidade)
            preco_atual = menor_preco.preco_por_unidade
            preco_data = menor_preco.data_coleta.isoformat() if menor_preco.data_coleta else None
        
        result.append(CanonicalProductOut(
            id=item.id,
            nome=item.nome,
            marca=item.marca,
            categoria=item.categoria,
            subcategoria=item.subcategoria,
            unidade_padrao=item.unidade_padrao,
            quantidade_padrao=item.quantidade_padrao,
            gtin_principal=item.gtin_principal,
            alias_count=alias_count,
            preco_atual=preco_atual,
            preco_data=preco_data
        ))
    
    return CanonicalListResponse(
        items=result,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages
    )


@router.get("/categories")
@limiter.limit("60/minute")
def list_categories(request: Request, db: DbSession):
    """Lista todas as categorias disponíveis."""
    categories = db.query(CanonicalProduct.categoria).filter(
        CanonicalProduct.categoria.isnot(None)
    ).distinct().all()
    return [c[0] for c in categories if c[0]]


@router.get("/kpis", response_model=CanonicalKpisOut)
@limiter.limit("60/minute")
def canonical_kpis(request: Request, db: DbSession):
    total_products = db.query(func.count(CanonicalProduct.id)).scalar() or 0

    categories_rows = (
        db.query(CanonicalProduct.categoria, func.count(CanonicalProduct.id))
        .filter(CanonicalProduct.categoria.isnot(None))
        .group_by(CanonicalProduct.categoria)
        .order_by(func.count(CanonicalProduct.id).desc())
        .all()
    )
    categories = [CategoryCountOut(categoria=c or "(Sem categoria)", total=int(t)) for c, t in categories_rows]

    now = datetime.utcnow()
    new_last_7d = (
        db.query(func.count(CanonicalProduct.id))
        .filter(CanonicalProduct.created_at >= (now - timedelta(days=7)))
        .scalar()
        or 0
    )
    new_last_30d = (
        db.query(func.count(CanonicalProduct.id))
        .filter(CanonicalProduct.created_at >= (now - timedelta(days=30)))
        .scalar()
        or 0
    )

    top_rows = (
        db.query(
            Price.canonical_id,
            func.count(func.distinct(Price.cupom_id)).label("inserts"),
            CanonicalProduct.nome,
            CanonicalProduct.categoria,
        )
        .join(CanonicalProduct, CanonicalProduct.id == Price.canonical_id)
        .filter(Price.cupom_id.isnot(None))
        .group_by(Price.canonical_id, CanonicalProduct.nome, CanonicalProduct.categoria)
        .order_by(func.count(func.distinct(Price.cupom_id)).desc())
        .limit(10)
        .all()
    )
    top_inserted = [
        TopInsertedOut(
            canonical_id=int(cid),
            nome=nome,
            categoria=categoria,
            inserts=int(ins),
        )
        for cid, ins, nome, categoria in top_rows
    ]

    return CanonicalKpisOut(
        total_products=int(total_products),
        categories=categories,
        new_last_7d=int(new_last_7d),
        new_last_30d=int(new_last_30d),
        top_inserted=top_inserted,
    )


@router.get("/duplicates")
@limiter.limit("30/minute")
def find_duplicates(request: Request, db: DbSession):
    """Encontra produtos canônicos duplicados."""
    from ..services.product_agent import find_duplicate_canonicals
    
    duplicates = find_duplicate_canonicals(db)
    return {"duplicates": duplicates, "total_groups": len(duplicates)}


@router.post("/merge-duplicates")
@limiter.limit("5/minute")
def merge_duplicates(request: Request, db: DbSession):
    """Automaticamente mescla produtos canônicos duplicados."""
    from ..services.product_agent import auto_merge_duplicates
    
    result = auto_merge_duplicates(db)
    return result


@router.get("/{canonical_id}", response_model=CanonicalProductOut)
@limiter.limit("60/minute")
def get_canonical_product(request: Request, canonical_id: int, db: DbSession):
    """Obtém detalhes de um produto canônico."""
    product = db.get(CanonicalProduct, canonical_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    
    alias_count = db.query(ProductAlias).filter(ProductAlias.canonical_id == canonical_id).count()
    
    return CanonicalProductOut(
        id=product.id,
        nome=product.nome,
        marca=product.marca,
        categoria=product.categoria,
        subcategoria=product.subcategoria,
        unidade_padrao=product.unidade_padrao,
        quantidade_padrao=product.quantidade_padrao,
        gtin_principal=product.gtin_principal,
        alias_count=alias_count
    )


@router.get("/{canonical_id}/details", response_model=ProductDetailOut)
@limiter.limit("60/minute")
def get_canonical_product_details(request: Request, canonical_id: int, db: DbSession):
    """Obtém detalhes completos de um produto canônico com aliases e preços."""
    product = db.get(CanonicalProduct, canonical_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    
    # Busca aliases
    aliases = db.query(ProductAlias).filter(ProductAlias.canonical_id == canonical_id).all()
    aliases_out = []
    for alias in aliases:
        loja = db.get(Store, alias.loja_id) if alias.loja_id else None
        aliases_out.append(AliasOut(
            id=alias.id,
            descricao_original=alias.descricao_original,
            descricao_normalizada=alias.descricao_normalizada,
            loja_nome=loja.nome_fantasia or loja.nome if loja else None,
            confianca=alias.confianca
        ))
    
    # Busca preços mais recentes de cada loja
    subquery = db.query(
        Price.loja_id,
        func.max(Price.data_coleta).label("max_date")
    ).filter(
        Price.canonical_id == canonical_id
    ).group_by(Price.loja_id).subquery()
    
    prices = db.query(Price).join(
        subquery,
        (Price.loja_id == subquery.c.loja_id) & 
        (Price.data_coleta == subquery.c.max_date) &
        (Price.canonical_id == canonical_id)
    ).all()
    
    precos_out = []
    for price in prices:
        loja = db.get(Store, price.loja_id)
        precos_out.append(PriceComparisonOut(
            loja_id=price.loja_id,
            loja_nome=loja.nome if loja else "Desconhecida",
            loja_fantasia=loja.nome_fantasia if loja else None,
            loja_cidade=loja.cidade if loja else None,
            preco=price.preco_por_unidade,
            data_coleta=price.data_coleta.isoformat() if price.data_coleta else ""
        ))
    
    # Ordena por preço
    precos_out.sort(key=lambda x: x.preco)
    
    return ProductDetailOut(
        id=product.id,
        nome=product.nome,
        marca=product.marca,
        categoria=product.categoria,
        subcategoria=product.subcategoria,
        unidade_padrao=product.unidade_padrao,
        quantidade_padrao=product.quantidade_padrao,
        gtin_principal=product.gtin_principal,
        aliases=aliases_out,
        precos=precos_out
    )


@router.get("/{canonical_id}/aliases", response_model=List[AliasOut])
@limiter.limit("60/minute")
def get_product_aliases(request: Request, canonical_id: int, db: DbSession):
    """Lista aliases de um produto canônico."""
    aliases = db.query(ProductAlias).filter(ProductAlias.canonical_id == canonical_id).all()
    
    result = []
    for alias in aliases:
        loja_nome = None
        if alias.loja_id:
            loja = db.get(Store, alias.loja_id)
            loja_nome = loja.nome if loja else None
        
        result.append(AliasOut(
            id=alias.id,
            descricao_original=alias.descricao_original,
            descricao_normalizada=alias.descricao_normalizada,
            loja_nome=loja_nome,
            confianca=alias.confianca
        ))
    
    return result


@router.get("/{canonical_id}/prices", response_model=List[PriceComparisonOut])
@limiter.limit("60/minute")
def get_product_prices(request: Request, canonical_id: int, db: DbSession):
    """Obtém preços de um produto canônico em diferentes lojas."""
    # Busca o preço mais recente de cada loja
    subquery = db.query(
        Price.loja_id,
        func.max(Price.data_coleta).label("max_date")
    ).filter(
        Price.canonical_id == canonical_id
    ).group_by(Price.loja_id).subquery()
    
    prices = db.query(Price).join(
        subquery,
        (Price.loja_id == subquery.c.loja_id) & 
        (Price.data_coleta == subquery.c.max_date) &
        (Price.canonical_id == canonical_id)
    ).all()
    
    result = []
    for price in prices:
        loja = db.get(Store, price.loja_id)
        result.append(PriceComparisonOut(
            loja_id=price.loja_id,
            loja_nome=loja.nome if loja else "Desconhecida",
            loja_cidade=loja.cidade if loja else None,
            preco=price.preco_por_unidade,
            data_coleta=price.data_coleta.isoformat() if price.data_coleta else ""
        ))
    
    # Ordena por preço
    result.sort(key=lambda x: x.preco)
    return result


@router.post("/", response_model=CanonicalProductOut)
@limiter.limit("30/minute")
def create_canonical_product(request: Request, payload: CanonicalProductCreate, db: DbSession):
    """Cria um novo produto canônico."""
    product = CanonicalProduct(
        nome=payload.nome,
        marca=payload.marca,
        categoria=payload.categoria,
        subcategoria=payload.subcategoria,
        unidade_padrao=payload.unidade_padrao,
        quantidade_padrao=payload.quantidade_padrao,
        gtin_principal=payload.gtin_principal
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    
    return CanonicalProductOut(
        id=product.id,
        nome=product.nome,
        marca=product.marca,
        categoria=product.categoria,
        subcategoria=product.subcategoria,
        unidade_padrao=product.unidade_padrao,
        quantidade_padrao=product.quantidade_padrao,
        gtin_principal=product.gtin_principal,
        alias_count=0
    )


@router.put("/{canonical_id}", response_model=CanonicalProductOut)
@limiter.limit("30/minute")
def update_canonical_product(
    request: Request, 
    canonical_id: int, 
    payload: CanonicalProductUpdate, 
    db: DbSession
):
    """Atualiza um produto canônico."""
    product = db.get(CanonicalProduct, canonical_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    
    if payload.nome is not None:
        product.nome = payload.nome
    if payload.marca is not None:
        product.marca = payload.marca
    if payload.categoria is not None:
        product.categoria = payload.categoria
    if payload.subcategoria is not None:
        product.subcategoria = payload.subcategoria
    if payload.unidade_padrao is not None:
        product.unidade_padrao = payload.unidade_padrao
    if payload.quantidade_padrao is not None:
        product.quantidade_padrao = payload.quantidade_padrao
    
    db.commit()
    db.refresh(product)
    
    alias_count = db.query(ProductAlias).filter(ProductAlias.canonical_id == canonical_id).count()
    
    return CanonicalProductOut(
        id=product.id,
        nome=product.nome,
        marca=product.marca,
        categoria=product.categoria,
        subcategoria=product.subcategoria,
        unidade_padrao=product.unidade_padrao,
        quantidade_padrao=product.quantidade_padrao,
        gtin_principal=product.gtin_principal,
        alias_count=alias_count
    )


@router.post("/{canonical_id}/merge/{other_id}")
@limiter.limit("10/minute")
def merge_canonical_products(
    request: Request,
    canonical_id: int,
    other_id: int,
    db: DbSession
):
    """Mescla dois produtos canônicos (move aliases e preços do other para o canonical)."""
    if canonical_id == other_id:
        raise HTTPException(status_code=400, detail="Não é possível mesclar um produto consigo mesmo")
    
    canonical = db.get(CanonicalProduct, canonical_id)
    other = db.get(CanonicalProduct, other_id)
    
    if not canonical or not other:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    
    # Move aliases
    aliases_moved = db.query(ProductAlias).filter(
        ProductAlias.canonical_id == other_id
    ).update({"canonical_id": canonical_id})
    
    # Move preços
    prices_moved = db.query(Price).filter(
        Price.canonical_id == other_id
    ).update({"canonical_id": canonical_id})
    
    # Remove o produto duplicado
    db.delete(other)
    db.commit()
    
    logger.info(f"Mesclado produto {other_id} em {canonical_id}: {aliases_moved} aliases, {prices_moved} preços")
    
    return {
        "message": f"Produtos mesclados com sucesso",
        "aliases_moved": aliases_moved,
        "prices_moved": prices_moved
    }


@router.post("/normalize-batch")
@limiter.limit("5/minute")
def normalize_products_batch(request: Request, db: DbSession, batch_size: int = 50):
    """Normaliza um lote de produtos existentes."""
    stats = normalize_existing_products(db, batch_size)
    return stats


@router.post("/renormalize/{canonical_id}")
@limiter.limit("30/minute")
def renormalize_product(request: Request, canonical_id: int, db: DbSession):
    """Renormaliza um produto canônico usando o agente especializado."""
    from ..services.product_agent import renormalize_canonical_product
    
    try:
        result = renormalize_canonical_product(db, canonical_id)
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao renormalizar produto {canonical_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/renormalize-batch")
@limiter.limit("5/minute")
def renormalize_batch(request: Request, db: DbSession, batch_size: int = Query(20, le=50)):
    """Renormaliza um lote de produtos canônicos existentes usando o agente especializado."""
    from ..services.product_agent import ProductNormalizationAgent
    
    # Busca produtos que parecem mal normalizados (nomes curtos ou genéricos)
    products = db.query(CanonicalProduct).filter(
        func.length(CanonicalProduct.nome) < 20
    ).limit(batch_size).all()
    
    if not products:
        # Se não tem nomes curtos, pega os mais antigos
        products = db.query(CanonicalProduct).order_by(
            CanonicalProduct.id
        ).limit(batch_size).all()
    
    agent = ProductNormalizationAgent(db, use_ai=True)
    stats = {"processed": 0, "updated": 0, "errors": 0, "details": []}
    
    for product in products:
        try:
            # Busca alias para contexto
            alias = db.query(ProductAlias).filter(
                ProductAlias.canonical_id == product.id
            ).first()
            
            if not alias:
                stats["processed"] += 1
                continue
            
            # Usa o agente para normalizar
            info = agent.normalize(alias.descricao_original)
            
            if info and info.get('nome'):
                old_nome = product.nome
                new_nome = info.get('nome')
                
                # Só atualiza se o novo nome for diferente E mais descritivo (ou igual tamanho)
                # Evita simplificar demais (ex: "Biscoito de Leite" -> "Biscoito")
                if new_nome.lower() != old_nome.lower() and len(new_nome) >= len(old_nome) * 0.8:
                    product.nome = new_nome
                    product.marca = info.get('marca') or product.marca
                    product.categoria = info.get('categoria') or product.categoria
                    product.subcategoria = info.get('subcategoria') or product.subcategoria
                    product.unidade_padrao = info.get('unidade') or product.unidade_padrao
                    product.quantidade_padrao = info.get('quantidade') or product.quantidade_padrao
                    
                    stats["updated"] += 1
                    stats["details"].append({
                        "id": product.id,
                        "old": old_nome,
                        "new": new_nome
                    })
            
            stats["processed"] += 1
            
        except Exception as e:
            logger.error(f"Erro ao renormalizar {product.id}: {e}")
            stats["errors"] += 1
    
    db.commit()
    return stats
