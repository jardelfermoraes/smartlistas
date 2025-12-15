import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, ClipboardCopy, Search, XCircle } from 'lucide-react';

import { appReceiptKeysApi, AppReceiptKeySubmission } from '../api/client';

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700' },
  reviewed: { label: 'Revisado', color: 'bg-blue-100 text-blue-700' },
  processed: { label: 'Processado', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejeitado', color: 'bg-red-100 text-red-700' },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  try {
    return d.toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

export function AppReceiptKeys() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['app-receipt-keys', statusFilter, search],
    queryFn: () =>
      appReceiptKeysApi
        .list({
          page: 1,
          limit: 200,
          status: statusFilter || undefined,
          search: search || undefined,
        })
        .then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: number; status: string; notes?: string | null }) =>
      appReceiptKeysApi.update(id, { status, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-receipt-keys'] });
    },
  });

  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const handleCopy = async (chave: string) => {
    try {
      await navigator.clipboard.writeText(chave);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = chave;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const getStatusBadge = (status: string) => {
    const cfg = statusConfig[status] ?? { label: status, color: 'bg-gray-100 text-gray-700' };
    return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chaves recebidas (App)</h1>
          <p className="text-gray-500 mt-1">Triagem manual: copie a chave e faça a entrada no módulo de cupons</p>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por chave (44 dígitos)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input md:w-56">
            <option value="">Todos status</option>
            <option value="pending">Pendentes</option>
            <option value="processed">Processados</option>
            <option value="rejected">Rejeitados</option>
            <option value="reviewed">Revisados</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left p-4 font-semibold text-gray-700">Chave</th>
                <th className="text-left p-4 font-semibold text-gray-700">Origem</th>
                <th className="text-left p-4 font-semibold text-gray-700">Status</th>
                <th className="text-left p-4 font-semibold text-gray-700">Recebido</th>
                <th className="text-right p-4 font-semibold text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500">
                    Carregando...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500">
                    Nenhuma chave encontrada.
                  </td>
                </tr>
              ) : (
                rows.map((r: AppReceiptKeySubmission) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="p-4">
                      <div className="font-mono text-sm text-gray-900 break-all">{r.chave_acesso}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        AppUser #{r.user_id}
                        {r.purchase_id ? ` • Compra #${r.purchase_id}` : ''}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-sm text-gray-700">{r.source}</span>
                    </td>
                    <td className="p-4">{getStatusBadge(r.status)}</td>
                    <td className="p-4">
                      <span className="text-sm text-gray-700">{formatDate(r.created_at)}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <button
                          className="btn-secondary flex items-center gap-2"
                          onClick={() => handleCopy(r.chave_acesso)}
                          title="Copiar chave"
                        >
                          <ClipboardCopy size={18} />
                          Copiar
                        </button>
                        <button
                          className="btn-primary flex items-center gap-2"
                          onClick={() => updateMutation.mutate({ id: r.id, status: 'processed' })}
                          disabled={updateMutation.isPending}
                          title="Marcar como processado"
                        >
                          <CheckCircle size={18} />
                          Processado
                        </button>
                        <button
                          className="btn-danger flex items-center gap-2"
                          onClick={() => updateMutation.mutate({ id: r.id, status: 'rejected' })}
                          disabled={updateMutation.isPending}
                          title="Marcar como rejeitado"
                        >
                          <XCircle size={18} />
                          Rejeitar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
