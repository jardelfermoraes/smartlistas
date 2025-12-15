import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, RefreshCw, Search, X } from 'lucide-react';

import { appPaymentsAdminApi, AppPayment } from '../api/client';

function formatMoney(cents: number): string {
  const v = (Number(cents) || 0) / 100;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AppPayments() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [provider, setProvider] = useState('mercadopago');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AppPayment | null>(null);

  const filters = useMemo(() => {
    const f: { search?: string; status?: string; provider?: string; start_date?: string; end_date?: string } = {};
    if (search.trim()) f.search = search.trim();
    if (status) f.status = status;
    if (provider) f.provider = provider;
    if (startDate) f.start_date = new Date(startDate + 'T00:00:00').toISOString();
    if (endDate) f.end_date = new Date(endDate + 'T23:59:59').toISOString();
    return f;
  }, [search, status, provider, startDate, endDate]);

  const { data: kpis } = useQuery({
    queryKey: ['app-payments-kpis', filters],
    queryFn: async () => {
      const res = await appPaymentsAdminApi.kpis(filters);
      return res.data;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['app-payments', page, filters],
    queryFn: async () => {
      const res = await appPaymentsAdminApi.list({ page, limit: 50, ...filters });
      return res.data;
    },
  });

  const syncMutation = useMutation({
    mutationFn: (paymentId: number) => appPaymentsAdminApi.sync(paymentId).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-payments'] });
    },
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pagamentos (App)</h1>
          <p className="text-gray-500 mt-1">Gerencie cobranças e renovações da assinatura</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <CreditCard size={18} />
          <span>Assinaturas</span>
        </div>
      </div>

      <div className="card">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-lg border border-gray-200 bg-white">
              <div className="text-xs text-gray-500">Total (período)</div>
              <div className="text-xl font-semibold text-gray-900">{kpis?.total_count ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">{formatMoney(kpis?.total_amount_cents ?? 0)}</div>
            </div>
            <div className="p-4 rounded-lg border border-gray-200 bg-white">
              <div className="text-xs text-gray-500">Aprovados</div>
              <div className="text-xl font-semibold text-gray-900">{kpis?.approved_count ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">{formatMoney(kpis?.approved_amount_cents ?? 0)}</div>
            </div>
            <div className="p-4 rounded-lg border border-gray-200 bg-white">
              <div className="text-xs text-gray-500">Pendentes</div>
              <div className="text-xl font-semibold text-gray-900">{kpis?.pending_count ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">{formatMoney(kpis?.pending_amount_cents ?? 0)}</div>
            </div>
            <div className="p-4 rounded-lg border border-gray-200 bg-white">
              <div className="text-xs text-gray-500">Créditos aplicados</div>
              <div className="text-xl font-semibold text-gray-900">{formatMoney(kpis?.total_credits_applied_cents ?? 0)}</div>
              <div className="text-xs text-gray-500 mt-1">descontos no período</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
              <div className="relative">
                <Search size={18} className="absolute left-3 top-3 text-gray-400" />
                <input
                  className="input pl-10"
                  placeholder="Email, nome, payment_id"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Todos</option>
                <option value="pending">pending</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
                <option value="cancelled">cancelled</option>
                <option value="refunded">refunded</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provedor</label>
              <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="">Todos</option>
                <option value="mercadopago">mercadopago</option>
                <option value="internal">internal</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data inicial</label>
              <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data final</label>
              <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="md:col-span-2 flex items-end justify-end gap-2">
              <button
                className="btn"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setSearch('');
                  setStatus('');
                  setProvider('mercadopago');
                  setPage(1);
                }}
              >
                Limpar
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="text-gray-500">Carregando...</div>
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Usuário</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Provedor</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-3 text-center text-gray-500">Sem pagamentos</td>
                    </tr>
                  ) : (
                    items.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700">{formatDateTime(p.created_at)}</td>
                        <td className="px-3 py-2 text-gray-700">
                          <div className="font-medium">{p.user_name || '-'}</div>
                          <div className="text-xs text-gray-500">{p.user_email || `user_id:${p.user_id}`}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{p.provider}</td>
                        <td className="px-3 py-2 text-gray-700">{p.status}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{formatMoney(p.amount_cents)}</td>
                        <td className="px-3 py-2 text-right">
                          <button className="btn" onClick={() => setSelected(p)}>Detalhes</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">Total: {data?.total ?? 0}</div>
            <div className="flex gap-2">
              <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Anterior
              </button>
              <button className="btn" disabled={items.length < 50} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </button>
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Detalhes do Pagamento</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-gray-500">ID interno</span>
                  <p className="font-medium">{selected.id}</p>
                </div>
                <div>
                  <span className="text-gray-500">Status</span>
                  <p className="font-medium">{selected.status}</p>
                </div>
                <div>
                  <span className="text-gray-500">Provedor</span>
                  <p className="font-medium">{selected.provider}</p>
                </div>
                <div>
                  <span className="text-gray-500">Payment ID</span>
                  <p className="font-medium font-mono">{selected.provider_payment_id || '-'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Valor</span>
                  <p className="font-medium">{formatMoney(selected.amount_cents)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Créditos aplicados</span>
                  <p className="font-medium">{formatMoney(selected.credits_applied_cents)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-gray-500">Criado em</span>
                  <p className="font-medium">{formatDateTime(selected.created_at)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Aprovado em</span>
                  <p className="font-medium">{formatDateTime(selected.approved_at)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-gray-500">Período início</span>
                  <p className="font-medium">{formatDateTime(selected.period_start)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Período fim</span>
                  <p className="font-medium">{formatDateTime(selected.period_end)}</p>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  className="btn flex items-center gap-2"
                  disabled={syncMutation.isPending || selected.provider !== 'mercadopago'}
                  onClick={async () => {
                    const result = await syncMutation.mutateAsync(selected.id);
                    if (result?.ok) {
                      queryClient.invalidateQueries({ queryKey: ['app-payments'] });
                    }
                  }}
                >
                  <RefreshCw size={16} />
                  Sincronizar
                </button>
                <button className="btn" onClick={() => setSelected(null)}>Fechar</button>
              </div>

              {syncMutation.isError ? (
                <div className="text-sm text-red-700">Falha ao sincronizar.</div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
