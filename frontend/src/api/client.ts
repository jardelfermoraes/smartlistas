import axios from 'axios';

const FALLBACK_LOCAL_API_URL = 'http://127.0.0.1:8000';

function getDefaultApiUrl(): string {
  if (typeof window === 'undefined') return FALLBACK_LOCAL_API_URL;
  const host = window.location.hostname;
  if (host === 'smartlistas.com.br' || host.endsWith('.smartlistas.com.br')) {
    return 'https://api.smartlistas.com.br';
  }
  return FALLBACK_LOCAL_API_URL;
}

const API_URL = import.meta.env.VITE_API_URL || getDefaultApiUrl();

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Types
export interface Store {
  id: number;
  cnpj: string;
  nome: string | null;  // Razão social
  nome_fantasia: string | null;  // Nome popular
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
  lat: number | null;
  lng: number | null;
  verificado: boolean;
  created_at: string;
}

export interface Product {
  id: number;
  gtin: string | null;
  descricao_norm: string;
  marca: string | null;
  categoria: string | null;
  unidade_base: string;
  created_at: string;
}

export interface Price {
  id: number;
  produto_id: number;
  loja_id: number;
  preco_por_unidade: number;
  unidade_base: string;
  data_coleta: string;
  fonte: string;
}

export interface Receipt {
  chave_acesso: string;
  cnpj_emissor: string | null;
  estado: string | null;
  tipo: string;
  data_emissao: string | null;
  total: number;
  status: string;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface PriceCompare {
  produto_id: number;
  produto_descricao: string;
  menor_preco: number | null;
  maior_preco: number | null;
  preco_medio: number | null;
  total_lojas: number;
  precos: {
    loja_id: number;
    loja_nome: string | null;
    loja_cidade: string | null;
    preco: number;
    data_coleta: string;
  }[];
}

// API Functions
export const storesApi = {
  list: (params?: { page?: number; search?: string; uf?: string }) =>
    api.get<PaginatedResponse<Store>>('/stores/', { params }),
  get: (id: number) => api.get<Store>(`/stores/${id}`),
  create: (data: Partial<Store>) => api.post<Store>('/stores/', data),
  update: (id: number, data: Partial<Store>) => api.put<Store>(`/stores/${id}`, data),
  delete: (id: number) => api.delete(`/stores/${id}`),
};

export const productsApi = {
  list: (params?: { page?: number; search?: string; categoria?: string }) =>
    api.get<PaginatedResponse<Product>>('/products/', { params }),
  get: (id: number) => api.get<Product>(`/products/${id}`),
  create: (data: Partial<Product>) => api.post<Product>('/products/', data),
  update: (id: number, data: Partial<Product>) => api.put<Product>(`/products/${id}`, data),
  delete: (id: number) => api.delete(`/products/${id}`),
  getPrices: (id: number) => api.get(`/products/${id}/prices`),
};

export const pricesApi = {
  list: (params?: { page?: number; produto_id?: number; loja_id?: number }) =>
    api.get<PaginatedResponse<Price>>('/prices/', { params }),
  compare: (productId: number, dias?: number) =>
    api.get<PriceCompare>(`/prices/compare/${productId}`, { params: { dias } }),
  history: (productId: number, params?: { loja_id?: number; dias?: number }) =>
    api.get(`/prices/history/${productId}`, { params }),
};

export interface ReceiptItem {
  seq: number;
  descricao: string;
  qtd: number;
  unidade: string;
  preco_unit: number;
  preco_total: number;
  desconto?: number;
  gtin?: string;
}

export interface ReceiptManualInput {
  chave_acesso: string;
  cnpj_emissor: string;
  nome_emissor?: string;
  endereco_emissor?: string;
  cidade_emissor?: string;
  uf_emissor?: string;
  data_emissao?: string;
  total: number;
  itens: ReceiptItem[];
}

export const receiptsApi = {
  list: (params?: { page?: number; status?: string }) =>
    api.get<PaginatedResponse<Receipt>>('/receipts/', { params }),
  get: (chave: string) => api.get<Receipt>(`/receipts/${chave}`),
  import: (chave_acesso: string) => api.post('/receipts/import', { chave_acesso }),
  process: (chave: string) => api.post(`/receipts/${chave}/process`),
  createManual: (data: ReceiptManualInput) => api.post('/receipts/manual', data),
  delete: (chave: string) => api.delete(`/receipts/${chave}`),
};

export interface AppReceiptKeySubmission {
  id: number;
  user_id: number;
  purchase_id?: number | null;
  chave_acesso: string;
  raw_text?: string | null;
  source: string;
  status: string;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by_user_id?: number | null;
  notes?: string | null;
}

export const appReceiptKeysApi = {
  list: (params?: { page?: number; limit?: number; status?: string; search?: string }) =>
    api.get<AppReceiptKeySubmission[]>('/app/admin/receipt-keys', { params }),
  update: (id: number, data: { status: string; notes?: string | null }) =>
    api.put<AppReceiptKeySubmission>(`/app/admin/receipt-keys/${id}`, data),
};

export interface BillingSettings {
  trial_days: number;
  monthly_price_cents: number;
  referral_credit_cents: number;
  receipt_credit_cents: number;
  referral_credit_limit_per_month: number;
  receipt_credit_limit_per_month: number;
  is_active: boolean;
}

export const billingApi = {
  getSettings: () => api.get<BillingSettings>('/app/admin/billing/settings'),
  updateSettings: (data: BillingSettings) => api.put<BillingSettings>('/app/admin/billing/settings', data),
};

export type AudienceFilter = {
  state?: string | null;
  city?: string | null;
  gender?: string | null;
};

export type AudienceCount = {
  user_count: number;
  token_count: number;
};

export type SendNotificationPayload = {
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  filters?: AudienceFilter;
};

export type SendNotificationResult = {
  requested_tokens: number;
  sent: number;
  failures: number;
  errors?: Record<string, number> | null;
};

export type NotificationRuleTrigger = 'manual' | 'price_drop' | 'inactivity' | 'weekly_summary' | 'custom';

export type NotificationRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: NotificationRuleTrigger;
  filters: AudienceFilter;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type NotificationRuleCreate = {
  name: string;
  enabled: boolean;
  trigger: NotificationRuleTrigger;
  filters: AudienceFilter;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
};

export type NotificationRuleUpdate = Partial<NotificationRuleCreate>;

export const notificationsAdminApi = {
  audience: (filters?: AudienceFilter) => api.post<AudienceCount>('/app/admin/notifications/audience', filters ?? null),
  send: (payload: SendNotificationPayload) => api.post<SendNotificationResult>('/app/admin/notifications/send', payload),
  listRules: () => api.get<NotificationRule[]>('/app/admin/notifications/rules'),
  createRule: (data: NotificationRuleCreate) => api.post<NotificationRule>('/app/admin/notifications/rules', data),
  updateRule: (id: string, data: NotificationRuleUpdate) => api.put<NotificationRule>(`/app/admin/notifications/rules/${id}`, data),
  deleteRule: (id: string) => api.delete<{ ok: boolean }>(`/app/admin/notifications/rules/${id}`),
};

export interface AppPayment {
  id: number;
  user_id: number;
  user_email?: string | null;
  user_name?: string | null;
  provider: string;
  provider_payment_id?: string | null;
  status: string;
  amount_cents: number;
  credits_applied_cents: number;
  currency: string;
  description?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppPaymentsListResponse {
  items: AppPayment[];
  total: number;
}

export interface AppPaymentSyncResult {
  ok: boolean;
  mp_status?: string | null;
  renewed?: boolean | null;
  subscription_ends_at?: string | null;
}

export interface AppPaymentsKpis {
  total_count: number;
  total_amount_cents: number;
  total_credits_applied_cents: number;
  approved_count: number;
  approved_amount_cents: number;
  pending_count: number;
  pending_amount_cents: number;
}

export const appPaymentsAdminApi = {
  list: (params?: { page?: number; limit?: number; status?: string; provider?: string; user_id?: number; search?: string; start_date?: string; end_date?: string }) =>
    api.get<AppPaymentsListResponse>('/app/admin/payments', { params }),
  kpis: (params?: { status?: string; provider?: string; user_id?: number; search?: string; start_date?: string; end_date?: string }) =>
    api.get<AppPaymentsKpis>('/app/admin/payments/kpis', { params }),
  get: (id: number) => api.get<AppPayment>(`/app/admin/payments/${id}`),
  sync: (id: number) => api.post<AppPaymentSyncResult>(`/app/admin/payments/${id}/sync`),
};

export const healthApi = {
  check: () => api.get('/health'),
};

export const ocrApi = {
  extract: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/ocr/extract', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Produtos Canônicos
export interface CanonicalProduct {
  id: number;
  nome: string;
  marca: string | null;
  categoria: string | null;
  subcategoria: string | null;
  unidade_padrao: string;
  quantidade_padrao: number | null;
  gtin_principal: string | null;
  alias_count: number;
  preco_atual: number | null;  // Preço mais recente (menor entre lojas)
  preco_data: string | null;   // Data do preço mais recente
}

export interface ProductAlias {
  id: number;
  descricao_original: string;
  descricao_normalizada: string;
  loja_nome: string | null;
  confianca: number;
}

export interface PriceComparison {
  loja_id: number;
  loja_nome: string;
  loja_fantasia: string | null;
  loja_cidade: string | null;
  preco: number;
  data_coleta: string;
}

export interface ProductDetail extends CanonicalProduct {
  aliases: ProductAlias[];
  precos: PriceComparison[];
}

export interface CanonicalCategoryCount {
  categoria: string;
  total: number;
}

export interface CanonicalTopInserted {
  canonical_id: number;
  nome: string;
  categoria?: string | null;
  inserts: number;
}

export interface CanonicalKpis {
  total_products: number;
  categories: CanonicalCategoryCount[];
  new_last_7d: number;
  new_last_30d: number;
  top_inserted: CanonicalTopInserted[];
}

// Dashboard Stats
export interface DashboardStats {
  total_lojas: number;
  lojas_verificadas: number;
  lojas_pendentes: number;
  total_produtos: number;
  produtos_com_preco: number;
  produtos_sem_preco: number;
  total_cupons: number;
  cupons_processados: number;
  cupons_com_erro: number;
  total_precos: number;
  precos_ultimos_7_dias: number;
  precos_ultimos_30_dias: number;
}

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface RecentActivity {
  tipo: string;
  descricao: string;
  data: string;
  icone: string;
}

export interface Alert {
  tipo: string;
  titulo: string;
  descricao: string;
  acao: string | null;
  link: string | null;
}

export interface DashboardData {
  stats: DashboardStats;
  cupons_por_dia: ChartDataPoint[];
  precos_por_dia: ChartDataPoint[];
  produtos_por_categoria: ChartDataPoint[];
  atividade_recente: RecentActivity[];
  alertas: Alert[];
}

export interface ChartDataPoint {
  label: string;
  date: string;
  cupons: number;
  produtos: number;
}

export interface ChartResponse {
  data: ChartDataPoint[];
  totals: { cupons: number; produtos: number };
  medias: { cupons: number; produtos: number };
  max: { cupons: number; produtos: number };
  days: number;
}

export const statsApi = {
  getDashboard: () => api.get<DashboardData>('/stats/dashboard'),
  getHealth: () => api.get<{ database: string; redis: string; api: string }>('/stats/health'),
  getCuponsChart: (days: number = 7) => api.get<ChartResponse>('/stats/chart/cupons', { params: { days } }),
};

export const canonicalApi = {
  list: (params?: { page?: number; search?: string; categoria?: string }) =>
    api.get<PaginatedResponse<CanonicalProduct>>('/canonical/', { params }),
  get: (id: number) => api.get<CanonicalProduct>(`/canonical/${id}`),
  kpis: () => api.get<CanonicalKpis>('/canonical/kpis'),
  getDetails: (id: number) => api.get<ProductDetail>(`/canonical/${id}/details`),
  getCategories: () => api.get<string[]>('/canonical/categories'),
  getDuplicates: () => api.get('/canonical/duplicates'),
  mergeDuplicates: () => api.post('/canonical/merge-duplicates'),
  update: (id: number, data: Partial<CanonicalProduct>) => api.put<CanonicalProduct>(`/canonical/${id}`, data),
  delete: (id: number) => api.delete(`/canonical/${id}`),
  getAliases: (id: number) => api.get<ProductAlias[]>(`/canonical/${id}/aliases`),
  getPrices: (id: number) => api.get<PriceComparison[]>(`/canonical/${id}/prices`),
  merge: (id: number, otherId: number) => api.post(`/canonical/${id}/merge/${otherId}`),
  normalizeBatch: (batchSize?: number) => api.post('/canonical/normalize-batch', null, { params: { batch_size: batchSize } }),
  renormalize: (id: number) => api.post(`/canonical/renormalize/${id}`),
  renormalizeBatch: (batchSize?: number) => api.post('/canonical/renormalize-batch', null, { params: { batch_size: batchSize } }),
};
