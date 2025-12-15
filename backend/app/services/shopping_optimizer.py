"""
Serviço de otimização de lista de compras.

Este serviço é responsável por:
1. Buscar os preços mais recentes de cada item em cada loja
2. Calcular a melhor distribuição de itens entre N lojas
3. Minimizar o custo total respeitando o limite de lojas
"""

import logging
from datetime import datetime, timedelta, UTC
from typing import Optional
from dataclasses import dataclass
from collections import defaultdict
import itertools

from sqlalchemy import func, and_
from sqlalchemy.orm import Session

from ..models import (
    ShoppingList,
    ShoppingListItem,
    OptimizedShoppingItem,
    ShoppingListStatus,
    CanonicalProduct,
    Price,
    Store,
)

logger = logging.getLogger(__name__)


@dataclass
class ItemPrice:
    """Preço de um item em uma loja."""
    item_id: int
    canonical_id: int
    store_id: int
    store_name: str
    price: float
    quantity: float
    subtotal: float
    # Campos para comparação (preenchidos depois)
    worst_price: float = 0.0
    worst_store_name: str = ""
    item_savings: float = 0.0


@dataclass
class StoreAllocation:
    """Alocação de itens para uma loja."""
    store_id: int
    store_name: str
    store_address: str
    items: list[ItemPrice]
    total: float


@dataclass
class OptimizationResult:
    """Resultado da otimização."""
    success: bool
    message: str
    allocations: list[StoreAllocation]
    total_cost: float
    total_if_single_store: float
    savings: float
    savings_percent: float
    total_worst_cost: float
    potential_savings: float
    potential_savings_percent: float
    items_without_price: list[int]  # IDs dos itens sem preço


