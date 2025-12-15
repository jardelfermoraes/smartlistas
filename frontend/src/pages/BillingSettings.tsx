import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Save } from 'lucide-react';

import { billingApi, BillingSettings } from '../api/client';

function centsToReais(cents: number): string {
  const v = (Number(cents) || 0) / 100;
  return v.toFixed(2).replace('.', ',');
}

function reaisToCents(input: string): number {
  const cleaned = (input || '').trim().replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function BillingSettingsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['billing-settings'],
    queryFn: () => billingApi.getSettings().then((r) => r.data),
  });

  const initial = useMemo(() => {
    if (!data) return null;
    return {
      trial_days: String(data.trial_days ?? 30),
      monthly_price: centsToReais(data.monthly_price_cents ?? 1500),
      referral_credit: centsToReais(data.referral_credit_cents ?? 200),
      receipt_credit: centsToReais(data.receipt_credit_cents ?? 100),
      referral_limit: String(data.referral_credit_limit_per_month ?? 5),
      receipt_limit: String(data.receipt_credit_limit_per_month ?? 5),
      is_active: Boolean(data.is_active),
    };
  }, [data]);

  const [form, setForm] = useState<{
    trial_days: string;
    monthly_price: string;
    referral_credit: string;
    receipt_credit: string;
    referral_limit: string;
    receipt_limit: string;
    is_active: boolean;
  } | null>(null);

  useEffect(() => {
    if (initial) setForm(initial);
  }, [initial]);

  const saveMutation = useMutation({
    mutationFn: (payload: BillingSettings) => billingApi.updateSettings(payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-settings'] });
    },
  });

  if (isLoading || !form) {
    return (
      <div className="card">
        <div className="p-6 text-gray-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Promoções / Assinatura</h1>
          <p className="text-gray-500 mt-1">Configure mensalidade, créditos e limites mensais</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <CreditCard size={18} />
          <span>Billing</span>
        </div>
      </div>

      {error ? (
        <div className="card">
          <div className="p-6 text-red-600">Falha ao carregar configurações.</div>
        </div>
      ) : null}

      <div className="card">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Configurações</h2>
              <p className="text-sm text-gray-500 mt-1">Valores em R$ (centavos no banco)</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Ativo
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trial (dias)</label>
              <input
                className="input"
                value={form.trial_days}
                onChange={(e) => setForm({ ...form, trial_days: e.target.value.replace(/[^0-9]/g, '') })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mensalidade (R$)</label>
              <input
                className="input"
                value={form.monthly_price}
                onChange={(e) => setForm({ ...form, monthly_price: e.target.value })}
                placeholder="15,00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Crédito por indicação (R$)</label>
              <input
                className="input"
                value={form.referral_credit}
                onChange={(e) => setForm({ ...form, referral_credit: e.target.value })}
                placeholder="2,00"
              />
              <p className="text-xs text-gray-500 mt-1">Gatilho: cadastra com código/link</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Crédito por cupom validado (R$)</label>
              <input
                className="input"
                value={form.receipt_credit}
                onChange={(e) => setForm({ ...form, receipt_credit: e.target.value })}
                placeholder="1,00"
              />
              <p className="text-xs text-gray-500 mt-1">Gatilho: operador marca status = processed</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Limite indicações bonificadas/mês</label>
              <input
                className="input"
                value={form.referral_limit}
                onChange={(e) => setForm({ ...form, referral_limit: e.target.value.replace(/[^0-9]/g, '') })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Limite cupons bonificados/mês</label>
              <input
                className="input"
                value={form.receipt_limit}
                onChange={(e) => setForm({ ...form, receipt_limit: e.target.value.replace(/[^0-9]/g, '') })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              className="btn-primary flex items-center gap-2"
              disabled={saveMutation.isPending}
              onClick={() => {
                const payload: BillingSettings = {
                  trial_days: Number(form.trial_days) || 0,
                  monthly_price_cents: reaisToCents(form.monthly_price),
                  referral_credit_cents: reaisToCents(form.referral_credit),
                  receipt_credit_cents: reaisToCents(form.receipt_credit),
                  referral_credit_limit_per_month: Number(form.referral_limit) || 0,
                  receipt_credit_limit_per_month: Number(form.receipt_limit) || 0,
                  is_active: form.is_active,
                };
                saveMutation.mutate(payload);
              }}
            >
              <Save size={18} />
              Salvar
            </button>
          </div>

          {saveMutation.isSuccess ? <div className="text-sm text-green-700">Configurações salvas.</div> : null}
          {saveMutation.isError ? <div className="text-sm text-red-700">Falha ao salvar configurações.</div> : null}
        </div>
      </div>
    </div>
  );
}
