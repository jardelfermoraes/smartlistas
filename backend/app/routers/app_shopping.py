"""Router para listas de compras do usuário do app (AppUser)."""

import logging
from datetime import datetime
from dataclasses import dataclass
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import AppShoppingList, AppShoppingListItem, AppUser, CanonicalProduct, Store
from .app_auth import get_current_app_user
from ..services.app_shopping_optimizer import AppShoppingOptimizer
from ..services.city_location import resolve_city_centroid

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# SCHEMAS
# =============================================================================


class AppShoppingListItemCreate(BaseModel):
    canonical_id: int
    quantity: float = Field(default=1.0, gt=0)
    unit: str = Field(default="un", max_length=20)
    notes: Optional[str] = Field(default=None, max_length=255)


class AppShoppingListItemOut(BaseModel):
    id: int
    canonical_id: int
    product_name: str
    quantity: float
    unit: str
    notes: Optional[str]
    is_checked: bool

    class Config:
        from_attributes = True


class AppShoppingListCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=255)
    max_stores: int = Field(default=3, ge=1, le=5)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_km: float = Field(default=10.0, ge=1, le=50)


class AppShoppingListUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=255)
    max_stores: Optional[int] = Field(default=None, ge=1, le=5)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_km: Optional[float] = Field(default=None, ge=1, le=50)
    status: Optional[str] = Field(default=None, max_length=20)


class AppShoppingListOut(BaseModel):
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


class AppShoppingListDetailOut(AppShoppingListOut):
    items: List[AppShoppingListItemOut]


class AppOptimizedItemOut(BaseModel):
    item_id: int
    canonical_id: int
    product_name: str
    quantity: float
    price: float
    subtotal: float


class AppStoreAllocationOut(BaseModel):
    store_id: int
    store_name: str
    store_address: str
    items: List[AppOptimizedItemOut]
    total: float


class AppFallbackPriceOut(BaseModel):
    canonical_id: int
    store_id: int
    store_name: str
    price: float
    price_date: str


class AppOptimizationResultOut(BaseModel):
    success: bool
    message: str
    allocations: List[AppStoreAllocationOut]
    total_cost: float
    total_if_single_store: float
    savings: float
    savings_percent: float
    total_worst_cost: float = 0.0
    potential_savings: float = 0.0
    potential_savings_percent: float = 0.0
    items_without_price: List[int]
    items_outside_selected_stores: List[int] = []
    unoptimized_prices: List[AppFallbackPriceOut] = []
    fallback_prices: List[AppFallbackPriceOut] = []
    price_lookback_days: int = 15


class AppOptimizationItemIn(BaseModel):
    canonical_id: int
    quantity: float = Field(default=1.0, gt=0)


class AppOptimizationIn(BaseModel):
    max_stores: int = Field(default=3, ge=1, le=5)
    items: List[AppOptimizationItemIn] = Field(default_factory=list)


@dataclass
class _TempItem:
    id: int
    canonical_id: int
    quantity: float


@dataclass
class _TempList:
    items: list[_TempItem]


# =============================================================================
# HELPERS
# =============================================================================


def _list_to_out(sl: AppShoppingList) -> AppShoppingListOut:
    return AppShoppingListOut(
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
        updated_at=sl.updated_at,
    )


def _item_to_out(item: AppShoppingListItem) -> AppShoppingListItemOut:
    name = item.canonical_product.nome if item.canonical_product else "Produto"
    return AppShoppingListItemOut(
        id=item.id,
        canonical_id=item.canonical_id,
        product_name=name,
        quantity=item.quantity,
        unit=item.unit,
        notes=item.notes,
        is_checked=item.is_checked,
    )


# =============================================================================
# ENDPOINTS - LISTAS
# =============================================================================


