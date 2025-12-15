/**
 * Card de lista de compras
 * @module shopping/components
 */

import { ShoppingCart, Clock, CheckCircle, Archive, Edit2, Trash2, Sparkles } from 'lucide-react';
import type { ShoppingList, ShoppingListStatus } from '../types';

interface ShoppingListCardProps {
  list: ShoppingList;
  onEdit?: () => void;
  onDelete?: () => void;
  onOptimize?: () => void;
  onClick?: () => void;
}

const statusConfig: Record<ShoppingListStatus, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: 'Rascunho', color: 'bg-gray-100 text-gray-700', icon: Edit2 },
  ready: { label: 'Pronta', color: 'bg-blue-100 text-blue-700', icon: Clock },
  optimized: { label: 'Otimizada', color: 'bg-green-100 text-green-700', icon: Sparkles },
  completed: { label: 'Concluída', color: 'bg-purple-100 text-purple-700', icon: CheckCircle },
  archived: { label: 'Arquivada', color: 'bg-gray-100 text-gray-500', icon: Archive },
};

/**
 * Card para exibir resumo de uma lista de compras
 */
export function ShoppingListCard({ list, onEdit, onDelete, onOptimize, onClick }: ShoppingListCardProps) {
  const status = statusConfig[list.status] || statusConfig.draft;
  const StatusIcon = status.icon;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    });
  };

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <ShoppingCart className="text-blue-600" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{list.name}</h3>
            <p className="text-sm text-gray-500">{list.items_count} itens</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
          <StatusIcon size={12} />
          {status.label}
        </span>
      </div>

      {/* Descrição */}
      {list.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">{list.description}</p>
      )}

      {/* Valores (se otimizada) */}
      {list.status === 'optimized' && list.total_estimated && (
        <div className="bg-green-50 rounded-lg p-3 mb-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Total estimado</span>
            <span className="font-bold text-green-700">{formatCurrency(list.total_estimated)}</span>
          </div>
          {list.total_savings && list.total_savings > 0 && (
            <div className="flex justify-between items-center mt-1">
              <span className="text-sm text-gray-600">Economia</span>
              <span className="text-sm font-medium text-green-600">
                -{formatCurrency(list.total_savings)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Até {list.max_stores} supermercado{list.max_stores > 1 ? 's' : ''}</span>
        <span>{formatDate(list.updated_at)}</span>
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
        {list.status === 'draft' && list.items_count > 0 && onOptimize && (
          <button
            onClick={(e) => { e.stopPropagation(); onOptimize(); }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <Sparkles size={16} />
            Otimizar
          </button>
        )}
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Editar"
          >
            <Edit2 size={18} />
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Excluir"
          >
            <Trash2 size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
