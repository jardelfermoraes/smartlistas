/**
 * Componente de resultado da otimização
 * @module shopping/components
 */

import { useMemo, useState } from 'react';
import { Store, Package, TrendingDown, AlertCircle, MapPin, CheckCircle } from 'lucide-react';
import type { OptimizationResult as OptResult, StoreAllocation, ShoppingListItem } from '../types';
import { formatProductDisplayName } from '../types';

interface OptimizationResultProps {
  result: OptResult;
  onClose?: () => void;
  listItems?: ShoppingListItem[];
}

/**
 * Exibe o resultado da otimização da lista de compras
 */
export function OptimizationResult({ result, onClose, listItems }: OptimizationResultProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  if (!result.success) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <div className="flex items-center gap-3 text-red-700">
          <AlertCircle size={24} />
          <div>
            <h3 className="font-semibold">Não foi possível otimizar</h3>
            <p className="text-sm">{result.message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle size={24} />
          <h2 className="text-xl font-bold">Lista Otimizada!</h2>
        </div>

        <p className="text-green-100 text-sm mb-4">{result.message}</p>
        
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-green-100 text-sm">Total</p>
            <p className="text-2xl font-bold">{formatCurrency(result.total_cost)}</p>
          </div>
          <div>
            <p className="text-green-100 text-sm">Economia</p>
            <p className="text-2xl font-bold flex items-center gap-1">
              <TrendingDown size={20} />
              {formatCurrency(result.savings)}
            </p>
          </div>
          <div>
            <p className="text-green-100 text-sm">Você economiza</p>
            <p className="text-2xl font-bold">{result.savings_percent.toFixed(1)}%</p>
          </div>
        </div>

        <p className="text-green-100 text-sm mt-4">{result.message}</p>
      </div>

      {/* Comparativo (melhor vs pior) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Total no melhor preço</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(result.total_cost)}</p>
          <p className="text-xs text-gray-500 mt-1">Otimizado</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Total no pior preço</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(result.total_worst_cost || 0)}</p>
          <p className="text-xs text-gray-500 mt-1">Maior preço recente por item</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Economia potencial</p>
          <p className="text-xl font-bold text-blue-700 flex items-center gap-2">
            <TrendingDown size={18} />
            {formatCurrency(result.potential_savings || 0)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {((result.potential_savings_percent || 0)).toFixed(1)}% vs pior preço
          </p>
        </div>
      </div>

      {/* Itens sem preço */}
      {result.items_without_price.length > 0 && (
        <ItemsWithoutPriceAlert
          count={result.items_without_price.length}
          itemIds={result.items_without_price}
          listItems={listItems}
        />
      )}

      {/* Listas por supermercado */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Suas listas de compras</h3>
        
        {result.allocations.map((allocation, index) => (
          <StoreCard key={allocation.store_id} allocation={allocation} index={index + 1} />
        ))}
      </div>

      {/* Botão fechar */}
      {onClose && (
        <button
          onClick={onClose}
          className="w-full py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
        >
          Fechar
        </button>
      )}
    </div>
  );
}

interface ItemsWithoutPriceAlertProps {
  count: number;
  itemIds: number[];
  listItems?: ShoppingListItem[];
}

function ItemsWithoutPriceAlert({ count, itemIds, listItems }: ItemsWithoutPriceAlertProps) {
  const [open, setOpen] = useState(false);

  const byId = useMemo(() => {
    const map = new Map<number, ShoppingListItem>();
    (listItems || []).forEach((it) => map.set(it.id, it));
    return map;
  }, [listItems]);

  const resolved = useMemo(() => {
    return itemIds
      .map((id) => ({ id, item: byId.get(id) }))
      .sort((a, b) => {
        const an = a.item ? formatProductDisplayName(a.item) : '';
        const bn = b.item ? formatProductDisplayName(b.item) : '';
        return an.localeCompare(bn);
      });
  }, [itemIds, byId]);

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 text-yellow-800">
          <AlertCircle size={18} className="mt-0.5" />
          <div>
            <p className="font-medium">{count} item(ns) ficaram sem preço dentro do limite</p>
            <p className="text-sm text-yellow-700 mt-1">
              Sugestões: aumente o número máximo de supermercados ou importe mais cupons para ter preço recente.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-sm font-medium text-yellow-800 hover:underline whitespace-nowrap"
        >
          {open ? 'Ocultar itens' : 'Ver itens'}
        </button>
      </div>

      {open && (
        <div className="mt-3 bg-white rounded-lg border border-yellow-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {resolved.map(({ id, item }) => (
              <div key={id} className="px-3 py-2 flex items-center justify-between">
                <div className="text-sm text-gray-900">
                  {item ? formatProductDisplayName(item) : `Item #${id}`}
                </div>
                <div className="text-sm text-gray-500">
                  {item ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface StoreCardProps {
  allocation: StoreAllocation;
  index: number;
}

function StoreCard({ allocation, index }: StoreCardProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const colors = [
    'border-blue-500 bg-blue-50',
    'border-green-500 bg-green-50',
    'border-purple-500 bg-purple-50',
    'border-orange-500 bg-orange-50',
    'border-pink-500 bg-pink-50',
  ];

  const colorClass = colors[(index - 1) % colors.length];

  return (
    <div className={`border-l-4 rounded-lg p-4 ${colorClass}`}>
      {/* Header da loja */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
            <Store size={20} className="text-gray-600" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900">
              Lista {index}: {allocation.store_name}
            </h4>
            {allocation.store_address && (
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <MapPin size={12} />
                {allocation.store_address}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">{allocation.items.length} itens</p>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(allocation.total)}</p>
        </div>
      </div>

      {/* Tabela de itens com comparação */}
      <div className="bg-white rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Produto</th>
              <th className="text-center px-3 py-2 font-medium text-green-600">Melhor Preço</th>
              <th className="text-center px-3 py-2 font-medium text-red-600">Pior Preço</th>
              <th className="text-right px-3 py-2 font-medium text-blue-600">Economia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {allocation.items.map((item) => (
              <tr key={item.item_id}>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Package size={14} className="text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900">{item.product_name}</p>
                      <p className="text-xs text-gray-500">{item.quantity}x</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  <div className="text-green-700 font-medium">{formatCurrency(item.price)}</div>
                  <div className="text-xs text-gray-500">Total: {formatCurrency(item.subtotal)}</div>
                </td>
                <td className="px-3 py-3 text-center">
                  {item.worst_price > 0 && item.worst_price !== item.price ? (
                    <>
                      <div className="text-red-600 font-medium">{formatCurrency(item.worst_price)}</div>
                      <div className="text-xs text-gray-500 truncate max-w-[100px]" title={item.worst_store_name}>
                        {item.worst_store_name}
                      </div>
                    </>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  {item.item_savings > 0 ? (
                    <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                      <TrendingDown size={14} />
                      {formatCurrency(item.item_savings)}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
