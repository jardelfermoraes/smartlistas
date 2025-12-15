import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { receiptsApi } from '../api/client';
import { Search, Trash2, FileText, Upload, CheckCircle, Clock, AlertCircle, Play, Loader2, Edit } from 'lucide-react';
import { ImportReceiptModal } from '../components/ImportReceiptModal';
import { ManualReceiptModal } from '../components/ManualReceiptModal';

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pendente: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  baixado: { label: 'Baixado', color: 'bg-blue-100 text-blue-700', icon: FileText },
  processado: { label: 'Processado', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  erro: { label: 'Erro', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

export function Receipts() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['receipts', page, statusFilter],
    queryFn: () => receiptsApi.list({ page, status: statusFilter || undefined }),
  });

  const deleteMutation = useMutation({
    mutationFn: (chave: string) => receiptsApi.delete(chave),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
    },
  });

  const [processingChave, setProcessingChave] = useState<string | null>(null);
  
  const processMutation = useMutation({
    mutationFn: (chave: string) => receiptsApi.process(chave),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      setProcessingChave(null);
    },
    onError: () => {
      setProcessingChave(null);
    },
  });

  const handleProcess = (chave: string) => {
    setProcessingChave(chave);
    processMutation.mutate(chave);
  };

  const handleDelete = (chave: string) => {
    if (confirm('Deseja remover este cupom?')) {
      deleteMutation.mutate(chave);
    }
  };

  const filteredReceipts = data?.data.items.filter(
    (r) => !search || r.chave_acesso.includes(search) || r.cnpj_emissor?.includes(search)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cupons Fiscais</h1>
          <p className="text-gray-500 mt-1">Gerencie os cupons importados</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowManualModal(true)}
            className="btn-secondary flex items-center gap-2"
          >
            <Edit size={20} />
            Entrada Manual
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Upload size={20} />
            Importar Cupom
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por chave ou CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="input w-full md:w-48"
          >
            <option value="">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="baixado">Baixado</option>
            <option value="processado">Processado</option>
            <option value="erro">Erro</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Carregando...</div>
        ) : filteredReceipts?.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Nenhum cupom encontrado
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Chave de Acesso</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">CNPJ</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">UF</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Total</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Data</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredReceipts?.map((receipt) => {
                  const status = statusConfig[receipt.status] || statusConfig.pendente;
                  const StatusIcon = status.icon;
                  return (
                    <tr key={receipt.chave_acesso} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-mono text-sm text-gray-900">
                          {receipt.chave_acesso.substring(0, 20)}...
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-sm">
                        {receipt.cnpj_emissor || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {receipt.estado || '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {receipt.total > 0 ? `R$ ${receipt.total.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${status.color}`}>
                          <StatusIcon size={14} />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-sm">
                        {receipt.data_emissao
                          ? new Date(receipt.data_emissao).toLocaleDateString('pt-BR')
                          : new Date(receipt.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {(receipt.status === 'pendente' || receipt.status === 'erro') && (
                            <button
                              onClick={() => handleProcess(receipt.chave_acesso)}
                              disabled={processingChave === receipt.chave_acesso}
                              className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"
                              title="Processar cupom"
                            >
                              {processingChave === receipt.chave_acesso ? (
                                <Loader2 size={18} className="animate-spin" />
                              ) : (
                                <Play size={18} />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(receipt.chave_acesso)}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

      {/* Import Modal */}
      {showImportModal && (
        <ImportReceiptModal onClose={() => setShowImportModal(false)} />
      )}

      {/* Manual Entry Modal */}
      {showManualModal && (
        <ManualReceiptModal onClose={() => setShowManualModal(false)} />
      )}
    </div>
  );
}
