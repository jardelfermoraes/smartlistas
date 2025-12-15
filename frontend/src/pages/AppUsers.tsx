/**
 * Página de Gestão de Usuários do App
 */

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Smartphone, 
  Search, 
  User,
  Mail,
  Phone,
  MapPin,
  ShoppingCart,
  ToggleLeft,
  ToggleRight,
  Eye,
  X
} from 'lucide-react';
import { api } from '../api/client';

interface AppUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  birth_date: string | null;
  state: string | null;
  city: string | null;
  shopping_radius_km: number;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  last_login: string | null;
  lists_count: number;
}

interface AppUserDetail {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  birth_date: string | null;
  avatar_url: string | null;
  state: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  shopping_radius_km: number;
  is_verified: boolean;
  is_active: boolean;
  notification_enabled: boolean;
  notification_deals: boolean;
  notification_price_drop: boolean;
  created_at: string;
  last_login: string | null;
}

interface AppUserBilling {
  user_id: number;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  referral_code: string | null;
  referred_by_user_id: number | null;
  monthly_price_cents: number;
  credit_balance_cents: number;
  amount_due_cents: number;
  referral_credit_cents: number;
  receipt_credit_cents: number;
  referral_credit_limit_per_month: number;
  receipt_credit_limit_per_month: number;
}

interface CreditLedgerEntry {
  id: number;
  user_id: number;
  entry_type: string;
  amount_cents: number;
  source_id?: number | null;
  notes?: string | null;
  created_at: string;
}

