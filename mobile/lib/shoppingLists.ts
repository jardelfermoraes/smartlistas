import { storage } from '@/lib/storage';

export type ShoppingListItemDraft = {
  canonical_id: number;
  product_name: string;
  quantity: number;
  is_checked?: boolean;
};

export type ShoppingListOptimizationItem = {
  canonical_id: number;
  product_name: string;
  quantity: number;
  price: number;
  subtotal: number;
};

export type ShoppingListOptimizationAllocation = {
  store_id: number;
  store_name: string;
  store_address: string;
  total: number;
  items: ShoppingListOptimizationItem[];
};

export type ShoppingListOptimizationResult = {
  message: string;
  allocations: ShoppingListOptimizationAllocation[];
  total_cost: number;
  savings: number;
  savings_percent: number;
  optimized_at: string;
};

export type ShoppingListStatus = 'draft' | 'closed' | 'in_progress' | 'completed' | 'optimized';

export type ShoppingListDraft = {
  id: string;
  name: string;
  items: ShoppingListItemDraft[];
  status?: ShoppingListStatus;
  optimization?: ShoppingListOptimizationResult | null;
  updated_at: string;
  created_at: string;
};

const STORAGE_KEY = 'melhorcompra.shoppingLists.v1';

export async function loadShoppingLists(): Promise<ShoppingListDraft[]> {
  const raw = await storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as ShoppingListDraft[];
    if (!Array.isArray(data)) return [];
    return data.map((l) => {
      const items = Array.isArray(l.items)
        ? l.items.map((it) => ({
            ...it,
            is_checked: Boolean((it as any).is_checked),
          }))
        : [];

      const optRaw = (l as any).optimization;
      const optimization = optRaw && typeof optRaw === 'object' ? (optRaw as ShoppingListOptimizationResult) : null;

      return {
        ...l,
        items,
        status: (l.status as ShoppingListStatus) ?? 'draft',
        optimization,
      };
    });
  } catch {
    return [];
  }
}

export async function saveShoppingLists(lists: ShoppingListDraft[]): Promise<void> {
  await storage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

export async function upsertShoppingList(list: Omit<ShoppingListDraft, 'updated_at'>): Promise<ShoppingListDraft> {
  const lists = await loadShoppingLists();
  const now = new Date().toISOString();

  const updated: ShoppingListDraft = {
    ...list,
    status: list.status ?? 'draft',
    optimization: (list as any).optimization ?? null,
    items: Array.isArray(list.items)
      ? list.items.map((it) => ({
          ...it,
          is_checked: Boolean((it as any).is_checked),
        }))
      : [],
    updated_at: now,
  };

  const idx = lists.findIndex((l) => l.id === list.id);
  const next = [...lists];
  if (idx >= 0) next[idx] = updated;
  else next.unshift(updated);

  await saveShoppingLists(next);
  return updated;
}

export async function deleteShoppingList(id: string): Promise<void> {
  const lists = await loadShoppingLists();
  const next = lists.filter((l) => l.id !== id);
  await saveShoppingLists(next);
}

export async function getShoppingListById(id: string): Promise<ShoppingListDraft | null> {
  const lists = await loadShoppingLists();
  return lists.find((l) => l.id === id) ?? null;
}

export function newId(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
