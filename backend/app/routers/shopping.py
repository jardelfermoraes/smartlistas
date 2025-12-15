"""
Router para gerenciamento de listas de compras.
"""

import logging
from typing import List, Optional
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import (
    ShoppingList,
    ShoppingListItem,
    ShoppingListStatus,
    OptimizedShoppingItem,
    CanonicalProduct,
    User,
    Store,
)
from ..services.shopping_optimizer import ShoppingOptimizer
from .auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# SCHEMAS
# =============================================================================

class ShoppingListItemCreate(BaseModel):
    """Schema para criar item da lista."""
    canonical_id: int
    quantity: float = 1.0
    unit: str = "un"
    notes: Optional[str] = None


class ShoppingListItemOut(BaseModel):
    """Schema de saída para item da lista."""
    id: int
    canonical_id: int
    product_name: str
    product_size: Optional[str] = None  # Ex: "500ml", "1kg"
    product_brand: Optional[str] = None
    quantity: float
    unit: str
    notes: Optional[str]
    best_price: Optional[float]
    best_store_name: Optional[str]

    class Config:
        from_attributes = True


class ShoppingListCreate(BaseModel):
    """Schema para criar lista de compras."""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    max_stores: int = Field(default=3, ge=1, le=5)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_km: float = Field(default=10.0, ge=1, le=50)


class ShoppingListUpdate(BaseModel):
    """Schema para atualizar lista de compras."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    max_stores: Optional[int] = Field(None, ge=1, le=5)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_km: Optional[float] = Field(None, ge=1, le=50)


class ShoppingListOut(BaseModel):
    """Schema de saída para lista de compras."""
    id: int
    name: str
    description: Optional[str]
    status: str
    max_stores: int
    latitude: Optional[float]
    longitude: Optional[float]
    radius_km: float
    total_estimated: Optional[float]
    total_savings: Optional[float]
    optimized_at: Optional[datetime]
    items_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ShoppingListDetailOut(ShoppingListOut):
    """Schema detalhado com itens."""
    items: List[ShoppingListItemOut]


class OptimizedItemOut(BaseModel):
    """Schema para item otimizado."""
    item_id: int
    product_name: str
    quantity: float
    price: float
    subtotal: float
    worst_price: float = 0.0
    worst_store_name: str = ""
    item_savings: float = 0.0


class StoreAllocationOut(BaseModel):
    """Schema para alocação por loja."""
    store_id: int
    store_name: str
    store_address: str
    items: List[OptimizedItemOut]
    total: float


class OptimizationResultOut(BaseModel):
    """Schema para resultado da otimização."""
    success: bool
    message: str
    allocations: List[StoreAllocationOut]
    total_cost: float
    total_if_single_store: float
    savings: float
    savings_percent: float
    total_worst_cost: float = 0.0
    potential_savings: float = 0.0
    potential_savings_percent: float = 0.0
    items_without_price: List[int]


# =============================================================================
# ENDPOINTS - LISTAS
# =============================================================================

@router.get("", response_model=List[ShoppingListOut])
def list_shopping_lists(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista todas as listas de compras do usuário."""
    query = db.query(ShoppingList).filter(ShoppingList.user_id == current_user.id)
    
    if status_filter:
        query = query.filter(ShoppingList.status == status_filter)
    
    lists = query.order_by(ShoppingList.updated_at.desc()).all()
    
    return [
        ShoppingListOut(
            id=sl.id,
            name=sl.name,
            description=sl.description,
            status=sl.status,
            max_stores=sl.max_stores,
            latitude=sl.latitude,
            longitude=sl.longitude,
            radius_km=sl.radius_km,
            total_estimated=sl.total_estimated,
            total_savings=sl.total_savings,
            optimized_at=sl.optimized_at,
            items_count=len(sl.items),
            created_at=sl.created_at,
            updated_at=sl.updated_at
        )
        for sl in lists
    ]


