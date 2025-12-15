/**
 * Tipos do módulo de Lista de Compras
 * @module shopping/types
 */

export interface ShoppingListItem {
  id: number;
  canonical_id: number;
  product_name: string;
  product_size: string | null;
  product_brand: string | null;
  quantity: number;
  unit: string;
  notes: string | null;
  best_price: number | null;
  best_store_name: string | null;
}

/**
 * Formata o nome completo do produto com tamanho
 */
export function formatProductDisplayName(item: ShoppingListItem): string {
  let name = item.product_name;
  
  // Adiciona tamanho se disponível e não estiver no nome
  if (item.product_size) {
    const sizePattern = new RegExp(item.product_size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (!sizePattern.test(name)) {
      name = `${name} ${item.product_size}`;
    }
  }
  
  return name;
}

export interface ShoppingList {
  id: number;
  name: string;
  description: string | null;
  status: ShoppingListStatus;
  max_stores: number;
  latitude: number | null;
  longitude: number | null;
  radius_km: number;
  total_estimated: number | null;
  total_savings: number | null;
  optimized_at: string | null;
  items_count: number;
  created_at: string;
  updated_at: string;
}

export interface ShoppingListDetail extends ShoppingList {
  items: ShoppingListItem[];
}

export type ShoppingListStatus = 'draft' | 'ready' | 'optimized' | 'completed' | 'archived';

export interface ShoppingListCreate {
  name: string;
  description?: string;
  max_stores?: number;
  latitude?: number;
  longitude?: number;
  radius_km?: number;
}

export interface ShoppingListItemCreate {
  canonical_id: number;
  quantity: number;
  unit?: string;
  notes?: string;
}

export interface OptimizedItem {
  item_id: number;
  product_name: string;
  quantity: number;
  price: number;
  subtotal: number;
  worst_price: number;
  worst_store_name: string;
  item_savings: number;
}

export interface StoreAllocation {
  store_id: number;
  store_name: string;
  store_address: string;
  items: OptimizedItem[];
  total: number;
}

export interface OptimizationResult {
  success: boolean;
  message: string;
  allocations: StoreAllocation[];
  total_cost: number;
  total_if_single_store: number;
  savings: number;
  savings_percent: number;
  total_worst_cost: number;
  potential_savings: number;
  potential_savings_percent: number;
  items_without_price: number[];
}
