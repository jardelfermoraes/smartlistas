import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Save, Send, Trash2 } from 'lucide-react';

import {
  api,
  AudienceFilter,
  NotificationRuleCreate,
  NotificationRuleTrigger,
  notificationsAdminApi,
  SendNotificationPayload,
} from '../api/client';

function normalizeFilters(input: { state: string; city: string; gender: string }): AudienceFilter {
  return {
    state: input.state.trim() ? input.state.trim().toUpperCase() : null,
    city: input.city.trim() ? input.city.trim() : null,
    gender: input.gender.trim() ? input.gender.trim() : null,
  };
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

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'send' | 'rules'>('send');

  const [filters, setFilters] = useState({ state: '', city: '', gender: '' });
  const normalizedFilters = useMemo(() => normalizeFilters(filters), [filters]);

  const [ufOptions, setUfOptions] = useState<string[]>([]);
  const [sendCityOptions, setSendCityOptions] = useState<string[]>([]);

  const [sendForm, setSendForm] = useState({ title: '', body: '' });

  type UfOut = { uf: string };
  type CityOut = { city: string };

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get<UfOut[]>('/app/locations/ufs');
        setUfOptions(res.data.map((u) => u.uf));
      } catch {
        setUfOptions([]);
      }
    })();
  }, []);

  useEffect(() => {
    const uf = filters.state.trim().toUpperCase();
    if (!uf || uf.length !== 2) {
      setSendCityOptions([]);
      if (filters.city) {
        setFilters((prev) => ({ ...prev, city: '' }));
      }
      return;
    }

    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await api.get<CityOut[]>('/app/locations/cities', {
            params: { uf, search: filters.city.trim(), limit: 50 },
          });
          setSendCityOptions(res.data.map((c) => c.city));
        } catch {
          setSendCityOptions([]);
        }
      })();
    }, 200);

    return () => clearTimeout(t);
  }, [filters.state, filters.city]);

  const { data: audience, isLoading: isAudienceLoading } = useQuery({
    queryKey: ['notifications-audience', normalizedFilters],
    queryFn: async () => {
      const res = await notificationsAdminApi.audience(normalizedFilters);
      return res.data;
    },
  });

  const sendMutation = useMutation({
    mutationFn: (payload: SendNotificationPayload) => notificationsAdminApi.send(payload).then((r) => r.data),
  });

  const canSend = Boolean(sendForm.title.trim() && !sendMutation.isPending && (audience?.token_count ?? 0) > 0);

  const rulesQuery = useQuery({
    queryKey: ['notification-rules'],
    enabled: tab === 'rules',
    queryFn: async () => {
      const res = await notificationsAdminApi.listRules();
      return res.data;
    },
  });

  const [ruleEditingId, setRuleEditingId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<{
    name: string;
    enabled: boolean;
    trigger: NotificationRuleTrigger;
    title: string;
    body: string;
    state: string;
    city: string;
    gender: string;
  }>({
    name: '',
    enabled: true,
    trigger: 'custom',
    title: '',
    body: '',
    state: '',
    city: '',
    gender: '',
  });

  const [ruleCityOptions, setRuleCityOptions] = useState<string[]>([]);

  useEffect(() => {
    const uf = ruleForm.state.trim().toUpperCase();
    if (!uf || uf.length !== 2) {
      setRuleCityOptions([]);
      if (ruleForm.city) {
        setRuleForm((prev) => ({ ...prev, city: '' }));
      }
      return;
    }

    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await api.get<CityOut[]>('/app/locations/cities', {
            params: { uf, search: ruleForm.city.trim(), limit: 50 },
          });
          setRuleCityOptions(res.data.map((c) => c.city));
        } catch {
          setRuleCityOptions([]);
        }
      })();
    }, 200);

    return () => clearTimeout(t);
  }, [ruleForm.state, ruleForm.city]);

  const rulesQueryErrorMessage = useMemo(() => {
    if (!rulesQuery.isError) return '';
    const err = rulesQuery.error as any;
    const status = err?.response?.status;
    const detail =
      (typeof err?.response?.data?.detail === 'string' && err.response.data.detail) ||
      (typeof err?.response?.data === 'string' && err.response.data) ||
      err?.message ||
      'Falha ao carregar regras';
    if (!err?.response) {
      return 'Falha de rede (possível CORS). O backend precisa permitir https://admin.smartlistas.com.br.';
    }
    return status ? `${detail} (HTTP ${status})` : detail;
  }, [rulesQuery.error, rulesQuery.isError]);

  const sendErrorMessage = useMemo(() => {
    if (!sendMutation.isError) return '';
    const err = sendMutation.error as any;
    const status = err?.response?.status;
    const detail =
      (typeof err?.response?.data?.detail === 'string' && err.response.data.detail) ||
      (typeof err?.response?.data === 'string' && err.response.data) ||
      err?.message ||
      'Falha ao enviar';
    if (!err?.response) {
      return 'Falha de rede (possível CORS). O backend precisa permitir https://admin.smartlistas.com.br.';
    }
    return status ? `${detail} (HTTP ${status})` : detail;
  }, [sendMutation.error, sendMutation.isError]);

  const createRuleMutation = useMutation({
    mutationFn: (payload: NotificationRuleCreate) => notificationsAdminApi.createRule(payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<NotificationRuleCreate> }) =>
      notificationsAdminApi.updateRule(id, payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => notificationsAdminApi.deleteRule(id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-rules'] });
    },
  });

  const rules = useMemo(() => (Array.isArray(rulesQuery.data) ? rulesQuery.data : []), [rulesQuery.data]);

  const submitRule = () => {
    const payload: NotificationRuleCreate = {
      name: ruleForm.name.trim() || 'Regra',
      enabled: Boolean(ruleForm.enabled),
      trigger: ruleForm.trigger,
      title: ruleForm.title.trim() || 'Notificação',
      body: ruleForm.body || '',
      filters: normalizeFilters({ state: ruleForm.state, city: ruleForm.city, gender: ruleForm.gender }),
      data: null,
    };

    if (!ruleEditingId) {
      createRuleMutation.mutate(payload);
      return;
    }

    updateRuleMutation.mutate({ id: ruleEditingId, payload });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notificações</h1>
          <p className="text-gray-500 mt-1">Envio manual e regras automáticas (MVP)</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Bell size={18} />
          <span>Push + Inbox</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-2 inline-flex gap-2">
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'send' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => setTab('send')}
        >
          Envio manual
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'rules' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => setTab('rules')}
        >
          Regras
        </button>
      </div>

      {tab === 'send' ? (
        <div className="space-y-6">
          <div className="card space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">UF</label>
                <select
                  className="input"
                  value={filters.state}
                  onChange={(e) => setFilters({ ...filters, state: e.target.value, city: '' })}
                >
                  <option value="">Todas</option>
                  {ufOptions.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                <input
                  className="input"
                  value={filters.city}
                  onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                  placeholder="São Paulo"
                  list="send-city-options"
                  disabled={!filters.state || filters.state.trim().length !== 2}
                />
                <datalist id="send-city-options">
                  {sendCityOptions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gênero</label>
                <select
                  className="input"
                  value={filters.gender}
                  onChange={(e) => setFilters({ ...filters, gender: e.target.value })}
                >
                  <option value="">Todos</option>
                  <option value="male">Masculino (male)</option>
                  <option value="female">Feminino (female)</option>
                  <option value="other">Outro (other)</option>
                  <option value="prefer_not_say">Prefere não dizer</option>
                </select>
              </div>
            </div>

            <div className="text-sm text-gray-600">
              Audiência:{' '}
              {isAudienceLoading ? (
                <span>carregando...</span>
              ) : (
                <span>
                  <b>{audience?.user_count ?? 0}</b> usuários elegíveis / <b>{audience?.token_count ?? 0}</b> tokens
                </span>
              )}
            </div>

            {!isAudienceLoading && (audience?.token_count ?? 0) === 0 ? (
              <div className="text-sm text-amber-700">
                Nenhum aparelho registrou token de push ainda. Abra o app no celular, permita notificações e faça login para registrar o token.
              </div>
            ) : null}
          </div>

          <div className="card space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                <input
                  className="input"
                  value={sendForm.title}
                  onChange={(e) => setSendForm({ ...sendForm, title: e.target.value })}
                  placeholder="Ex: Queda de preço detectada"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
                <textarea
                  className="input"
                  value={sendForm.body}
                  onChange={(e) => setSendForm({ ...sendForm, body: e.target.value })}
                  placeholder="Ex: O leite baixou de preço em 2 mercados perto de você."
                  rows={5}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                className="btn-primary flex items-center gap-2"
                disabled={!canSend}
                onClick={() => {
                  const payload: SendNotificationPayload = {
                    title: sendForm.title.trim(),
                    body: sendForm.body || '',
                    filters: normalizedFilters,
                    data: {},
                  };
                  sendMutation.mutate(payload);
                }}
              >
                <Send size={18} />
                Enviar
              </button>
            </div>

            {sendMutation.isSuccess ? (
              <div className="text-sm text-green-700">
                Enviado: {sendMutation.data.sent} / {sendMutation.data.requested_tokens} (falhas: {sendMutation.data.failures})
              </div>
            ) : null}
            {sendMutation.isSuccess && sendMutation.data.errors ? (
              <div className="text-xs text-gray-600">
                {Object.entries(sendMutation.data.errors)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' | ')}
              </div>
            ) : null}
            {sendMutation.isError ? <div className="text-sm text-red-700">{sendErrorMessage}</div> : null}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Regras</h2>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setRuleEditingId(null);
                    setRuleForm({
                      name: '',
                      enabled: true,
                      trigger: 'custom',
                      title: '',
                      body: '',
                      state: '',
                      city: '',
                      gender: '',
                    });
                  }}
                >
                  Nova
                </button>
              </div>

              {rulesQuery.isLoading ? <div className="text-sm text-gray-500">Carregando...</div> : null}
              {rulesQuery.isError ? <div className="text-sm text-red-700">{rulesQueryErrorMessage}</div> : null}

              <div className="space-y-2">
                {rules.length === 0 ? (
                  <div className="text-sm text-gray-500">Nenhuma regra cadastrada.</div>
                ) : (
                  rules.map((r) => (
                    <button
                      key={r.id}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        ruleEditingId === r.id ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        setRuleEditingId(r.id);
                        setRuleForm({
                          name: r.name,
                          enabled: r.enabled,
                          trigger: r.trigger,
                          title: r.title,
                          body: r.body,
                          state: r.filters?.state ? String(r.filters.state) : '',
                          city: r.filters?.city ? String(r.filters.city) : '',
                          gender: r.filters?.gender ? String(r.filters.gender) : '',
                        });
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{r.name}</div>
                          <div className="text-xs text-gray-500">{r.trigger} • {r.enabled ? 'ativa' : 'inativa'}</div>
                        </div>
                        <div className="text-xs text-gray-400">{formatDateTime(r.updated_at)}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">{ruleEditingId ? 'Editar regra' : 'Criar regra'}</h2>
                {ruleEditingId ? (
                  <button
                    className="btn-secondary flex items-center gap-2"
                    disabled={deleteRuleMutation.isPending}
                    onClick={() => {
                      const id = ruleEditingId;
                      if (!id) return;
                      if (!confirm('Deseja excluir esta regra?')) return;
                      deleteRuleMutation.mutate(id);
                      setRuleEditingId(null);
                    }}
                  >
                    <Trash2 size={16} />
                    Excluir
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                  <input className="input" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gatilho</label>
                  <select
                    className="input"
                    value={ruleForm.trigger}
                    onChange={(e) => setRuleForm({ ...ruleForm, trigger: e.target.value as NotificationRuleTrigger })}
                  >
                    <option value="custom">custom</option>
                    <option value="price_drop">price_drop</option>
                    <option value="inactivity">inactivity</option>
                    <option value="weekly_summary">weekly_summary</option>
                    <option value="manual">manual</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={ruleForm.enabled}
                      onChange={(e) => setRuleForm({ ...ruleForm, enabled: e.target.checked })}
                    />
                    Ativa
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">UF</label>
                  <select
                    className="input"
                    value={ruleForm.state}
                    onChange={(e) => setRuleForm({ ...ruleForm, state: e.target.value, city: '' })}
                  >
                    <option value="">Todas</option>
                    {ufOptions.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                  <input
                    className="input"
                    value={ruleForm.city}
                    onChange={(e) => setRuleForm({ ...ruleForm, city: e.target.value })}
                    list="rule-city-options"
                    disabled={!ruleForm.state || ruleForm.state.trim().length !== 2}
                  />
                  <datalist id="rule-city-options">
                    {ruleCityOptions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gênero</label>
                  <select className="input" value={ruleForm.gender} onChange={(e) => setRuleForm({ ...ruleForm, gender: e.target.value })}>
                    <option value="">Todos</option>
                    <option value="male">male</option>
                    <option value="female">female</option>
                    <option value="other">other</option>
                    <option value="prefer_not_say">prefer_not_say</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                  <input className="input" value={ruleForm.title} onChange={(e) => setRuleForm({ ...ruleForm, title: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
                  <textarea
                    className="input"
                    value={ruleForm.body}
                    onChange={(e) => setRuleForm({ ...ruleForm, body: e.target.value })}
                    rows={6}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  className="btn-primary flex items-center gap-2"
                  disabled={createRuleMutation.isPending || updateRuleMutation.isPending}
                  onClick={submitRule}
                >
                  <Save size={18} />
                  Salvar
                </button>
              </div>

              {createRuleMutation.isSuccess || updateRuleMutation.isSuccess ? (
                <div className="text-sm text-green-700">Regra salva.</div>
              ) : null}
              {createRuleMutation.isError || updateRuleMutation.isError ? (
                <div className="text-sm text-red-700">Falha ao salvar regra.</div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
