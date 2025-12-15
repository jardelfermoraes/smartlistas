/**
 * Página de Detalhes da Lista de Compras
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Trash2, 
  Sparkles, 
  Package,
  Minus,
  Plus,
  Settings,
  ShoppingCart
} from 'lucide-react';
import {
  useShoppingList,
  useAddShoppingItem,
  useUpdateShoppingItem,
  useRemoveShoppingItem,
  useOptimizeShoppingList,
  useUpdateShoppingList,
  ProductSelector,
  ShoppingListForm,
  OptimizationResult,
  formatProductDisplayName,
} from '../modules/shopping';
import type { ShoppingListCreate, OptimizationResultType } from '../modules/shopping';

export function ShoppingListDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const listId = parseInt(id || '0');

  const [showSettings, setShowSettings] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResultType | null>(null);

  const { data: list, isLoading, error } = useShoppingList(listId);
  const addItemMutation = useAddShoppingItem(listId);
  const updateItemMutation = useUpdateShoppingItem(listId);
  const removeItemMutation = useRemoveShoppingItem(listId);
  const optimizeMutation = useOptimizeShoppingList(listId);
  const updateListMutation = useUpdateShoppingList();

  // Auto-otimiza se veio com ?optimize=true
  useEffect(() => {
    if (searchParams.get('optimize') === 'true' && list && list.items.length > 0) {
      handleOptimize();
    }
  }, [searchParams, list?.id]);

  const handleAddProduct = async (product: { id: number; nome: string }, quantity: number) => {
    await addItemMutation.mutateAsync({
      canonical_id: product.id,
      quantity,
      unit: 'un',
    });
  };

  const handleUpdateQuantity = async (itemId: number, canonicalId: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeItemMutation.mutate(itemId);
    } else {
      updateItemMutation.mutate({
        itemId,
        data: { canonical_id: canonicalId, quantity: newQuantity, unit: 'un' },
      });
    }
  };

  const handleRemoveItem = (itemId: number) => {
    removeItemMutation.mutate(itemId);
  };

  const handleOptimize = async () => {
    const result = await optimizeMutation.mutateAsync();
    setOptimizationResult(result);
  };

  const handleUpdateSettings = async (data: ShoppingListCreate) => {
    await updateListMutation.mutateAsync({ id: listId, data });
    setShowSettings(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Lista não encontrada</p>
        <button
          onClick={() => navigate('/shopping')}
          className="mt-4 text-blue-600 hover:underline"
        >
          Voltar para listas
        </button>
      </div>
    );
  }

  // Se tem resultado de otimização, mostra
  if (optimizationResult) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setOptimizationResult(null)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={20} />
          Voltar para a lista
        </button>

        <OptimizationResult 
          result={optimizationResult} 
          listItems={list.items}
          onClose={() => setOptimizationResult(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/shopping')}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{list.name}</h1>
            {list.description && (
              <p className="text-gray-500">{list.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Configurações"
          >
            <Settings size={20} />
          </button>
          {list.items.length > 0 && (
            <button
              onClick={handleOptimize}
              disabled={optimizeMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {optimizeMutation.isPending ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sparkles size={18} />
              )}
              Otimizar Lista
            </button>
          )}
        </div>
      </div>

      {/* Info da lista */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <ShoppingCart size={18} className="text-blue-600" />
              <span className="text-sm text-gray-600">
                {list.items.length} {list.items.length === 1 ? 'item' : 'itens'}
              </span>
            </div>
            <div className="text-sm text-gray-600">
              Até {list.max_stores} supermercado{list.max_stores > 1 ? 's' : ''}
            </div>
          </div>
          {list.status === 'optimized' && list.total_estimated && (
            <div className="text-right">
              <span className="text-sm text-gray-600">Total estimado: </span>
              <span className="font-bold text-green-700">{formatCurrency(list.total_estimated)}</span>
              {list.total_savings && list.total_savings > 0 && (
                <span className="text-sm text-green-600 ml-2">
                  (economia de {formatCurrency(list.total_savings)})
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Adicionar produto */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <ProductSelector
          onSelect={handleAddProduct}
          excludeIds={list.items.map(i => i.canonical_id)}
        />
      </div>

      {/* Lista de itens */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Itens da Lista</h2>
        </div>

        {list.items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Package size={48} className="mx-auto mb-4 opacity-50" />
            <p>Nenhum item adicionado</p>
            <p className="text-sm">Use o campo acima para adicionar produtos</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {list.items.map((item) => (
              <div key={item.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Package size={20} className="text-gray-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{formatProductDisplayName(item)}</p>
                    {item.product_brand && (
                      <p className="text-xs text-gray-500">{item.product_brand}</p>
                    )}
                    {item.best_price && (
                      <p className="text-sm text-green-600">
                        Melhor preço: {formatCurrency(item.best_price)}
                        {item.best_store_name && ` em ${item.best_store_name}`}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Controle de quantidade */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleUpdateQuantity(item.id, item.canonical_id, item.quantity - 1)}
                      className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    >
                      <Minus size={18} />
                    </button>
                    <span className="w-8 text-center font-medium">{item.quantity}</span>
                    <button
                      onClick={() => handleUpdateQuantity(item.id, item.canonical_id, item.quantity + 1)}
                      className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    >
                      <Plus size={18} />
                    </button>
                  </div>

                  {/* Remover */}
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de configurações */}
      {showSettings && (
        <ShoppingListForm
          initialData={{
            name: list.name,
            description: list.description || undefined,
            max_stores: list.max_stores,
          }}
          onSubmit={handleUpdateSettings}
          onCancel={() => setShowSettings(false)}
          isLoading={updateListMutation.isPending}
        />
      )}
    </div>
  );
}
