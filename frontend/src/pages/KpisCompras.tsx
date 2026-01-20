import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CheckCircle2, PiggyBank, ShoppingCart } from 'lucide-react';

import { statsApi } from '../api/client';
import { MoneySeriesChart } from '../components/dashboard/MoneySeriesChart';
import { SingleSeriesChart } from '../components/dashboard/SingleSeriesChart';

function formatMoneyBRL(value: number) {
  const v = Number(value) || 0;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type OptimizationFilter = 'all' | 'only' | 'without';

export function KpisCompras() {
  const [days, setDays] = useState<number>(30);
  const [statusFinal, setStatusFinal] = useState<string>('completed');
  const [optimization, setOptimization] = useState<OptimizationFilter>('all');

  const filters = useMemo(() => {
    const f: { status_final?: string; has_optimization?: boolean } = {};
    if (statusFinal) f.status_final = statusFinal;
    if (optimization === 'only') f.has_optimization = true;
    if (optimization === 'without') f.has_optimization = false;
    return f;
  }, [statusFinal, optimization]);

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['kpis-compras', days, filters],
    queryFn: async () => {
      const res = await statsApi.getAppPurchasesKpis(days, filters);
      return res.data;
    },
  });

  const hasOptimizationData = (kpis?.purchases_with_optimization_count ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">KPIs Compras</h1>
          <p className="text-gray-500 mt-1">
            Resultados práticos do SmartListas no app: volume de compras finalizadas, economia gerada e uso de otimização.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <BarChart3 size={18} />
          <span>Analytics</span>
        </div>
      </div>

      <div className="card">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Período</label>
              <select className="input" value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="90">Últimos 90 dias</option>
                <option value="365">Últimos 365 dias</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select className="input" value={statusFinal} onChange={(e) => setStatusFinal(e.target.value)}>
                <option value="completed">completed</option>
                <option value="closed">closed</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Otimização</label>
              <select className="input" value={optimization} onChange={(e) => setOptimization(e.target.value as OptimizationFilter)}>
                <option value="all">Todas</option>
                <option value="only">Somente com otimização</option>
                <option value="without">Somente sem otimização</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <ShoppingCart size={14} />
                <span>Compras finalizadas</span>
              </div>
              <div className="text-2xl font-semibold text-gray-900 mt-2">{kpisLoading ? '—' : kpis?.purchases_count ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">no período selecionado</div>
            </div>

            <div className="p-4 rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <PiggyBank size={14} />
                <span>Economia total</span>
              </div>
              <div className="text-2xl font-semibold text-gray-900 mt-2">
                {kpisLoading ? '—' : hasOptimizationData ? formatMoneyBRL(kpis?.savings_total ?? 0) : '—'}
              </div>
              <div className="text-xs text-gray-500 mt-1">soma de savings_amount</div>
            </div>

            <div className="p-4 rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <CheckCircle2 size={14} />
                <span>Taxa de otimização</span>
              </div>
              <div className="text-2xl font-semibold text-gray-900 mt-2">
                {kpisLoading ? '—' : `${kpis?.optimization_rate_percent ?? 0}%`}
              </div>
              <div className="text-xs text-gray-500 mt-1">compras com otimização</div>
            </div>

            <div className="p-4 rounded-lg border border-gray-200 bg-white">
              <div className="text-xs text-gray-500">Economia média por compra</div>
              <div className="text-2xl font-semibold text-gray-900 mt-2">
                {kpisLoading ? '—' : hasOptimizationData ? formatMoneyBRL(kpis?.savings_avg_per_purchase ?? 0) : '—'}
              </div>
              <div className="text-xs text-gray-500 mt-1">média no período</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-lg border border-gray-200 bg-white">
              <div className="text-xs text-gray-500">Ticket médio (baseline)</div>
              <div className="text-xl font-semibold text-gray-900 mt-2">{kpisLoading ? '—' : hasOptimizationData ? formatMoneyBRL(kpis?.ticket_avg_baseline ?? 0) : '—'}</div>
              <div className="text-xs text-gray-500 mt-1">total antes de otimizar</div>
            </div>
            <div className="p-4 rounded-lg border border-gray-200 bg-white">
              <div className="text-xs text-gray-500">Ticket médio (otimizado)</div>
              <div className="text-xl font-semibold text-gray-900 mt-2">{kpisLoading ? '—' : hasOptimizationData ? formatMoneyBRL(kpis?.ticket_avg_optimized ?? 0) : '—'}</div>
              <div className="text-xs text-gray-500 mt-1">total após otimizar</div>
            </div>
            <div className="p-4 rounded-lg border border-gray-200 bg-white">
              <div className="text-xs text-gray-500">Itens por compra (média)</div>
              <div className="text-xl font-semibold text-gray-900 mt-2">{kpisLoading ? '—' : (kpis?.items_total_avg ?? 0).toFixed(1)}</div>
              <div className="text-xs text-gray-500 mt-1">itens totais</div>
            </div>
            <div className="p-4 rounded-lg border border-gray-200 bg-white">
              <div className="text-xs text-gray-500">% economia média</div>
              <div className="text-xl font-semibold text-gray-900 mt-2">{kpisLoading ? '—' : hasOptimizationData ? `${(kpis?.savings_percent_avg ?? 0).toFixed(1)}%` : '—'}</div>
              <div className="text-xs text-gray-500 mt-1">savings_percent</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="p-6">
            <SingleSeriesChart
              subtitle="Compras finalizadas por dia"
              color="#F59E0B"
              bgClass="bg-amber-50"
              fetcher={(d) => statsApi.getAppPurchasesChart(d, filters)}
              queryKeyExtra={filters}
              defaultPeriod={days}
              periodOptions={[7, 30, 90]}
            />
          </div>
        </div>

        <div className="card">
          <div className="p-6">
            <MoneySeriesChart
              subtitle="Economia por dia"
              color="#10B981"
              bgClass="bg-emerald-50"
              fetcher={(d) => statsApi.getAppSavingsChart(d, filters)}
              queryKeyExtra={filters}
              defaultPeriod={days}
              periodOptions={[7, 30, 90]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
