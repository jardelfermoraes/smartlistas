from __future__ import annotations

import math
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from collections import defaultdict

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from ..models import AppShoppingList, Price, Store
from .city_location import LatLng, haversine_km, resolve_city_centroid

logger = logging.getLogger(__name__)


@dataclass
class ItemPrice:
    item_id: int
    canonical_id: int
    store_id: int
    store_name: str
    price: float
    price_date: datetime
    quantity: float
    subtotal: float


@dataclass
class FallbackPrice:
    canonical_id: int
    store_id: int
    store_name: str
    price: float
    price_date: datetime


@dataclass
class StoreAllocation:
    store_id: int
    store_name: str
    store_address: str
    items: list[ItemPrice]
    total: float


@dataclass
class OptimizationResult:
    success: bool
    message: str
    allocations: list[StoreAllocation]
    total_cost: float
    total_if_single_store: float
    savings: float
    savings_percent: float
    items_without_price: list[int]


class AppShoppingOptimizer:
    def __init__(self, db: Session):
        self.db = db
        self.price_lookback_days = 15

    def optimize_for_user_city(self, shopping_list_id: int, user_uf: str | None, user_city: str | None, radius_km: float) -> OptimizationResult:
        sl = self.db.get(AppShoppingList, shopping_list_id)
        if not sl:
            return OptimizationResult(
                success=False,
                message="Lista não encontrada",
                allocations=[],
                total_cost=0,
                total_if_single_store=0,
                savings=0,
                savings_percent=0,
                items_without_price=[],
            )

        if not sl.items:
            return OptimizationResult(
                success=False,
                message="Lista vazia",
                allocations=[],
                total_cost=0,
                total_if_single_store=0,
                savings=0,
                savings_percent=0,
                items_without_price=[],
            )

        if not user_uf or not user_city:
            return OptimizationResult(
                success=False,
                message="Informe UF e cidade no seu cadastro para otimizar a lista.",
                allocations=[],
                total_cost=0,
                total_if_single_store=0,
                savings=0,
                savings_percent=0,
                items_without_price=[it.id for it in sl.items],
            )

        user_center = resolve_city_centroid(self.db, user_uf, user_city)
        if not user_center:
            return OptimizationResult(
                success=False,
                message="Não foi possível localizar sua cidade para calcular o raio. Tente novamente mais tarde ou ajuste seu cadastro.",
                allocations=[],
                total_cost=0,
                total_if_single_store=0,
                savings=0,
                savings_percent=0,
                items_without_price=[it.id for it in sl.items],
            )

        eligible_store_ids = self._eligible_stores_by_city_radius(user_center, radius_km, user_uf, user_city)
        if not eligible_store_ids:
            return OptimizationResult(
                success=False,
                message="Não encontramos supermercados dentro do seu raio de compra.",
                allocations=[],
                total_cost=0,
                total_if_single_store=0,
                savings=0,
                savings_percent=0,
                items_without_price=[it.id for it in sl.items],
            )

        max_stores = sl.max_stores or 3
        item_prices = self._get_item_prices(sl, eligible_store_ids)
        if not item_prices:
            return OptimizationResult(
                success=False,
                message="Não encontramos preços recentes para os itens desta lista em supermercados dentro do seu raio.",
                allocations=[],
                total_cost=0,
                total_if_single_store=0,
                savings=0,
                savings_percent=0,
                items_without_price=[it.id for it in sl.items],
            )

        allocations, _items_outside_item_ids = self._greedy_allocate(item_prices, max_stores)
        total_cost = sum(a.total for a in allocations)
        total_if_single_store = self._calculate_single_store_cost(item_prices)
        savings = total_if_single_store - total_cost
        savings_percent = (savings / total_if_single_store * 100) if total_if_single_store > 0 else 0

        items_with_price = {ip.item_id for ip in item_prices}
        items_without_price = [it.id for it in sl.items if it.id not in items_with_price]

        self._save_optimization(sl, allocations, total_cost, savings)

        return OptimizationResult(
            success=True,
            message=f"Lista otimizada em {len(allocations)} supermercado(s)",
            allocations=allocations,
            total_cost=total_cost,
            total_if_single_store=total_if_single_store,
            savings=savings,
            savings_percent=savings_percent,
            items_without_price=items_without_price,
        )

    def _eligible_stores_by_city_radius(
        self,
        user_center: LatLng,
        radius_km: float,
        user_uf: str | None = None,
        user_city: str | None = None,
    ) -> set[int]:
        """Filtra lojas elegíveis por raio.

        Otimização:
        - Pré-filtra por UF (quando fornecida)
        - Pré-filtra por bounding box (lat/lng) para reduzir o número de lojas
        - Para lojas sem lat/lng, inclui somente quando estão na mesma cidade do usuário
          (evita milhares de chamadas de resolve_city_centroid).
        """

        eligible: set[int] = set()
        q = self.db.query(Store)
        if user_uf:
            q = q.filter(Store.uf == user_uf)

        # Bounding box aproximado (km -> graus)
        lat = float(user_center.lat)
        lng = float(user_center.lng)
        delta_lat = float(radius_km) / 111.0
        denom = 111.0 * max(0.1, math.cos(math.radians(lat)))
        delta_lng = float(radius_km) / denom

        min_lat = lat - delta_lat
        max_lat = lat + delta_lat
        min_lng = lng - delta_lng
        max_lng = lng + delta_lng

        has_coords = and_(
            Store.lat.isnot(None),
            Store.lng.isnot(None),
            Store.lat >= min_lat,
            Store.lat <= max_lat,
            Store.lng >= min_lng,
            Store.lng <= max_lng,
        )

        no_coords_same_uf = and_(
            Store.lat.is_(None),
            Store.lng.is_(None),
            Store.uf.isnot(None),
            Store.uf == (user_uf or ''),
        )

        q = q.filter(or_(has_coords, no_coords_same_uf))

        stores = q.all()
        centroid_cache: dict[tuple[str, str], LatLng | None] = {}
        for s in stores:
            if s.lat is None or s.lng is None:
                # Sem coord: usa centróide da cidade (com cache) para estimar distância.
                uf = (s.uf or '').strip().upper()
                city = (s.cidade or '').strip()
                if not uf or not city:
                    continue

                key = (uf, city)
                if key not in centroid_cache:
                    centroid_cache[key] = resolve_city_centroid(self.db, uf, city)
                s_center = centroid_cache[key]
                if not s_center:
                    continue
                if haversine_km(user_center, s_center) <= radius_km:
                    eligible.add(s.id)
                continue

            s_center = LatLng(lat=float(s.lat), lng=float(s.lng))
            if haversine_km(user_center, s_center) <= radius_km:
                eligible.add(s.id)

        return eligible

    def _get_item_prices(self, shopping_list: AppShoppingList, eligible_store_ids: set[int]) -> list[ItemPrice]:
        cutoff = datetime.now(UTC) - timedelta(days=self.price_lookback_days)
        canonical_ids = [it.canonical_id for it in shopping_list.items]

        latest_price_subq = (
            self.db.query(
                Price.canonical_id,
                Price.loja_id,
                func.max(Price.data_coleta).label("max_date"),
            )
            .filter(
                Price.canonical_id.in_(canonical_ids),
                Price.data_coleta >= cutoff,
                Price.loja_id.in_(eligible_store_ids),
            )
            .group_by(Price.canonical_id, Price.loja_id)
            .subquery()
        )

        prices = (
            self.db.query(Price, Store)
            .join(Store, Price.loja_id == Store.id)
            .join(
                latest_price_subq,
                and_(
                    Price.canonical_id == latest_price_subq.c.canonical_id,
                    Price.loja_id == latest_price_subq.c.loja_id,
                    Price.data_coleta == latest_price_subq.c.max_date,
                ),
            )
            .all()
        )

        canonical_item_map = {it.canonical_id: it for it in shopping_list.items}
        out: list[ItemPrice] = []
        for price, store in prices:
            item = canonical_item_map.get(price.canonical_id)
            if not item:
                continue
            store_name = store.nome_fantasia or store.nome or "Loja"
            out.append(
                ItemPrice(
                    item_id=item.id,
                    canonical_id=price.canonical_id,
                    store_id=store.id,
                    store_name=store_name,
                    price=price.preco_por_unidade,
                    price_date=price.data_coleta,
                    quantity=item.quantity,
                    subtotal=price.preco_por_unidade * item.quantity,
                )
            )

        return out

    def _get_fallback_prices(self, canonical_ids: list[int], eligible_store_ids: set[int]) -> dict[int, FallbackPrice]:
        """Retorna o melhor preço disponível por item (mesmo que antigo) dentro das lojas elegíveis."""

        if not canonical_ids or not eligible_store_ids:
            return {}

        latest_price_subq = (
            self.db.query(
                Price.canonical_id,
                Price.loja_id,
                func.max(Price.data_coleta).label("max_date"),
            )
            .filter(
                Price.canonical_id.in_(canonical_ids),
                Price.loja_id.in_(eligible_store_ids),
            )
            .group_by(Price.canonical_id, Price.loja_id)
            .subquery()
        )

        prices = (
            self.db.query(Price, Store)
            .join(Store, Price.loja_id == Store.id)
            .join(
                latest_price_subq,
                and_(
                    Price.canonical_id == latest_price_subq.c.canonical_id,
                    Price.loja_id == latest_price_subq.c.loja_id,
                    Price.data_coleta == latest_price_subq.c.max_date,
                ),
            )
            .all()
        )

        best_by_canonical: dict[int, FallbackPrice] = {}
        for price, store in prices:
            store_name = store.nome_fantasia or store.nome or "Loja"
            candidate = FallbackPrice(
                canonical_id=price.canonical_id,
                store_id=store.id,
                store_name=store_name,
                price=price.preco_por_unidade,
                price_date=price.data_coleta,
            )

            prev = best_by_canonical.get(price.canonical_id)
            if prev is None or candidate.price < prev.price:
                best_by_canonical[price.canonical_id] = candidate

        return best_by_canonical

    def _greedy_allocate(self, item_prices: list[ItemPrice], max_stores: int) -> tuple[list[StoreAllocation], list[int]]:
        prices_by_item: dict[int, list[ItemPrice]] = defaultdict(list)
        for ip in item_prices:
            prices_by_item[ip.item_id].append(ip)

        for item_id in prices_by_item:
            prices_by_item[item_id].sort(key=lambda x: x.price)

        max_stores = max(1, int(max_stores or 1))

        # Mapa: store_id -> (item_id -> melhor ItemPrice naquela loja)
        store_item_best: dict[int, dict[int, ItemPrice]] = defaultdict(dict)
        for item_id, prices in prices_by_item.items():
            for p in prices:
                prev = store_item_best[p.store_id].get(item_id)
                if prev is None or p.price < prev.price:
                    store_item_best[p.store_id][item_id] = p

        candidate_stores = list(store_item_best.keys())
        if not candidate_stores:
            return [], list(prices_by_item.keys())

        all_item_ids = list(prices_by_item.keys())
        INF = 10**12
        penalty_missing = 10**9

        selected: list[int] = []
        best_by_item: dict[int, ItemPrice] = {}

        for _ in range(min(max_stores, len(candidate_stores))):
            best_store: int | None = None
            best_score = None

            for sid in candidate_stores:
                if sid in selected:
                    continue

                total = 0.0
                missing = 0
                for item_id in all_item_ids:
                    current = best_by_item.get(item_id)
                    cand = store_item_best[sid].get(item_id)
                    if current is None and cand is None:
                        missing += 1
                        continue

                    best_price = current.price if current else INF
                    if cand and cand.price < best_price:
                        best_price = cand.price
                    if best_price >= INF:
                        missing += 1
                        continue

                    qty = prices_by_item[item_id][0].quantity
                    total += float(best_price) * float(qty)

                score = float(total) + float(missing) * penalty_missing
                if best_score is None or score < best_score:
                    best_score = score
                    best_store = sid

            if best_store is None:
                break

            selected.append(best_store)
            for item_id, cand in store_item_best[best_store].items():
                current = best_by_item.get(item_id)
                if current is None or cand.price < current.price:
                    best_by_item[item_id] = cand

            # Se já cobrimos todos os itens, podemos parar cedo.
            if len(best_by_item) == len(all_item_ids):
                break

        allocation: dict[int, list[ItemPrice]] = defaultdict(list)
        items_outside: list[int] = []
        for item_id in all_item_ids:
            best = best_by_item.get(item_id)
            if best is None or best.store_id not in selected:
                items_outside.append(item_id)
                continue
            allocation[best.store_id].append(best)

        result: list[StoreAllocation] = []
        for store_id, items in allocation.items():
            store = self.db.get(Store, store_id)
            store_name = (store.nome_fantasia or store.nome) if store else "Desconhecido"
            store_address = ""
            if store:
                parts = [p for p in [store.endereco, store.cidade] if p]
                store_address = ", ".join(parts)

            result.append(
                StoreAllocation(
                    store_id=store_id,
                    store_name=store_name,
                    store_address=store_address,
                    items=items,
                    total=sum(p.subtotal for p in items),
                )
            )

        result.sort(key=lambda x: x.total, reverse=True)
        return result, items_outside

    def _calculate_single_store_cost(self, item_prices: list[ItemPrice]) -> float:
        store_items: dict[int, set[int]] = defaultdict(set)
        store_totals: dict[int, float] = defaultdict(float)

        for ip in item_prices:
            store_items[ip.store_id].add(ip.item_id)

        all_items = {ip.item_id for ip in item_prices}
        complete_stores = [sid for sid, items in store_items.items() if items == all_items]

        if not complete_stores:
            prices_by_item: dict[int, list[float]] = defaultdict(list)
            for ip in item_prices:
                prices_by_item[ip.item_id].append(ip.subtotal)
            return sum(max(vals) for vals in prices_by_item.values())

        for ip in item_prices:
            if ip.store_id in complete_stores:
                store_totals[ip.store_id] += ip.subtotal

        return min(store_totals[s] for s in complete_stores) if store_totals else 0.0

    def _save_optimization(self, sl: AppShoppingList, allocations: list[StoreAllocation], total_cost: float, savings: float) -> None:
        # Atualiza best_price/best_store_id em cada item (para exibição rápida)
        chosen_by_item: dict[int, ItemPrice] = {}
        for alloc in allocations:
            for ip in alloc.items:
                chosen_by_item[ip.item_id] = ip

        for item in sl.items:
            chosen = chosen_by_item.get(item.id)
            if chosen:
                item.best_price = chosen.price
                item.best_store_id = chosen.store_id

        sl.status = "optimized"
        sl.total_estimated = total_cost
        sl.total_savings = savings
        sl.optimized_at = datetime.now(UTC)
        self.db.commit()
