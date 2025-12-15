/**
 * Formulário de criação/edição de lista de compras
 * @module shopping/components
 */

import { useState } from 'react';
import { X, ShoppingCart } from 'lucide-react';
import type { ShoppingListCreate } from '../types';

interface ShoppingListFormProps {
  initialData?: Partial<ShoppingListCreate>;
  onSubmit: (data: ShoppingListCreate) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * Formulário para criar ou editar uma lista de compras
 */
export function ShoppingListForm({ initialData, onSubmit, onCancel, isLoading }: ShoppingListFormProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [maxStores, setMaxStores] = useState(initialData?.max_stores || 3);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      max_stores: maxStores,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <ShoppingCart className="text-blue-600" size={20} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              {initialData ? 'Editar Lista' : 'Nova Lista de Compras'}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Nome */}
          <div>
            <label htmlFor="list-name" className="block text-sm font-medium text-gray-700 mb-1">
              Nome da lista *
            </label>
            <input
              id="list-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              placeholder="Ex: Compras da Semana"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Descrição */}
          <div>
            <label htmlFor="list-description" className="block text-sm font-medium text-gray-700 mb-1">
              Descrição (opcional)
            </label>
            <textarea
              id="list-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={255}
              rows={2}
              placeholder="Ex: Itens para o churrasco de domingo"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>

          {/* Máximo de supermercados */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Quantos supermercados você aceita visitar?
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setMaxStores(num)}
                  className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                    maxStores === num
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {maxStores === 1 
                ? 'Comprar tudo em um único supermercado (menos economia)'
                : `Dividir compras em até ${maxStores} supermercados (mais economia)`
              }
            </p>
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isLoading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Salvando...' : initialData ? 'Salvar' : 'Criar Lista'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