@router.post("", response_model=ShoppingListOut, status_code=status.HTTP_201_CREATED)
def create_shopping_list(
    data: ShoppingListCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria uma nova lista de compras."""
    shopping_list = ShoppingList(
        user_id=current_user.id,
        name=data.name,
        description=data.description,
        max_stores=data.max_stores,
        latitude=data.latitude,
        longitude=data.longitude,
        radius_km=data.radius_km,
        status=ShoppingListStatus.DRAFT.value
    )
    
    db.add(shopping_list)
    db.commit()
    db.refresh(shopping_list)
    
    return ShoppingListOut(
        id=shopping_list.id,
        name=shopping_list.name,
        description=shopping_list.description,
        status=shopping_list.status,
        max_stores=shopping_list.max_stores,
        latitude=shopping_list.latitude,
        longitude=shopping_list.longitude,
        radius_km=shopping_list.radius_km,
        total_estimated=shopping_list.total_estimated,
        total_savings=shopping_list.total_savings,
        optimized_at=shopping_list.optimized_at,
        items_count=0,
        created_at=shopping_list.created_at,
        updated_at=shopping_list.updated_at
    )


@router.get("/{list_id}", response_model=ShoppingListDetailOut)
def get_shopping_list(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém detalhes de uma lista de compras."""
    shopping_list = (
        db.query(ShoppingList)
        .options(joinedload(ShoppingList.items).joinedload(ShoppingListItem.canonical_product))
        .filter(ShoppingList.id == list_id, ShoppingList.user_id == current_user.id)
        .first()
    )
    
    if not shopping_list:
        raise HTTPException(status_code=404, detail="Lista não encontrada")
    
    items = []
    for item in shopping_list.items:
        best_store_name = None
        if item.best_store_id:
            store = db.get(Store, item.best_store_id)
            best_store_name = store.nome_fantasia or store.razao_social if store else None
        
        # Formata o tamanho do produto
        product_size = None
        if item.canonical_product and item.canonical_product.quantidade_padrao:
            qty = item.canonical_product.quantidade_padrao
            unit = item.canonical_product.unidade_padrao or "un"
            qty_str = str(int(qty)) if qty == int(qty) else f"{qty:.1f}"
            product_size = f"{qty_str}{unit}"
        
        items.append(ShoppingListItemOut(
            id=item.id,
            canonical_id=item.canonical_id,
            product_name=item.canonical_product.nome if item.canonical_product else "Produto não encontrado",
            product_size=product_size,
            product_brand=item.canonical_product.marca if item.canonical_product else None,
            quantity=item.quantity,
            unit=item.unit,
            notes=item.notes,
            best_price=item.best_price,
            best_store_name=best_store_name
        ))
    
    return ShoppingListDetailOut(
        id=shopping_list.id,
        name=shopping_list.name,
        description=shopping_list.description,
        status=shopping_list.status,
        max_stores=shopping_list.max_stores,
        latitude=shopping_list.latitude,
        longitude=shopping_list.longitude,
        radius_km=shopping_list.radius_km,
        total_estimated=shopping_list.total_estimated,
        total_savings=shopping_list.total_savings,
        optimized_at=shopping_list.optimized_at,
        items_count=len(items),
        items=items,
        created_at=shopping_list.created_at,
        updated_at=shopping_list.updated_at
    )


@router.put("/{list_id}", response_model=ShoppingListOut)
def update_shopping_list(
    list_id: int,
    data: ShoppingListUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza uma lista de compras."""
    shopping_list = db.query(ShoppingList).filter(
        ShoppingList.id == list_id,
        ShoppingList.user_id == current_user.id
    ).first()
    
    if not shopping_list:
        raise HTTPException(status_code=404, detail="Lista não encontrada")
    
    # Atualiza campos
    if data.name is not None:
        shopping_list.name = data.name
    if data.description is not None:
        shopping_list.description = data.description
    if data.max_stores is not None:
        shopping_list.max_stores = data.max_stores
    if data.latitude is not None:
        shopping_list.latitude = data.latitude
    if data.longitude is not None:
        shopping_list.longitude = data.longitude
    if data.radius_km is not None:
        shopping_list.radius_km = data.radius_km
    
    # Se mudou configuração, volta para draft
    if data.max_stores is not None or data.latitude is not None or data.longitude is not None:
        if shopping_list.status == ShoppingListStatus.OPTIMIZED.value:
            shopping_list.status = ShoppingListStatus.DRAFT.value
    
    db.commit()
    db.refresh(shopping_list)
    
    return ShoppingListOut(
        id=shopping_list.id,
        name=shopping_list.name,
        description=shopping_list.description,
        status=shopping_list.status,
        max_stores=shopping_list.max_stores,
        latitude=shopping_list.latitude,
        longitude=shopping_list.longitude,
        radius_km=shopping_list.radius_km,
        total_estimated=shopping_list.total_estimated,
        total_savings=shopping_list.total_savings,
        optimized_at=shopping_list.optimized_at,
        items_count=len(shopping_list.items),
        created_at=shopping_list.created_at,
        updated_at=shopping_list.updated_at
    )


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shopping_list(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exclui uma lista de compras."""
    shopping_list = db.query(ShoppingList).filter(
        ShoppingList.id == list_id,
        ShoppingList.user_id == current_user.id
    ).first()
    
    if not shopping_list:
        raise HTTPException(status_code=404, detail="Lista não encontrada")
    
    db.delete(shopping_list)
    db.commit()


# =============================================================================
# ENDPOINTS - ITENS
# =============================================================================

@router.post("/{list_id}/items", response_model=ShoppingListItemOut, status_code=status.HTTP_201_CREATED)
def add_item(
    list_id: int,
    data: ShoppingListItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Adiciona um item à lista de compras."""
    shopping_list = db.query(ShoppingList).filter(
        ShoppingList.id == list_id,
        ShoppingList.user_id == current_user.id
    ).first()
    
    if not shopping_list:
        raise HTTPException(status_code=404, detail="Lista não encontrada")
    
    # Verifica se o produto canônico existe
    product = db.get(CanonicalProduct, data.canonical_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    
    # Verifica se já existe na lista
    existing = db.query(ShoppingListItem).filter(
        ShoppingListItem.shopping_list_id == list_id,
        ShoppingListItem.canonical_id == data.canonical_id
    ).first()
    
    if existing:
        # Atualiza quantidade
        existing.quantity += data.quantity
        if data.notes:
            existing.notes = data.notes
        db.commit()
        db.refresh(existing)
        item = existing
    else:
        # Cria novo item
        item = ShoppingListItem(
            shopping_list_id=list_id,
            canonical_id=data.canonical_id,
            quantity=data.quantity,
            unit=data.unit,
            notes=data.notes
        )
        db.add(item)
        db.commit()
        db.refresh(item)
    
    # Volta status para draft se estava otimizado
    if shopping_list.status == ShoppingListStatus.OPTIMIZED.value:
        shopping_list.status = ShoppingListStatus.DRAFT.value
        db.commit()
    
    return ShoppingListItemOut(
        id=item.id,
        canonical_id=item.canonical_id,
        product_name=product.nome,
        quantity=item.quantity,
        unit=item.unit,
        notes=item.notes,
        best_price=item.best_price,
        best_store_name=None
    )


@router.put("/{list_id}/items/{item_id}", response_model=ShoppingListItemOut)
def update_item(
    list_id: int,
    item_id: int,
    data: ShoppingListItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza um item da lista."""
    # Verifica se a lista pertence ao usuário
    shopping_list = db.query(ShoppingList).filter(
        ShoppingList.id == list_id,
        ShoppingList.user_id == current_user.id
    ).first()
    
    if not shopping_list:
        raise HTTPException(status_code=404, detail="Lista não encontrada")
    
    item = db.query(ShoppingListItem).filter(
        ShoppingListItem.id == item_id,
        ShoppingListItem.shopping_list_id == list_id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    item.quantity = data.quantity
    item.unit = data.unit
    item.notes = data.notes
    
    # Volta status para draft
    if shopping_list.status == ShoppingListStatus.OPTIMIZED.value:
        shopping_list.status = ShoppingListStatus.DRAFT.value
    
    db.commit()
    db.refresh(item)
    
    product = db.get(CanonicalProduct, item.canonical_id)
    
    return ShoppingListItemOut(
        id=item.id,
        canonical_id=item.canonical_id,
        product_name=product.nome if product else "Produto não encontrado",
        quantity=item.quantity,
        unit=item.unit,
        notes=item.notes,
        best_price=item.best_price,
        best_store_name=None
    )


@router.delete("/{list_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_item(
    list_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove um item da lista."""
    shopping_list = db.query(ShoppingList).filter(
        ShoppingList.id == list_id,
        ShoppingList.user_id == current_user.id
    ).first()
    
    if not shopping_list:
        raise HTTPException(status_code=404, detail="Lista não encontrada")
    
    item = db.query(ShoppingListItem).filter(
        ShoppingListItem.id == item_id,
        ShoppingListItem.shopping_list_id == list_id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    
    db.delete(item)
    
    # Volta status para draft
    if shopping_list.status == ShoppingListStatus.OPTIMIZED.value:
        shopping_list.status = ShoppingListStatus.DRAFT.value
    
    db.commit()


# =============================================================================
# ENDPOINTS - OTIMIZAÇÃO
# =============================================================================

@router.post("/{list_id}/optimize", response_model=OptimizationResultOut)
def optimize_list(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Otimiza a lista de compras, distribuindo itens pelos supermercados mais baratos."""
    shopping_list = db.query(ShoppingList).filter(
        ShoppingList.id == list_id,
        ShoppingList.user_id == current_user.id
    ).first()
    
    if not shopping_list:
        raise HTTPException(status_code=404, detail="Lista não encontrada")
    
    if not shopping_list.items:
        raise HTTPException(status_code=400, detail="Lista vazia")
    
    optimizer = ShoppingOptimizer(db)
    result = optimizer.optimize(list_id)
    
    # Converte para schema de saída
    allocations = []
    for alloc in result.allocations:
        items = []
        for item_price in alloc.items:
            # Busca nome do produto
            item = db.get(ShoppingListItem, item_price.item_id)
            product = db.get(CanonicalProduct, item_price.canonical_id) if item_price.canonical_id else None
            
            items.append(OptimizedItemOut(
                item_id=item_price.item_id,
                product_name=product.nome if product else "Produto",
                quantity=item_price.quantity,
                price=item_price.price,
                subtotal=item_price.subtotal,
                worst_price=item_price.worst_price,
                worst_store_name=item_price.worst_store_name,
                item_savings=item_price.item_savings
            ))
        
        allocations.append(StoreAllocationOut(
            store_id=alloc.store_id,
            store_name=alloc.store_name,
            store_address=alloc.store_address,
            items=items,
            total=alloc.total
        ))
    
    return OptimizationResultOut(
        success=result.success,
        message=result.message,
        allocations=allocations,
        total_cost=result.total_cost,
        total_if_single_store=result.total_if_single_store,
        savings=result.savings,
        savings_percent=result.savings_percent,
        total_worst_cost=result.total_worst_cost,
        potential_savings=result.potential_savings,
        potential_savings_percent=result.potential_savings_percent,
        items_without_price=result.items_without_price
    )


@router.get("/{list_id}/optimization", response_model=OptimizationResultOut)
def get_optimization(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtém o resultado da última otimização."""
    shopping_list = (
        db.query(ShoppingList)
        .options(
            joinedload(ShoppingList.optimized_items).joinedload(OptimizedShoppingItem.store),
            joinedload(ShoppingList.optimized_items).joinedload(OptimizedShoppingItem.item).joinedload(ShoppingListItem.canonical_product)
        )
        .filter(ShoppingList.id == list_id, ShoppingList.user_id == current_user.id)
        .first()
    )
    
    if not shopping_list:
        raise HTTPException(status_code=404, detail="Lista não encontrada")
    
    if shopping_list.status != ShoppingListStatus.OPTIMIZED.value:
        raise HTTPException(status_code=400, detail="Lista não foi otimizada")
    
    # Agrupa por loja
    stores_dict: dict[int, StoreAllocationOut] = {}

    # Calcula pior preço por item com base nos preços mais recentes (mesma regra da otimização)
    optimizer = ShoppingOptimizer(db)
    latest_prices = optimizer._get_item_prices(shopping_list)
    prices_by_item: dict[int, list] = defaultdict(list)
    for ip in latest_prices:
        prices_by_item[ip.item_id].append(ip)
    
    for opt_item in shopping_list.optimized_items:
        store_id = opt_item.store_id
        
        if store_id not in stores_dict:
            store = opt_item.store
            stores_dict[store_id] = StoreAllocationOut(
                store_id=store_id,
                store_name=store.nome_fantasia or store.razao_social if store else "Desconhecido",
                store_address=f"{store.endereco}, {store.cidade}" if store else "",
                items=[],
                total=0
            )
        
        product_name = opt_item.item.canonical_product.nome if opt_item.item and opt_item.item.canonical_product else "Produto"

        worst_price = 0.0
        worst_store_name = ""
        item_savings = 0.0
        item_prices = prices_by_item.get(opt_item.item_id, [])
        if item_prices:
            worst = max(item_prices, key=lambda x: x.price)
            if worst.price != opt_item.price:
                worst_price = worst.price
                worst_store_name = worst.store_name
                item_savings = (worst.price - opt_item.price) * (opt_item.quantity or 0)
        
        stores_dict[store_id].items.append(OptimizedItemOut(
            item_id=opt_item.item_id,
            product_name=product_name,
            quantity=opt_item.quantity,
            price=opt_item.price,
            subtotal=opt_item.subtotal,
            worst_price=worst_price,
            worst_store_name=worst_store_name,
            item_savings=item_savings
        ))
        stores_dict[store_id].total += opt_item.subtotal
    
    allocations = list(stores_dict.values())
    allocations.sort(key=lambda x: x.total, reverse=True)
    
    total_cost = sum(a.total for a in allocations)

    total_worst_cost = 0.0
    for alloc in allocations:
        for it in alloc.items:
            worst_unit = it.worst_price if it.worst_price and it.worst_price > 0 else it.price
            total_worst_cost += worst_unit * it.quantity

    potential_savings = total_worst_cost - total_cost
    potential_savings_percent = (potential_savings / total_worst_cost * 100) if total_worst_cost > 0 else 0
    
    max_stores = shopping_list.max_stores or 3
    message = f"Lista otimizada em {len(allocations)} supermercado(s)"
    if max_stores > 0 and len(allocations) > max_stores:
        message = (
            f"Lista otimizada em {len(allocations)} supermercado(s) "
            f"(não foi possível limitar a {max_stores} por falta de preço recente "
            "de alguns itens nas lojas selecionadas)"
        )

    return OptimizationResultOut(
        success=True,
        message=message,
        allocations=allocations,
        total_cost=total_cost,
        total_if_single_store=total_cost + (shopping_list.total_savings or 0),
        savings=shopping_list.total_savings or 0,
        savings_percent=(shopping_list.total_savings / (total_cost + shopping_list.total_savings) * 100) if shopping_list.total_savings else 0,
        total_worst_cost=total_worst_cost,
        potential_savings=potential_savings,
        potential_savings_percent=potential_savings_percent,
        items_without_price=[]
    )
