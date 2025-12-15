import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, X, BarChart2 } from 'lucide-react';
import { productsApi, pricesApi, Product } from '../api/client';

export function Products() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [comparingProduct, setComparingProduct] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, search],
    queryFn: () => productsApi.list({ page, search: search || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const handleDelete = (product: Product) => {
    if (confirm(`Deseja remover o produto "${product.descricao_norm}"?`)) {
      deleteMutation.mutate(product.id);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produtos</h1>
          <p className="text-gray-500 mt-1">Gerencie os produtos cadastrados</p>
        </div>
        <button
          onClick={() => {
            setEditingProduct(null);
            setShowModal(true);
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          Novo Produto
        </button>
      </div>

      {/* Search */}
      <div className="card mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por descrição, GTIN ou marca..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Carregando...</div>
        ) : data?.data.items.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Nenhum produto encontrado
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-2/5 px-4 py-3 text-left text-sm font-medium text-gray-600">Descrição</th>
                  <th className="w-1/6 px-4 py-3 text-left text-sm font-medium text-gray-600">GTIN</th>
                  <th className="w-1/6 px-4 py-3 text-left text-sm font-medium text-gray-600">Marca</th>
                  <th className="w-1/6 px-4 py-3 text-left text-sm font-medium text-gray-600">Categoria</th>
                  <th className="w-24 px-4 py-3 text-right text-sm font-medium text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.data.items.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 truncate" title={product.descricao_norm}>
                        {product.descricao_norm}
                      </div>
                      <div className="text-sm text-gray-500">Unidade: {product.unidade_base}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-sm">
                      {product.gtin || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {product.marca || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {product.categoria || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setComparingProduct(product.id)}
                          className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg"
                          title="Comparar preços"
                        >
                          <BarChart2 size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setEditingProduct(product);
                            setShowModal(true);
                          }}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(product)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.data.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">
              Página {data.data.page} de {data.data.pages} ({data.data.total} itens)
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
                disabled={page >= data.data.pages}
                className="btn-secondary disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <ProductModal
          product={editingProduct}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Compare Modal */}
      {comparingProduct && (
        <PriceCompareModal
          productId={comparingProduct}
          onClose={() => setComparingProduct(null)}
        />
      )}
    </div>
  );
}

function ProductModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    gtin: product?.gtin || '',
    descricao_norm: product?.descricao_norm || '',
    marca: product?.marca || '',
    categoria: product?.categoria || '',
    unidade_base: product?.unidade_base || 'un',
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => productsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof formData) => productsApi.update(product!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (product) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {product ? 'Editar Produto' : 'Novo Produto'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
            <input
              type="text"
              value={formData.descricao_norm}
              onChange={(e) => setFormData({ ...formData, descricao_norm: e.target.value })}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">GTIN (Código de Barras)</label>
            <input
              type="text"
              value={formData.gtin}
              onChange={(e) => setFormData({ ...formData, gtin: e.target.value })}
              className="input"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
              <input
                type="text"
                value={formData.marca}
                onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
              <select
                value={formData.unidade_base}
                onChange={(e) => setFormData({ ...formData, unidade_base: e.target.value })}
                className="input"
              >
                <option value="un">Unidade (un)</option>
                <option value="kg">Quilograma (kg)</option>
                <option value="g">Grama (g)</option>
                <option value="l">Litro (l)</option>
                <option value="ml">Mililitro (ml)</option>
                <option value="m">Metro (m)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <input
              type="text"
              value={formData.categoria}
              onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
              className="input"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PriceCompareModal({ productId, onClose }: { productId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['prices', 'compare', productId],
    queryFn: () => pricesApi.compare(productId, 30),
  });

  const compare = data?.data;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Comparação de Preços</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-120px)]">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Carregando...</div>
          ) : !compare || compare.precos.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Nenhum preço encontrado para este produto
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h3 className="font-medium text-gray-900 mb-2">{compare.produto_descricao}</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-sm text-green-600">Menor Preço</p>
                    <p className="text-2xl font-bold text-green-700">
                      R$ {compare.menor_preco?.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm text-blue-600">Preço Médio</p>
                    <p className="text-2xl font-bold text-blue-700">
                      R$ {compare.preco_medio?.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg">
                    <p className="text-sm text-red-600">Maior Preço</p>
                    <p className="text-2xl font-bold text-red-700">
                      R$ {compare.maior_preco?.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              <h4 className="font-medium text-gray-900 mb-3">
                Preços por Loja ({compare.total_lojas} lojas)
              </h4>
              <div className="space-y-2">
                {compare.precos.map((preco, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      index === 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-gray-900">{preco.loja_nome || 'Loja sem nome'}</p>
                      <p className="text-sm text-gray-500">{preco.loja_cidade || '-'}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${index === 0 ? 'text-green-700' : 'text-gray-900'}`}>
                        R$ {preco.preco.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(preco.data_coleta).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="p-4 border-t">
          <button onClick={onClose} className="btn-secondary w-full">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
