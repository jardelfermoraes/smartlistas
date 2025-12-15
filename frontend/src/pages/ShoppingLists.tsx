/**
 * Página de Listas de Compras
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ShoppingCart, Sparkles } from 'lucide-react';
import {
  useShoppingLists,
  useCreateShoppingList,
  useDeleteShoppingList,
  ShoppingListCard,
  ShoppingListForm,
} from '../modules/shopping';
import type { ShoppingListCreate } from '../modules/shopping';

export function ShoppingLists() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);

  const { data: lists, isLoading } = useShoppingLists();
  const createMutation = useCreateShoppingList();
  const deleteMutation = useDeleteShoppingList();

  const handleCreate = async (data: ShoppingListCreate) => {
    const newList = await createMutation.mutateAsync(data);
    setShowForm(false);
    navigate(`/shopping/${newList.id}`);
  };

  const handleDelete = (id: number) => {
    if (window.confirm('Deseja realmente excluir esta lista?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleOptimize = (id: number) => {
    navigate(`/shopping/${id}?optimize=true`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Listas de Compras</h1>
          <p className="text-gray-500 mt-1">
            Crie suas listas e economize comprando nos supermercados certos
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Nova Lista
        </button>
      </div>

      {/* Dica */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Sparkles className="text-green-600" size={20} />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Como funciona?</h3>
            <p className="text-sm text-gray-600 mt-1">
              1. Crie uma lista com os produtos que precisa comprar<br />
              2. Defina em quantos supermercados você aceita ir<br />
              3. Clique em "Otimizar" e veja a melhor divisão para economizar!
            </p>
          </div>
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : lists && lists.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map((list) => (
            <ShoppingListCard
              key={list.id}
              list={list}
              onClick={() => navigate(`/shopping/${list.id}`)}
              onEdit={() => navigate(`/shopping/${list.id}`)}
              onDelete={() => handleDelete(list.id)}
              onOptimize={list.items_count > 0 ? () => handleOptimize(list.id) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="text-gray-400" size={32} />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma lista criada</h3>
          <p className="text-gray-500 mb-4">
            Crie sua primeira lista de compras e comece a economizar!
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Criar Lista
          </button>
        </div>
      )}

      {/* Modal de criação */}
      {showForm && (
        <ShoppingListForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          isLoading={createMutation.isPending}
        />
      )}
    </div>
  );
}
