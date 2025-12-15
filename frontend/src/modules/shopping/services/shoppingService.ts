/**
 * Serviço de Lista de Compras - API calls
 * @module shopping/services
 */

import { api } from '../../../api/client';
import type {
  ShoppingList,
  ShoppingListDetail,
  ShoppingListCreate,
  ShoppingListItem,
  ShoppingListItemCreate,
  OptimizationResult,
} from '../types';

/**
 * Serviço de lista de compras
 */
export const shoppingService = {
  /**
   * Lista todas as listas de compras do usuário
   */
  async listAll(status?: string): Promise<ShoppingList[]> {
    const params = status ? { status_filter: status } : {};
    const response = await api.get<ShoppingList[]>('/shopping-lists', { params });
    return response.data;
  },

  /**
   * Obtém detalhes de uma lista
   */
  async getById(id: number): Promise<ShoppingListDetail> {
    const response = await api.get<ShoppingListDetail>(`/shopping-lists/${id}`);
    return response.data;
  },

  /**
   * Cria uma nova lista
   */
  async create(data: ShoppingListCreate): Promise<ShoppingList> {
    const response = await api.post<ShoppingList>('/shopping-lists', data);
    return response.data;
  },

  /**
   * Atualiza uma lista
   */
  async update(id: number, data: Partial<ShoppingListCreate>): Promise<ShoppingList> {
    const response = await api.put<ShoppingList>(`/shopping-lists/${id}`, data);
    return response.data;
  },

  /**
   * Exclui uma lista
   */
  async delete(id: number): Promise<void> {
    await api.delete(`/shopping-lists/${id}`);
  },

  /**
   * Adiciona um item à lista
   */
  async addItem(listId: number, data: ShoppingListItemCreate): Promise<ShoppingListItem> {
    const response = await api.post<ShoppingListItem>(`/shopping-lists/${listId}/items`, data);
    return response.data;
  },

  /**
   * Atualiza um item da lista
   */
  async updateItem(listId: number, itemId: number, data: ShoppingListItemCreate): Promise<ShoppingListItem> {
    const response = await api.put<ShoppingListItem>(`/shopping-lists/${listId}/items/${itemId}`, data);
    return response.data;
  },

  /**
   * Remove um item da lista
   */
  async removeItem(listId: number, itemId: number): Promise<void> {
    await api.delete(`/shopping-lists/${listId}/items/${itemId}`);
  },

  /**
   * Otimiza a lista de compras
   */
  async optimize(listId: number): Promise<OptimizationResult> {
    const response = await api.post<OptimizationResult>(`/shopping-lists/${listId}/optimize`);
    return response.data;
  },

  /**
   * Obtém resultado da última otimização
   */
  async getOptimization(listId: number): Promise<OptimizationResult> {
    const response = await api.get<OptimizationResult>(`/shopping-lists/${listId}/optimization`);
    return response.data;
  },
};
