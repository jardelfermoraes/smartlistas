/**
 * Módulo de Lista de Compras
 * 
 * Este módulo fornece toda a infraestrutura para gerenciamento de listas de compras
 * e otimização de compras em múltiplos supermercados.
 * 
 * @example
 * import { 
 *   useShoppingLists, 
 *   useOptimizeShoppingList,
 *   ShoppingListCard,
 *   OptimizationResult 
 * } from '@/modules/shopping';
 * 
 * @module shopping
 */

// Hooks
export {
  useShoppingLists,
  useShoppingList,
  useCreateShoppingList,
  useUpdateShoppingList,
  useDeleteShoppingList,
  useAddShoppingItem,
  useUpdateShoppingItem,
  useRemoveShoppingItem,
  useOptimizeShoppingList,
  useOptimizationResult,
} from './hooks/useShopping';

// Components
export { ProductSelector } from './components/ProductSelector';
export { ShoppingListCard } from './components/ShoppingListCard';
export { ShoppingListForm } from './components/ShoppingListForm';
export { OptimizationResult } from './components/OptimizationResult';

// Services
export { shoppingService } from './services/shoppingService';

// Types
export type {
  ShoppingList,
  ShoppingListDetail,
  ShoppingListItem,
  ShoppingListStatus,
  ShoppingListCreate,
  ShoppingListItemCreate,
  OptimizedItem,
  StoreAllocation,
  OptimizationResult as OptimizationResultType,
} from './types';

// Utils
export { formatProductDisplayName } from './types';
