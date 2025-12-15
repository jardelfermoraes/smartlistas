/**
 * Componente de seleção de produtos canônicos
 * @module shopping/components
 */

import { useState, useEffect, useRef } from 'react';
import { Search, Plus, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';

interface Product {
  id: number;
  nome: string;
  categoria: string;
  marca: string | null;
  quantidade_padrao: number | null;
  unidade_padrao: string;
}

/**
 * Formata o nome do produto com tamanho
 */
function formatProductName(product: Product): string {
  let name = product.nome;
  
  // Adiciona quantidade/tamanho se disponível
  if (product.quantidade_padrao && product.unidade_padrao) {
    const unit = product.unidade_padrao.toLowerCase();
    const qty = product.quantidade_padrao;
    
    // Formata a quantidade (remove decimais desnecessários)
    const qtyStr = qty % 1 === 0 ? qty.toString() : qty.toFixed(1);
    
    // Verifica se o nome já contém o tamanho
    const sizePattern = new RegExp(`${qtyStr}\\s*${unit}`, 'i');
    if (!sizePattern.test(name)) {
      name = `${name} ${qtyStr}${unit}`;
    }
  }
  
  return name;
}

interface ProductSelectorProps {
  onSelect: (product: Product, quantity: number) => void;
  excludeIds?: number[];
}

/**
 * Componente para buscar e selecionar produtos canônicos
 */
export function ProductSelector({ onSelect, excludeIds = [] }: ProductSelectorProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Busca produtos
  const { data: products, isLoading } = useQuery({
    queryKey: ['canonical-search', search],
    queryFn: async () => {
      if (search.length < 2) return [];
      const response = await api.get<{ items: Product[] }>('/canonical', {
        params: { search, limit: 10 }
      });
      return response.data.items.filter(p => !excludeIds.includes(p.id));
    },
    enabled: search.length >= 2,
  });

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setSearch(formatProductName(product));
    setIsOpen(false);
  };

  const handleAdd = () => {
    if (selectedProduct && quantity > 0) {
      onSelect(selectedProduct, quantity);
      setSearch('');
      setSelectedProduct(null);
      setQuantity(1);
      inputRef.current?.focus();
    }
  };

  const handleClear = () => {
    setSearch('');
    setSelectedProduct(null);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="flex gap-2 items-end">
      {/* Campo de busca */}
      <div className="flex-1 relative" ref={dropdownRef}>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Adicionar produto
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedProduct(null);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Buscar produto..."
            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {search && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Dropdown de resultados */}
        {isOpen && search.length >= 2 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : products && products.length > 0 ? (
              products.map((product) => (
                <button
                  key={product.id}
                  onClick={() => handleSelectProduct(product)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <p className="font-medium text-gray-900">{formatProductName(product)}</p>
                  <p className="text-sm text-gray-500">
                    {product.categoria}
                    {product.marca && ` • ${product.marca}`}
                  </p>
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-gray-500">
                Nenhum produto encontrado
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quantidade */}
      <div className="w-24">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Qtd
        </label>
        <input
          type="number"
          min="1"
          step="1"
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-center"
        />
      </div>

      {/* Botão adicionar */}
      <button
        onClick={handleAdd}
        disabled={!selectedProduct}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <Plus size={18} />
        Adicionar
      </button>
    </div>
  );
}