@router.get("/shopping-lists", response_model=List[AppShoppingListOut])
def list_app_shopping_lists(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    query = db.query(AppShoppingList).filter(AppShoppingList.user_id == current_user.id)
    if status_filter:
        query = query.filter(AppShoppingList.status == status_filter)

    lists = query.order_by(AppShoppingList.updated_at.desc()).options(joinedload(AppShoppingList.items)).all()
    return [_list_to_out(sl) for sl in lists]


@router.post("/shopping-lists", response_model=AppShoppingListOut, status_code=status.HTTP_201_CREATED)
def create_app_shopping_list(
    data: AppShoppingListCreate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    sl = AppShoppingList(
        user_id=current_user.id,
        name=data.name,
        description=data.description,
        max_stores=data.max_stores,
        latitude=data.latitude,
        longitude=data.longitude,
        radius_km=data.radius_km,
        status="draft",
    )

    db.add(sl)
    db.commit()
    db.refresh(sl)

    sl.items = []
    return _list_to_out(sl)


@router.get("/shopping-lists/{list_id}", response_model=AppShoppingListDetailOut)
def get_app_shopping_list(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    sl = (
        db.query(AppShoppingList)
        .filter(AppShoppingList.id == list_id, AppShoppingList.user_id == current_user.id)
        .options(joinedload(AppShoppingList.items).joinedload(AppShoppingListItem.canonical_product))
        .first()
    )

    if not sl:
        raise HTTPException(status_code=404, detail="Lista não encontrada")

    return AppShoppingListDetailOut(
        **_list_to_out(sl).model_dump(),
        items=[_item_to_out(it) for it in sl.items],
    )


@router.put("/shopping-lists/{list_id}", response_model=AppShoppingListOut)
def update_app_shopping_list(
    list_id: int,
    data: AppShoppingListUpdate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    sl = (
        db.query(AppShoppingList)
        .filter(AppShoppingList.id == list_id, AppShoppingList.user_id == current_user.id)
        .options(joinedload(AppShoppingList.items))
        .first()
    )
    if not sl:
        raise HTTPException(status_code=404, detail="Lista não encontrada")

    if data.name is not None:
        sl.name = data.name
    if data.description is not None:
        sl.description = data.description
    if data.max_stores is not None:
        sl.max_stores = data.max_stores
    if data.latitude is not None:
        sl.latitude = data.latitude
    if data.longitude is not None:
        sl.longitude = data.longitude
    if data.radius_km is not None:
        sl.radius_km = data.radius_km
    if data.status is not None:
        sl.status = data.status

    db.commit()
    db.refresh(sl)

    return _list_to_out(sl)


@router.delete("/shopping-lists/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_app_shopping_list(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    sl = db.query(AppShoppingList).filter(AppShoppingList.id == list_id, AppShoppingList.user_id == current_user.id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="Lista não encontrada")

    db.delete(sl)
    db.commit()
    return None


# =============================================================================
# ENDPOINTS - OTIMIZAÇÃO (LISTA LOCAL)
# =============================================================================


@router.post("/optimization", response_model=AppOptimizationResultOut)
def optimize_local_payload(
    data: AppOptimizationIn,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    """Otimiza uma lista local do app (payload) usando UF+cidade do usuário e raio de compra.

    Esse endpoint não cria AppShoppingList no banco. Ele apenas calcula as alocações com base
    nos preços recentes e lojas dentro do raio do usuário.
    """

    if not data.items:
        raise HTTPException(status_code=400, detail="Informe ao menos 1 item")

    if not current_user.state or not current_user.city:
        return AppOptimizationResultOut(
            success=False,
            message="Informe UF e cidade no seu cadastro para otimizar a lista.",
            allocations=[],
            total_cost=0.0,
            total_if_single_store=0.0,
            savings=0.0,
            savings_percent=0.0,
            items_without_price=[it.canonical_id for it in data.items],
        )

    radius_km = float(current_user.shopping_radius_km or 10.0)
    user_center = resolve_city_centroid(db, current_user.state, current_user.city)
    if not user_center:
        return AppOptimizationResultOut(
            success=False,
            message="Não foi possível localizar sua cidade para calcular o raio. Tente novamente mais tarde ou ajuste seu cadastro.",
            allocations=[],
            total_cost=0.0,
            total_if_single_store=0.0,
            savings=0.0,
            savings_percent=0.0,
            items_without_price=[it.canonical_id for it in data.items],
        )

    optimizer = AppShoppingOptimizer(db)
    eligible_store_ids = optimizer._eligible_stores_by_city_radius(user_center, radius_km, current_user.state, current_user.city)
    if not eligible_store_ids:
        return AppOptimizationResultOut(
            success=False,
            message="Não encontramos supermercados dentro do seu raio de compra.",
            allocations=[],
            total_cost=0.0,
            total_if_single_store=0.0,
            savings=0.0,
            savings_percent=0.0,
            items_without_price=[it.canonical_id for it in data.items],
        )

    # Monta lista temporária para reutilizar a lógica de preços e alocação.
    # Usamos item_id=canonical_id para manter identificadores estáveis no retorno.
    temp = _TempList(items=[_TempItem(id=it.canonical_id, canonical_id=it.canonical_id, quantity=float(it.quantity)) for it in data.items])

    item_prices = optimizer._get_item_prices(temp, eligible_store_ids)
    if not item_prices:
        return AppOptimizationResultOut(
            success=False,
            message="Não encontramos preços recentes para os itens desta lista em supermercados dentro do seu raio.",
            allocations=[],
            total_cost=0.0,
            total_if_single_store=0.0,
            savings=0.0,
            savings_percent=0.0,
            items_without_price=[it.canonical_id for it in data.items],
        )

    allocations, items_outside_item_ids = optimizer._greedy_allocate(item_prices, int(data.max_stores))
    total_cost = float(sum(a.total for a in allocations))
    total_if_single_store = float(optimizer._calculate_single_store_cost(item_prices))
    savings = float(max(0.0, total_if_single_store - total_cost))
    savings_percent = float((savings / total_if_single_store * 100) if total_if_single_store > 0 and savings > 0 else 0.0)

    # KPI "Valor máximo": pior custo possível considerando os itens realmente alocados (otimizados).
    # Isso ignora itens sem preço recente e itens fora da otimização.
    allocated_item_ids = {ip.item_id for alloc in allocations for ip in alloc.items}
    total_worst_cost = 0.0
    for item_id in allocated_item_ids:
        candidates = [ip.subtotal for ip in item_prices if ip.item_id == item_id]
        if not candidates:
            continue
        total_worst_cost += float(max(candidates))

    potential_savings = float(max(0.0, total_worst_cost - total_cost))
    potential_savings_percent = float(
        (potential_savings / total_worst_cost * 100) if total_worst_cost > 0 and potential_savings > 0 else 0.0
    )

    canonical_ids = [it.canonical_id for it in temp.items]
    products = db.query(CanonicalProduct).filter(CanonicalProduct.id.in_(canonical_ids)).all()
    name_by_id = {p.id: p.nome for p in products}

    allocations_out: list[AppStoreAllocationOut] = []
    for alloc in allocations:
        items_out: list[AppOptimizedItemOut] = []
        for ip in alloc.items:
            items_out.append(
                AppOptimizedItemOut(
                    item_id=ip.item_id,
                    canonical_id=ip.canonical_id,
                    product_name=name_by_id.get(ip.canonical_id, "Produto"),
                    quantity=ip.quantity,
                    price=ip.price,
                    subtotal=ip.subtotal,
                )
            )

        store = db.get(Store, alloc.store_id)
        store_address = alloc.store_address
        if store and not store_address:
            parts = [p for p in [store.endereco, store.cidade] if p]
            store_address = ", ".join(parts)

        allocations_out.append(
            AppStoreAllocationOut(
                store_id=alloc.store_id,
                store_name=alloc.store_name,
                store_address=store_address,
                items=items_out,
                total=alloc.total,
            )
        )

    items_with_recent_price = {ip.canonical_id for ip in item_prices}
    items_without_price = [it.canonical_id for it in temp.items if it.canonical_id not in items_with_recent_price]

    outside_canonical_ids = sorted(set(int(x) for x in items_outside_item_ids))

    # Preços para itens que têm preço recente mas ficaram fora dos supermercados selecionados.
    unoptimized_prices: list[AppFallbackPriceOut] = []
    for item_id in items_outside_item_ids:
        candidates = [ip for ip in item_prices if ip.item_id == item_id]
        if not candidates:
            continue
        best = min(candidates, key=lambda x: x.price)
        unoptimized_prices.append(
            AppFallbackPriceOut(
                canonical_id=best.canonical_id,
                store_id=best.store_id,
                store_name=best.store_name,
                price=float(best.price),
                price_date=best.price_date.isoformat() if best.price_date else "",
            )
        )

    # Fallback: preços mais recentes disponíveis (mesmo que antigos) para itens sem preço recente.
    fallback_map = optimizer._get_fallback_prices(items_without_price, eligible_store_ids)
    fallback_prices: list[AppFallbackPriceOut] = []
    for cid in items_without_price:
        fp = fallback_map.get(cid)
        if not fp:
            continue
        fallback_prices.append(
            AppFallbackPriceOut(
                canonical_id=fp.canonical_id,
                store_id=fp.store_id,
                store_name=fp.store_name,
                price=float(fp.price),
                price_date=fp.price_date.isoformat() if fp.price_date else "",
            )
        )

    return AppOptimizationResultOut(
        success=True,
        message=f"Lista otimizada em {len(allocations_out)} supermercado(s)",
        allocations=allocations_out,
        total_cost=total_cost,
        total_if_single_store=total_if_single_store,
        savings=savings,
        savings_percent=savings_percent,
        total_worst_cost=total_worst_cost,
        potential_savings=potential_savings,
        potential_savings_percent=potential_savings_percent,
        items_without_price=items_without_price,
        items_outside_selected_stores=outside_canonical_ids,
        unoptimized_prices=unoptimized_prices,
        fallback_prices=fallback_prices,
        price_lookback_days=int(optimizer.price_lookback_days),
    )


# =============================================================================
# ENDPOINTS - ITENS
# =============================================================================


@router.post("/shopping-lists/{list_id}/items", response_model=AppShoppingListItemOut, status_code=status.HTTP_201_CREATED)
def add_app_shopping_list_item(
    list_id: int,
    data: AppShoppingListItemCreate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    sl = db.query(AppShoppingList).filter(AppShoppingList.id == list_id, AppShoppingList.user_id == current_user.id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="Lista não encontrada")

    product = db.get(CanonicalProduct, data.canonical_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    existing = (
        db.query(AppShoppingListItem)
        .filter(AppShoppingListItem.shopping_list_id == list_id, AppShoppingListItem.canonical_id == data.canonical_id)
        .options(joinedload(AppShoppingListItem.canonical_product))
        .first()
    )

    if existing:
        existing.quantity += data.quantity
        if data.unit:
            existing.unit = data.unit
        if data.notes is not None:
            existing.notes = data.notes
        db.commit()
        db.refresh(existing)
        return _item_to_out(existing)

    item = AppShoppingListItem(
        shopping_list_id=list_id,
        canonical_id=data.canonical_id,
        quantity=data.quantity,
        unit=data.unit,
        notes=data.notes,
    )

    db.add(item)
    db.commit()
    db.refresh(item)

    item = db.query(AppShoppingListItem).options(joinedload(AppShoppingListItem.canonical_product)).get(item.id)
    return _item_to_out(item)


@router.put("/shopping-lists/{list_id}/items/{item_id}", response_model=AppShoppingListItemOut)
def update_app_shopping_list_item(
    list_id: int,
    item_id: int,
    data: AppShoppingListItemCreate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    sl = db.query(AppShoppingList).filter(AppShoppingList.id == list_id, AppShoppingList.user_id == current_user.id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="Lista não encontrada")

    item = (
        db.query(AppShoppingListItem)
        .filter(AppShoppingListItem.id == item_id, AppShoppingListItem.shopping_list_id == list_id)
        .options(joinedload(AppShoppingListItem.canonical_product))
        .first()
    )

    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")

    product = db.get(CanonicalProduct, data.canonical_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    item.canonical_id = data.canonical_id
    item.quantity = data.quantity
    item.unit = data.unit
    item.notes = data.notes

    db.commit()
    db.refresh(item)

    return _item_to_out(item)


@router.delete("/shopping-lists/{list_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_app_shopping_list_item(
    list_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    sl = db.query(AppShoppingList).filter(AppShoppingList.id == list_id, AppShoppingList.user_id == current_user.id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="Lista não encontrada")

    item = db.query(AppShoppingListItem).filter(AppShoppingListItem.id == item_id, AppShoppingListItem.shopping_list_id == list_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")

    db.delete(item)
    db.commit()
    return None


# =============================================================================
# ENDPOINTS - OTIMIZAÇÃO
# =============================================================================


@router.post("/shopping-lists/{list_id}/optimize", response_model=AppOptimizationResultOut)
def optimize_app_shopping_list(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_app_user),
):
    """Otimiza uma lista do app usando UF+cidade do usuário e raio de compra."""
    sl = (
        db.query(AppShoppingList)
        .filter(AppShoppingList.id == list_id, AppShoppingList.user_id == current_user.id)
        .options(joinedload(AppShoppingList.items).joinedload(AppShoppingListItem.canonical_product))
        .first()
    )
    if not sl:
        raise HTTPException(status_code=404, detail="Lista não encontrada")
    if not sl.items:
        raise HTTPException(status_code=400, detail="Lista vazia")

    radius_km = float(current_user.shopping_radius_km or 10.0)
    optimizer = AppShoppingOptimizer(db)
    result = optimizer.optimize_for_user_city(sl.id, current_user.state, current_user.city, radius_km)

    # Converte para schema de saída
    allocations_out: list[AppStoreAllocationOut] = []
    for alloc in result.allocations:
        items_out: list[AppOptimizedItemOut] = []
        for ip in alloc.items:
            item = next((it for it in sl.items if it.id == ip.item_id), None)
            product_name = item.canonical_product.nome if item and item.canonical_product else "Produto"
            items_out.append(
                AppOptimizedItemOut(
                    item_id=ip.item_id,
                    canonical_id=ip.canonical_id,
                    product_name=product_name,
                    quantity=ip.quantity,
                    price=ip.price,
                    subtotal=ip.subtotal,
                )
            )

        allocations_out.append(
            AppStoreAllocationOut(
                store_id=alloc.store_id,
                store_name=alloc.store_name,
                store_address=alloc.store_address,
                items=items_out,
                total=alloc.total,
            )
        )

    return AppOptimizationResultOut(
        success=result.success,
        message=result.message,
        allocations=allocations_out,
        total_cost=result.total_cost,
        total_if_single_store=result.total_if_single_store,
        savings=result.savings,
        savings_percent=result.savings_percent,
        items_without_price=result.items_without_price,
    )
