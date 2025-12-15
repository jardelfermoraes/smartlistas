/**
 * Hooks para Lista de Compras
 * @module shopping/hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shoppingService } from '../services/shoppingService';
import type { ShoppingListCreate, ShoppingListItemCreate } from '../types';

const QUERY_KEYS = {
  lists: ['shopping-lists'] as const,
  list: (id: number) => ['shopping-lists', id] as const,
  optimization: (id: number) => ['shopping-lists', id, 'optimization'] as const,
};

/**
 * Hook para listar todas as listas de compras
 */
export function useShoppingLists(status?: string) {
  return useQuery({
    queryKey: [...QUERY_KEYS.lists, status],
    queryFn: () => shoppingService.listAll(status),
  });
}

/**
 * Hook para obter detalhes de uma lista
 */
export function useShoppingList(id: number) {
  return useQuery({
    queryKey: QUERY_KEYS.list(id),
    queryFn: () => shoppingService.getById(id),
    enabled: id > 0,
  });
}

/**
 * Hook para criar uma lista
 */
export function useCreateShoppingList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ShoppingListCreate) => shoppingService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists });
    },
  });
}

/**
 * Hook para atualizar uma lista
 */
export function useUpdateShoppingList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ShoppingListCreate> }) =>
      shoppingService.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.list(id) });
    },
  });
}

/**
 * Hook para excluir uma lista
 */
export function useDeleteShoppingList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => shoppingService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists });
    },
  });
}

/**
 * Hook para adicionar item à lista
 */
export function useAddShoppingItem(listId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ShoppingListItemCreate) => shoppingService.addItem(listId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.list(listId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists });
    },
  });
}

/**
 * Hook para atualizar item da lista
 */
export function useUpdateShoppingItem(listId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: ShoppingListItemCreate }) =>
      shoppingService.updateItem(listId, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.list(listId) });
    },
  });
}

/**
 * Hook para remover item da lista
 */
export function useRemoveShoppingItem(listId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: number) => shoppingService.removeItem(listId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.list(listId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists });
    },
  });
}

/**
 * Hook para otimizar a lista
 */
export function useOptimizeShoppingList(listId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => shoppingService.optimize(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.list(listId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.lists });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.optimization(listId) });
    },
  });
}

/**
 * Hook para obter resultado da otimização
 */
export function useOptimizationResult(listId: number, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.optimization(listId),
    queryFn: () => shoppingService.getOptimization(listId),
    enabled: enabled && listId > 0,
  });
}
