import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Package, Tag, ChevronDown, ChevronUp, DollarSign, Store, MapPin, TrendingDown, BarChart3, Sparkles, Hash } from 'lucide-react';
import { canonicalApi, CanonicalProduct } from '../api/client';

export default function CanonicalProducts() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['canonical', page, search, categoria],
    queryFn: () => canonicalApi.list({ page, search: search || undefined, categoria: categoria || undefined }).then(r => r.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['canonical-categories'],
    queryFn: () => canonicalApi.getCategories().then(r => r.data),
  });

  const { data: kpis } = useQuery({
    queryKey: ['canonical-kpis'],
    queryFn: () => canonicalApi.kpis().then(r => r.data),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produtos Canônicos</h1>
          <p className="text-gray-500 mt-1">
            Produtos padronizados para comparação de preços entre lojas
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6">
          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Buscar por nome ou marca..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <select
                value={categoria}
                onChange={(e) => { setCategoria(e.target.value); setPage(1); }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todas as categorias</option>
                {categories?.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Buscar
              </button>
            </form>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
              Erro ao carregar produtos: {(error as Error).message}
            </div>
          )}

          {/* Products List */}
          {data && data.items.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="divide-y divide-gray-200">
                {data.items.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    isExpanded={expandedId === product.id}
                    onToggle={() => setExpandedId(expandedId === product.id ? null : product.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {data && data.items.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <Package className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum produto encontrado</h3>
              <p className="text-gray-500">
                {search || categoria
                  ? 'Tente ajustar os filtros de busca'
                  : 'Importe cupons fiscais para criar produtos canônicos automaticamente'}
              </p>
            </div>
          )}

          {/* Pagination */}
          {data && data.pages > 1 && (
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Anterior
              </button>
              <span className="px-4 py-2 text-gray-600">
                Página {page} de {data.pages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Próxima
              </button>
            </div>
          )}
        </div>

        {/* Sidebar KPIs */}
        <aside className="lg:col-span-4 xl:col-span-3">
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <BarChart3 className="text-blue-600" size={22} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total de Produtos</p>
                  <p className="text-2xl font-bold text-gray-900">{kpis?.total_products ?? data?.total ?? 0}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Sparkles className="text-purple-600" size={22} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Novos produtos</p>
                  <p className="text-sm text-gray-600">últimos 7 / 30 dias</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <p className="text-xs text-gray-500">7 dias</p>
                  <p className="text-xl font-semibold text-gray-900">{kpis?.new_last_7d ?? 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <p className="text-xs text-gray-500">30 dias</p>
                  <p className="text-xl font-semibold text-gray-900">{kpis?.new_last_30d ?? 0}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Tag className="text-green-600" size={22} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total por categoria</p>
                  <p className="text-xs text-gray-400">(top 10)</p>
                </div>
              </div>
              <div className="space-y-2">
                {(kpis?.categories || []).slice(0, 10).map((c) => (
                  <div key={c.categoria} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 truncate" title={c.categoria}>{c.categoria}</span>
                    <span className="text-gray-900 font-medium">{c.total}</span>
                  </div>
                ))}
                {!kpis?.categories?.length && (
                  <p className="text-sm text-gray-500">Sem dados.</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Hash className="text-amber-700" size={22} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Mais inseridos</p>
                  <p className="text-xs text-gray-400">(por cupons)</p>
                </div>
              </div>
              <div className="space-y-2">
                {(kpis?.top_inserted || []).slice(0, 10).map((p) => (
                  <div key={p.canonical_id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate" title={p.nome}>{p.nome}</p>
                      <p className="text-xs text-gray-500">{p.categoria || 'Sem categoria'}</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{p.inserts}</span>
                  </div>
                ))}
                {!kpis?.top_inserted?.length && (
                  <p className="text-sm text-gray-500">Sem dados.</p>
                )}
              </div>
            </div>

            {data && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Store className="text-gray-700" size={22} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Página</p>
                    <p className="text-xl font-semibold text-gray-900">{page} de {data.pages || 1}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ProductRow({ 
  product, 
  isExpanded, 
  onToggle 
}: { 
  product: CanonicalProduct; 
  isExpanded: boolean; 
  onToggle: () => void;
}) {
  // Usa o endpoint de detalhes que retorna tudo junto
  const { data: details, isLoading: loadingDetails } = useQuery({
    queryKey: ['canonical-details', product.id],
    queryFn: () => canonicalApi.getDetails(product.id).then(r => r.data),
    enabled: isExpanded,
  });

  // Calcula economia se houver mais de um preço
  const economia = details?.precos && details.precos.length > 1
    ? details.precos[details.precos.length - 1].preco - details.precos[0].preco
    : 0;

  return (
    <div>
      <div
        onClick={onToggle}
        className="p-4 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
      >
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-medium text-gray-900">{product.nome}</h3>
            {product.marca && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                {product.marca}
              </span>
            )}
            {product.categoria && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                {product.categoria}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Store size={14} />
              {product.alias_count} loja(s)
            </span>
            {product.quantidade_padrao && (
              <span>{product.quantidade_padrao}{product.unidade_padrao}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Preview do menor preço atual */}
          {product.preco_atual && (
            <div className="text-right hidden sm:block">
              <p className="text-sm text-gray-500">A partir de</p>
              <p className="font-bold text-green-600">R$ {product.preco_atual.toFixed(2)}</p>
            </div>
          )}
          <div className="text-gray-400">
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 bg-gray-50 border-t border-gray-200">
          {loadingDetails ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Resumo de economia */}
              {economia > 0 && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                  <TrendingDown className="text-green-600" size={24} />
                  <div>
                    <p className="font-medium text-green-800">
                      Economize até R$ {economia.toFixed(2)} comparando preços!
                    </p>
                    <p className="text-sm text-green-600">
                      Diferença entre o maior e menor preço encontrado
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                {/* Preços por Loja */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <DollarSign size={16} />
                    Preços por Loja
                  </h4>
                  {details?.precos && details.precos.length > 0 ? (
                    <div className="space-y-2">
                      {details.precos.map((price, idx) => (
                        <div 
                          key={price.loja_id} 
                          className={`bg-white rounded-lg p-3 border ${
                            idx === 0 ? 'border-green-300 ring-1 ring-green-200' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-gray-900">
                                {price.loja_fantasia || price.loja_nome}
                              </p>
                              {price.loja_fantasia && price.loja_nome !== price.loja_fantasia && (
                                <p className="text-xs text-gray-400">{price.loja_nome}</p>
                              )}
                              {price.loja_cidade && (
                                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                  <MapPin size={12} />
                                  {price.loja_cidade}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className={`text-lg font-bold ${idx === 0 ? 'text-green-600' : 'text-gray-900'}`}>
                                R$ {price.preco.toFixed(2)}
                              </p>
                              <p className="text-xs text-gray-500">
                                {new Date(price.data_coleta).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                          </div>
                          {idx === 0 && details.precos.length > 1 && (
                            <span className="inline-block mt-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                              ✓ Menor preço
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
                      <DollarSign className="mx-auto text-gray-300 mb-2" size={32} />
                      <p className="text-sm text-gray-500">Nenhum preço registrado ainda</p>
                    </div>
                  )}
                </div>

                {/* Descrições nas Lojas */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Tag size={16} />
                    Descrições nas Lojas
                  </h4>
                  {details?.aliases && details.aliases.length > 0 ? (
                    <div className="space-y-2">
                      {details.aliases.map((alias) => (
                        <div key={alias.id} className="bg-white rounded-lg p-3 border border-gray-200">
                          <p className="text-sm font-medium text-gray-900">{alias.descricao_original}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                            {alias.loja_nome && (
                              <span className="flex items-center gap-1">
                                <Store size={12} />
                                {alias.loja_nome}
                              </span>
                            )}
                            <span className={`px-1.5 py-0.5 rounded ${
                              alias.confianca >= 0.9 ? 'bg-green-100 text-green-700' :
                              alias.confianca >= 0.7 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {Math.round(alias.confianca * 100)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
                      <Tag className="mx-auto text-gray-300 mb-2" size={32} />
                      <p className="text-sm text-gray-500">Nenhuma descrição encontrada</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