class ShoppingOptimizer:
    """Serviço de otimização de lista de compras."""

    def __init__(self, db: Session):
        self.db = db
        # Considerar preços dos últimos 30 dias
        self.price_lookback_days = 30

    def optimize(self, shopping_list_id: int) -> OptimizationResult:
        """
        Otimiza uma lista de compras.
        
        Algoritmo:
        1. Busca todos os preços recentes para cada item
        2. Para cada item, identifica as N lojas mais baratas
        3. Usa algoritmo guloso para alocar itens às lojas
        4. Respeita o limite máximo de lojas definido pelo usuário
        """
        # Busca a lista
        shopping_list = self.db.get(ShoppingList, shopping_list_id)
        if not shopping_list:
            return OptimizationResult(
                success=False,
                message="Lista não encontrada",
                allocations=[],
                total_cost=0,
                total_if_single_store=0,
                savings=0,
                savings_percent=0,
                total_worst_cost=0,
                potential_savings=0,
                potential_savings_percent=0,
                items_without_price=[]
            )

        if not shopping_list.items:
            return OptimizationResult(
                success=False,
                message="Lista vazia",
                allocations=[],
                total_cost=0,
                total_if_single_store=0,
                savings=0,
                savings_percent=0,
                total_worst_cost=0,
                potential_savings=0,
                potential_savings_percent=0,
                items_without_price=[]
            )

        max_stores = shopping_list.max_stores or 3

        # Busca preços recentes para todos os itens
        item_prices = self._get_item_prices(shopping_list)
        
        if not item_prices:
            return OptimizationResult(
                success=False,
                message="Nenhum preço encontrado para os itens da lista",
                allocations=[],
                total_cost=0,
                total_if_single_store=0,
                savings=0,
                savings_percent=0,
                total_worst_cost=0,
                potential_savings=0,
                potential_savings_percent=0,
                items_without_price=[item.id for item in shopping_list.items]
            )

        # Identifica itens sem preço
        items_with_price = set(ip.item_id for ip in item_prices)
        items_without_price = [
            item.id for item in shopping_list.items 
            if item.id not in items_with_price
        ]

        # Otimiza a distribuição
        allocations, exceeded_store_limit = self._optimize_allocation(item_prices, max_stores)

        # Itens que ficaram fora por conta do limite de lojas
        allocated_item_ids = {ip.item_id for alloc in allocations for ip in alloc.items}
        excluded_by_limit = [
            item.id for item in shopping_list.items
            if item.id not in allocated_item_ids and item.id not in items_without_price
        ]
        items_without_price = items_without_price + excluded_by_limit
        
        # Adiciona informações de pior preço e economia por item
        self._add_price_comparison(allocations, item_prices)
        
        # Calcula totais
        total_cost = sum(a.total for a in allocations)

        # Total no pior preço (considerando apenas lojas com preço recente para cada item)
        total_worst_cost = 0.0
        for allocation in allocations:
            for ip in allocation.items:
                worst_unit = ip.worst_price if ip.worst_price and ip.worst_price > 0 else ip.price
                total_worst_cost += worst_unit * ip.quantity
        
        # Calcula quanto custaria em uma única loja (a mais barata no geral)
        total_if_single_store = self._calculate_single_store_cost(item_prices)
        
        savings = total_if_single_store - total_cost
        savings_percent = (savings / total_if_single_store * 100) if total_if_single_store > 0 else 0

        potential_savings = total_worst_cost - total_cost
        potential_savings_percent = (potential_savings / total_worst_cost * 100) if total_worst_cost > 0 else 0

        # Salva os resultados no banco
        self._save_optimization(shopping_list, allocations, total_cost, savings)

        message = f"Lista otimizada em {len(allocations)} supermercado(s)"
        if excluded_by_limit and max_stores > 0:
            message = (
                f"Lista otimizada em {len(allocations)} supermercado(s) "
                f"(limitado a {max_stores}; {len(excluded_by_limit)} item(ns) ficaram sem preço dentro do limite)"
            )

        return OptimizationResult(
            success=True,
            message=message,
            allocations=allocations,
            total_cost=total_cost,
            total_if_single_store=total_if_single_store,
            savings=savings,
            savings_percent=savings_percent,
            total_worst_cost=total_worst_cost,
            potential_savings=potential_savings,
            potential_savings_percent=potential_savings_percent,
            items_without_price=items_without_price
        )

    def _get_item_prices(self, shopping_list: ShoppingList) -> list[ItemPrice]:
        """Busca os preços mais recentes para cada item em cada loja."""
        cutoff_date = datetime.now(UTC) - timedelta(days=self.price_lookback_days)
        
        # IDs dos produtos canônicos na lista
        canonical_ids = [item.canonical_id for item in shopping_list.items]
        
        # Subquery para pegar o preço mais recente de cada produto em cada loja
        latest_price_subq = (
            self.db.query(
                Price.canonical_id,
                Price.loja_id,
                func.max(Price.data_coleta).label("max_date")
            )
            .filter(
                Price.canonical_id.in_(canonical_ids),
                Price.data_coleta >= cutoff_date
            )
            .group_by(Price.canonical_id, Price.loja_id)
            .subquery()
        )

        # Query principal
        prices = (
            self.db.query(Price, Store)
            .join(Store, Price.loja_id == Store.id)
            .join(
                latest_price_subq,
                and_(
                    Price.canonical_id == latest_price_subq.c.canonical_id,
                    Price.loja_id == latest_price_subq.c.loja_id,
                    Price.data_coleta == latest_price_subq.c.max_date
                )
            )
            .all()
        )

        # Mapeia item_id para canonical_id
        item_canonical_map = {item.id: item for item in shopping_list.items}
        canonical_item_map = {item.canonical_id: item for item in shopping_list.items}

        result = []
        for price, store in prices:
            item = canonical_item_map.get(price.canonical_id)
            if item:
                result.append(ItemPrice(
                    item_id=item.id,
                    canonical_id=price.canonical_id,
                    store_id=store.id,
                    store_name=store.nome_fantasia or store.razao_social,
                    price=price.preco_por_unidade,
                    quantity=item.quantity,
                    subtotal=price.preco_por_unidade * item.quantity
                ))

        return result

    def _optimize_allocation(
        self, 
        item_prices: list[ItemPrice], 
        max_stores: int
    ) -> tuple[list[StoreAllocation], bool]:
        """
        Algoritmo de otimização guloso.
        
        1. Para cada item, encontra a loja mais barata
        2. Se exceder max_stores, redistribui itens
        """
        exceeded_store_limit = False

        # Agrupa preços por item
        prices_by_item: dict[int, list[ItemPrice]] = defaultdict(list)
        for ip in item_prices:
            prices_by_item[ip.item_id].append(ip)

        # Tenta encontrar a melhor combinação de lojas (respeita max_stores de forma rígida)
        store_ids = sorted({ip.store_id for ip in item_prices})
        if 1 <= max_stores <= 3 and len(store_ids) <= 15:
            best_store_set, missing_items = self._find_best_store_set(prices_by_item, store_ids, max_stores)
            if best_store_set:
                allocation: dict[int, list[ItemPrice]] = defaultdict(list)
                for item_id, prices in prices_by_item.items():
                    if item_id in missing_items:
                        continue
                    best = min((p for p in prices if p.store_id in best_store_set), key=lambda x: x.price, default=None)
                    if best:
                        allocation[best.store_id].append(best)

                return self._allocation_to_result(allocation), False

        # Ordena preços de cada item do mais barato ao mais caro
        for item_id in prices_by_item:
            prices_by_item[item_id].sort(key=lambda x: x.price)

        # Primeira passada: aloca cada item à loja mais barata
        allocation: dict[int, list[ItemPrice]] = defaultdict(list)  # store_id -> items
        item_allocation: dict[int, ItemPrice] = {}  # item_id -> ItemPrice escolhido

        for item_id, prices in prices_by_item.items():
            if prices:
                best = prices[0]
                allocation[best.store_id].append(best)
                item_allocation[item_id] = best

        # Se excedeu o limite de lojas, precisa redistribuir
        if len(allocation) > max_stores:
            allocation, item_allocation, exceeded_store_limit = self._redistribute(
                prices_by_item, 
                allocation, 
                item_allocation, 
                max_stores
            )

        result = self._allocation_to_result(allocation)
        return result, exceeded_store_limit

    def _allocation_to_result(self, allocation: dict[int, list[ItemPrice]]) -> list[StoreAllocation]:
        """Converte alocação (store_id -> itens) para StoreAllocation."""
        result: list[StoreAllocation] = []
        for store_id, items in allocation.items():
            if items:
                store = self.db.get(Store, store_id)
                result.append(StoreAllocation(
                    store_id=store_id,
                    store_name=store.nome_fantasia or store.razao_social if store else "Desconhecido",
                    store_address=f"{store.endereco}, {store.cidade}" if store else "",
                    items=items,
                    total=sum(ip.subtotal for ip in items)
                ))

        result.sort(key=lambda x: x.total, reverse=True)
        return result

    def _find_best_store_set(
        self,
        prices_by_item: dict[int, list[ItemPrice]],
        store_ids: list[int],
        max_stores: int,
    ) -> tuple[set[int] | None, set[int]]:
        """Encontra o conjunto de lojas (<= max_stores). Se não cobrir todos os itens, escolhe o que cobre mais itens."""
        best_total: float | None = None
        best_set: set[int] | None = None
        best_missing: set[int] = set()
        best_covered_count = -1

        for k in range(1, max_stores + 1):
            for combo in itertools.combinations(store_ids, k):
                combo_set = set(combo)
                total = 0.0
                missing: set[int] = set()
                covered_count = 0

                for item_id, prices in prices_by_item.items():
                    best = min((p for p in prices if p.store_id in combo_set), key=lambda x: x.price, default=None)
                    if not best:
                        missing.add(item_id)
                        continue
                    covered_count += 1
                    total += best.subtotal

                if covered_count > best_covered_count:
                    best_covered_count = covered_count
                    best_total = total
                    best_set = combo_set
                    best_missing = missing
                elif covered_count == best_covered_count and covered_count > 0:
                    if best_total is None or total < best_total:
                        best_total = total
                        best_set = combo_set
                        best_missing = missing

        return best_set, best_missing

    def _redistribute(
        self,
        prices_by_item: dict[int, list[ItemPrice]],
        allocation: dict[int, list[ItemPrice]],
        item_allocation: dict[int, ItemPrice],
        max_stores: int
    ) -> tuple[dict[int, list[ItemPrice]], dict[int, ItemPrice], bool]:
        """
        Redistribui itens quando há mais lojas que o permitido.
        
        Estratégia: mantém as N lojas com maior economia total e
        redistribui os itens das outras lojas para essas N.
        """
        exceeded_store_limit = False

        # Calcula o "valor" de cada loja (economia que ela proporciona)
        store_value: dict[int, float] = defaultdict(float)
        
        for item_id, chosen in item_allocation.items():
            prices = prices_by_item[item_id]
            if len(prices) > 1:
                # Economia = diferença entre o preço escolhido e o segundo mais barato
                # Se a loja escolhida é a mais barata, ela tem valor positivo
                second_best = prices[1].subtotal if prices[0].store_id == chosen.store_id else prices[0].subtotal
                store_value[chosen.store_id] += second_best - chosen.subtotal

        # Lojas obrigatórias: itens que só têm preço recente em uma única loja
        required_stores: set[int] = set()
        for item_id, prices in prices_by_item.items():
            unique_stores = {p.store_id for p in prices}
            if len(unique_stores) == 1:
                required_stores.update(unique_stores)

        # Seleciona as top N lojas por valor, garantindo inclusão das obrigatórias
        ranked_stores = sorted(store_value.keys(), key=lambda x: store_value[x], reverse=True)
        top_stores: list[int] = []
        for s in sorted(required_stores):
            if s not in top_stores:
                top_stores.append(s)
        for s in ranked_stores:
            if len(top_stores) >= max_stores:
                break
            if s not in top_stores:
                top_stores.append(s)

        top_stores_set = set(top_stores)
        if len(required_stores) > max_stores:
            # Impossível respeitar max_stores se já existem mais lojas obrigatórias
            exceeded_store_limit = True
            top_stores_set = set(required_stores)

        # Redistribui itens de lojas não selecionadas
        new_allocation: dict[int, list[ItemPrice]] = defaultdict(list)
        new_item_allocation: dict[int, ItemPrice] = {}

        for item_id, prices in prices_by_item.items():
            # Encontra o melhor preço entre as lojas selecionadas
            best_in_top = None
            for ip in prices:
                if ip.store_id in top_stores_set:
                    if best_in_top is None or ip.price < best_in_top.price:
                        best_in_top = ip

            if best_in_top:
                new_allocation[best_in_top.store_id].append(best_in_top)
                new_item_allocation[item_id] = best_in_top
            elif prices:
                # Se nenhuma loja top tem o item, usa a mais barata disponível
                # e adiciona essa loja (não há como respeitar o limite sem perder o item)
                best = prices[0]
                new_allocation[best.store_id].append(best)
                new_item_allocation[item_id] = best
                if best.store_id not in top_stores_set:
                    exceeded_store_limit = True

        return new_allocation, new_item_allocation, exceeded_store_limit

    def _add_price_comparison(
        self,
        allocations: list[StoreAllocation],
        all_prices: list[ItemPrice]
    ):
        """Adiciona informações de pior preço e economia por item."""
        # Agrupa todos os preços por item
        prices_by_item: dict[int, list[ItemPrice]] = defaultdict(list)
        for ip in all_prices:
            prices_by_item[ip.item_id].append(ip)
        
        # Para cada item alocado, encontra o pior preço
        for allocation in allocations:
            for item in allocation.items:
                item_prices = prices_by_item.get(item.item_id, [])
                if item_prices:
                    # Encontra o preço mais caro
                    worst = max(item_prices, key=lambda x: x.price)
                    item.worst_price = worst.price
                    item.worst_store_name = worst.store_name
                    # Economia = (pior preço - melhor preço) * quantidade
                    item.item_savings = (worst.price - item.price) * item.quantity

    def _calculate_single_store_cost(self, item_prices: list[ItemPrice]) -> float:
        """Calcula quanto custaria comprar tudo em uma única loja."""
        # Agrupa por loja
        store_totals: dict[int, float] = defaultdict(float)
        store_items: dict[int, set] = defaultdict(set)
        
        for ip in item_prices:
            store_items[ip.store_id].add(ip.item_id)

        # Encontra lojas que têm todos os itens
        all_items = set(ip.item_id for ip in item_prices)
        complete_stores = [
            store_id for store_id, items in store_items.items()
            if items == all_items
        ]

        if not complete_stores:
            # Nenhuma loja tem todos os itens, usa a média
            prices_by_item: dict[int, list[float]] = defaultdict(list)
            for ip in item_prices:
                prices_by_item[ip.item_id].append(ip.subtotal)
            
            return sum(max(prices) for prices in prices_by_item.values())

        # Calcula o total em cada loja completa
        for ip in item_prices:
            if ip.store_id in complete_stores:
                store_totals[ip.store_id] += ip.subtotal

        # Retorna o menor total entre as lojas completas
        return min(store_totals[s] for s in complete_stores) if store_totals else 0

    def _save_optimization(
        self,
        shopping_list: ShoppingList,
        allocations: list[StoreAllocation],
        total_cost: float,
        savings: float
    ):
        """Salva os resultados da otimização no banco."""
        # Remove otimizações anteriores
        self.db.query(OptimizedShoppingItem).filter(
            OptimizedShoppingItem.shopping_list_id == shopping_list.id
        ).delete()

        # Salva novas alocações
        for allocation in allocations:
            for item_price in allocation.items:
                opt_item = OptimizedShoppingItem(
                    shopping_list_id=shopping_list.id,
                    store_id=allocation.store_id,
                    item_id=item_price.item_id,
                    price=item_price.price,
                    quantity=item_price.quantity,
                    subtotal=item_price.subtotal,
                    price_rank=1  # TODO: calcular rank real
                )
                self.db.add(opt_item)

        # Atualiza a lista
        shopping_list.status = ShoppingListStatus.OPTIMIZED.value
        shopping_list.total_estimated = total_cost
        shopping_list.total_savings = savings
        shopping_list.optimized_at = datetime.now(UTC)

        self.db.commit()
