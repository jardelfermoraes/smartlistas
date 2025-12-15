import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, TrendingDown, TrendingUp } from 'lucide-react';
import { pricesApi, productsApi } from '../api/client';

export function Prices() {
  const [page, setPage] = useState(1);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);

  const { data: products } = useQuery({
    queryKey: ['products', 'search', productSearch],
    queryFn: () => productsApi.list({ search: productSearch || undefined, page: 1 }),
    enabled: productSearch.length > 2,
  });

  const { data: prices, isLoading } = useQuery({
    queryKey: ['prices', page, selectedProduct],
    queryFn: () => pricesApi.list({ page, produto_id: selectedProduct || undefined }),
  });

  const { data: compare } = useQuery({
    queryKey: ['prices', 'compare', selectedProduct],
    queryFn: () => pricesApi.compare(selectedProduct!, 30),
    enabled: !!selectedProduct,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Preços</h1>
        <p className="text-gray-500 mt-1">Compare preços entre lojas</p>
      </div>

      {/* Search Product */}
      <div className="card mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Buscar Produto para Comparar
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Digite o nome do produto..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        
        {/* Search Results */}
        {products && products.data.items.length > 0 && (
          <div className="mt-2 border rounded-lg divide-y max-h-48 overflow-y-auto">
            {products.data.items.map((product) => (
              <button
                key={product.id}
                onClick={() => {
                  setSelectedProduct(product.id);
                  setProductSearch('');
                }}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
              >
                <span>{product.descricao_norm}</span>
                <span className="text-sm text-gray-500">{product.marca || ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Price Comparison */}
      {selectedProduct && compare?.data && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{compare.data.produto_descricao}</h2>
            <button
              onClick={() => setSelectedProduct(null)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Limpar seleção
            </button>
          </div>

          {compare.data.precos.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              Nenhum preço registrado para este produto
            </p>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 text-green-600 mb-1">
                    <TrendingDown size={18} />
                    <span className="text-sm">Menor Preço</span>
                  </div>
                  <p className="text-2xl font-bold text-green-700">
                    R$ {compare.data.menor_preco?.toFixed(2)}
                  </p>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-blue-600 text-sm mb-1">Preço Médio</div>
                  <p className="text-2xl font-bold text-blue-700">
                    R$ {compare.data.preco_medio?.toFixed(2)}
                  </p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 text-red-600 mb-1">
                    <TrendingUp size={18} />
                    <span className="text-sm">Maior Preço</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700">
                    R$ {compare.data.maior_preco?.toFixed(2)}
                  </p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-purple-600 text-sm mb-1">Economia Máxima</div>
                  <p className="text-2xl font-bold text-purple-700">
                    R$ {((compare.data.maior_preco || 0) - (compare.data.menor_preco || 0)).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Price List */}
              <h3 className="font-medium text-gray-900 mb-3">
                Preços por Loja ({compare.data.total_lojas} lojas)
              </h3>
              <div className="space-y-2">
                {compare.data.precos.map((preco, index) => {
                  const savings = (compare.data.maior_preco || 0) - preco.preco;
                  return (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-4 rounded-lg ${
                        index === 0 ? 'bg-green-50 border-2 border-green-300' : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        {index === 0 && (
                          <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                            MELHOR PREÇO
                          </span>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">
                            {preco.loja_nome || 'Loja sem nome'}
                          </p>
                          <p className="text-sm text-gray-500">{preco.loja_cidade || '-'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-bold ${index === 0 ? 'text-green-700' : 'text-gray-900'}`}>
                          R$ {preco.preco.toFixed(2)}
                        </p>
                        {savings > 0 && index !== 0 && (
                          <p className="text-sm text-red-500">
                            +R$ {savings.toFixed(2)} vs menor
                          </p>
                        )}
                        <p className="text-xs text-gray-400">
                          {new Date(preco.data_coleta).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Recent Prices Table */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Últimos Preços Registrados</h2>
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Carregando...</div>
        ) : prices?.data.items.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Nenhum preço registrado ainda
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Produto</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Loja</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Preço</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Data</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Fonte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {prices?.data.items.map((price) => (
                  <tr key={price.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      Produto #{price.produto_id}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      Loja #{price.loja_id}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      R$ {price.preco_por_unidade.toFixed(2)}
                      <span className="text-gray-500 text-sm">/{price.unidade_base}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(price.data_coleta).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        price.fonte === 'cupom' 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {price.fonte}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {prices && prices.data.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">
              Página {prices.data.page} de {prices.data.pages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= prices.data.pages}
                className="btn-secondary disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