export function AppUsers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | null>(null);
  const [selectedUser, setSelectedUser] = useState<AppUserDetail | null>(null);
  const [page] = useState(1);

  const selectedUserId = selectedUser?.id ?? null;

  // Busca usuários
  const { data: users, isLoading } = useQuery({
    queryKey: ['app-users', page, search, filterActive],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = { page, limit: 20 };
      if (search) params.search = search;
      if (filterActive !== null) params.is_active = filterActive;
      const response = await api.get<AppUser[]>('/app/admin/users', { params });
      return response.data;
    }
  });

  // Toggle ativo
  const toggleMutation = useMutation({
    mutationFn: (userId: number) => api.put(`/app/admin/users/${userId}/toggle-active`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-users'] });
    }
  });

  // Busca detalhes do usuário
  const fetchUserDetail = async (userId: number) => {
    const response = await api.get<AppUserDetail>(`/app/admin/users/${userId}`);
    setSelectedUser(response.data);
  };

  const { data: billing } = useQuery({
    queryKey: ['app-user-billing', selectedUserId],
    enabled: Boolean(selectedUserId),
    queryFn: async () => {
      const response = await api.get<AppUserBilling>(`/app/admin/users/${selectedUserId}/billing`);
      return response.data;
    },
  });

  const { data: ledger } = useQuery({
    queryKey: ['app-user-credits', selectedUserId],
    enabled: Boolean(selectedUserId),
    queryFn: async () => {
      const response = await api.get<CreditLedgerEntry[]>(`/app/admin/users/${selectedUserId}/credits`, {
        params: { limit: 50 },
      });
      return response.data;
    },
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatMoney = (cents: number | null | undefined) => {
    const v = (Number(cents) || 0) / 100;
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const ledgerRows = useMemo(() => (Array.isArray(ledger) ? ledger : []), [ledger]);

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuários do App</h1>
          <p className="text-gray-500 mt-1">
            Gerencie os usuários do aplicativo mobile
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Smartphone size={18} />
          <span>{users?.length || 0} usuários</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Busca */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, email ou telefone..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Filtro de status */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilterActive(null)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterActive === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterActive(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterActive === true
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Ativos
            </button>
            <button
              onClick={() => setFilterActive(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterActive === false
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Inativos
            </button>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-gray-200">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : users && users.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Usuário
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Contato
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Localização
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Listas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Último Acesso
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                          <span className="text-purple-600 font-medium">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{user.name}</p>
                          <p className="text-sm text-gray-500">
                            Desde {formatDate(user.created_at)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-1 text-sm text-gray-600">
                          <Mail size={14} />
                          {user.email}
                        </span>
                        {user.phone && (
                          <span className="flex items-center gap-1 text-sm text-gray-600">
                            <Phone size={14} />
                            {user.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.city ? (
                        <div>
                          <span className="flex items-center gap-1 text-sm text-gray-600">
                            <MapPin size={14} />
                            {user.city}, {user.state}
                          </span>
                          <span className="text-xs text-gray-400">
                            Raio: {user.shopping_radius_km}km
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Não informado</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="flex items-center gap-1 text-sm text-gray-600">
                        <ShoppingCart size={14} />
                        {user.lists_count}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600">
                        {formatDateTime(user.last_login)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {user.is_active ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => fetchUserDetail(user.id)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Ver detalhes"
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          onClick={() => toggleMutation.mutate(user.id)}
                          className={`p-2 rounded-lg transition-colors ${
                            user.is_active
                              ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                              : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                          }`}
                          title={user.is_active ? 'Desativar' : 'Ativar'}
                        >
                          {user.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <Smartphone size={48} className="mx-auto mb-4 opacity-50" />
            <p>Nenhum usuário encontrado</p>
          </div>
        )}
      </div>

      {/* Modal de detalhes */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Detalhes do Usuário</h2>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Info básica */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center">
                  <User size={32} className="text-purple-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{selectedUser.name}</h3>
                  <p className="text-gray-500">{selectedUser.email}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${
                    selectedUser.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {selectedUser.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>

              {/* Dados pessoais */}
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Dados Pessoais</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Celular</span>
                    <p className="font-medium">{selectedUser.phone || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Data de Nascimento</span>
                    <p className="font-medium">{formatDate(selectedUser.birth_date)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Cadastro</span>
                    <p className="font-medium">{formatDate(selectedUser.created_at)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Último Acesso</span>
                    <p className="font-medium">{formatDate(selectedUser.last_login)}</p>
                  </div>
                </div>
              </div>

              {/* Localização */}
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Localização</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Cidade</span>
                    <p className="font-medium">
                      {selectedUser.city && selectedUser.state 
                        ? `${selectedUser.city} - ${selectedUser.state}` 
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Raio de Compra</span>
                    <p className="font-medium">{selectedUser.shopping_radius_km} km</p>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Status</h4>
                <div className="flex gap-4">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                    selectedUser.is_verified ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedUser.is_verified ? '✓ Email verificado' : 'Email não verificado'}
                  </span>
                </div>
              </div>

              {/* Assinatura / Créditos */}
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Assinatura / Créditos</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Trial até</span>
                    <p className="font-medium">{formatDate(billing?.trial_ends_at ?? null)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Assinatura até</span>
                    <p className="font-medium">{formatDate(billing?.subscription_ends_at ?? null)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Mensalidade</span>
                    <p className="font-medium">{formatMoney(billing?.monthly_price_cents)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Saldo de créditos</span>
                    <p className="font-medium">{formatMoney(billing?.credit_balance_cents)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Valor a pagar</span>
                    <p className="font-medium">{formatMoney(billing?.amount_due_cents)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Código de indicação</span>
                    <p className="font-medium font-mono">{billing?.referral_code || '-'}</p>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  Crédito indicação: {formatMoney(billing?.referral_credit_cents)} (limite {billing?.referral_credit_limit_per_month}/mês) •
                  Crédito cupom: {formatMoney(billing?.receipt_credit_cents)} (limite {billing?.receipt_credit_limit_per_month}/mês)
                </div>
              </div>

              {/* Extrato de Créditos */}
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Extrato de Créditos</h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ledgerRows.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-center text-gray-500">Sem lançamentos</td>
                        </tr>
                      ) : (
                        ledgerRows.map((e) => (
                          <tr key={e.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-700">{formatDateTime(e.created_at)}</td>
                            <td className="px-3 py-2 text-gray-700">{e.entry_type}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900">{formatMoney(e.amount_cents)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notificações */}
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Preferências de Notificação</h4>
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                    selectedUser.notification_enabled ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedUser.notification_enabled ? '✓ Notificações ativas' : 'Notificações desativadas'}
                  </span>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                    selectedUser.notification_deals ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedUser.notification_deals ? '✓ Ofertas' : 'Ofertas desativadas'}
                  </span>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                    selectedUser.notification_price_drop ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedUser.notification_price_drop ? '✓ Queda de preço' : 'Queda de preço desativada'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
