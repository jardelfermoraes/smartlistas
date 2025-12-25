import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { apiGet, apiPost } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  getShoppingListById,
  ShoppingListDraft,
  ShoppingListFallbackPriceItem,
  ShoppingListOptimizationResult,
  ShoppingListStatus,
  upsertShoppingList,
} from '@/lib/shoppingLists';
import { AppTheme, useTheme } from '@/lib/theme';

type CanonicalProduct = {
  id: number;
  nome: string;
  marca?: string | null;
  unidade_padrao: string;
  quantidade_padrao?: number | null;
};

type CanonicalListResponse = {
  items: CanonicalProduct[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

function formatCurrencyBRL(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  try {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return n.toFixed(2);
  }
}

function optimizationSignature(items: ShoppingListDraft['items'], maxStores: number): string {
  const pairs = (items ?? [])
    .map((it) => ({ id: Number(it.canonical_id), q: Number(it.quantity) }))
    .filter((x) => Number.isFinite(x.id) && Number.isFinite(x.q))
    .sort((a, b) => a.id - b.id)
    .map((x) => `${x.id}:${x.q}`)
    .join('|');
  const ms = Number.isFinite(maxStores) ? Math.min(5, Math.max(1, maxStores)) : 3;
  return `${ms}|${pairs}`;
}

function canonicalTitle(s: CanonicalProduct): string {
  return (s.nome ?? '').trim() || 'Produto';
}

function canonicalMeta(s: CanonicalProduct): string {
  const brand = (s.marca ?? '').trim();
  const size = s.quantidade_padrao ? `${s.quantidade_padrao}${s.unidade_padrao}` : (s.unidade_padrao ?? '').trim();
  return [brand, size].filter((p) => Boolean(p)).join(' • ');
}

function canonicalListLabel(s: CanonicalProduct): string {
  const parts = [canonicalTitle(s), canonicalMeta(s)].filter((p) => Boolean(p));
  return parts.join(' • ') || 'Produto';
}

function normalizeForSearch(value: string): string {
  const v = (value ?? '').toLowerCase();
  const normalized = typeof v.normalize === 'function' ? v.normalize('NFD') : v;
  return normalized.replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function suggestionScore(s: CanonicalProduct, q: string): number {
  const nq = normalizeForSearch(q);
  if (nq.length < 2) return 0;

  const name = normalizeForSearch(s.nome ?? '');
  const brand = normalizeForSearch(s.marca ?? '');
  const nameHit = name.includes(nq);
  const brandHit = brand.includes(nq);
  if (!nameHit && !brandHit) return 0;
  if (name.startsWith(nq)) return 4;
  if (nameHit) return 3;
  if (brand.startsWith(nq)) return 2;
  return 1;
}

type AppOptimizationResult = {
  success: boolean;
  message: string;
  allocations: Array<{
    store_id: number;
    store_name: string;
    store_address: string;
    total: number;
    items: Array<{
      item_id: number;
      canonical_id: number;
      product_name: string;
      quantity: number;
      price: number;
      subtotal: number;
    }>;
  }>;
  total_cost: number;
  total_if_single_store: number;
  savings: number;
  savings_percent: number;
  total_worst_cost?: number;
  potential_savings?: number;
  potential_savings_percent?: number;
  items_without_price: number[];
  items_outside_selected_stores?: number[];
  unoptimized_prices?: ShoppingListFallbackPriceItem[];
  fallback_prices?: ShoppingListFallbackPriceItem[];
  price_lookback_days?: number;
};

function storeTone(
  theme: AppTheme,
  idx: number
): { bg: string; headerBg: string; border: string; accent: string; itemBg: string; itemBorder: string } {
  const palette = [
    { accent: '#2563eb', bg: 'rgba(37, 99, 235, 0.10)', headerBg: 'rgba(37, 99, 235, 0.16)', border: 'rgba(37, 99, 235, 0.30)' },
    { accent: '#7c3aed', bg: 'rgba(124, 58, 237, 0.10)', headerBg: 'rgba(124, 58, 237, 0.16)', border: 'rgba(124, 58, 237, 0.30)' },
    { accent: '#059669', bg: 'rgba(5, 150, 105, 0.10)', headerBg: 'rgba(5, 150, 105, 0.16)', border: 'rgba(5, 150, 105, 0.30)' },
    { accent: '#d97706', bg: 'rgba(217, 119, 6, 0.10)', headerBg: 'rgba(217, 119, 6, 0.16)', border: 'rgba(217, 119, 6, 0.30)' },
  ];

  const p = palette[Math.abs(idx) % palette.length];
  const itemBg = theme.name === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.65)';
  const itemBorder = theme.name === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(15, 23, 42, 0.06)';

  return {
    bg: theme.name === 'dark' ? p.bg : p.bg,
    headerBg: theme.name === 'dark' ? p.headerBg : p.headerBg,
    border: p.border,
    accent: p.accent,
    itemBg,
    itemBorder,
  };
}

function statusLabel(status: ShoppingListStatus): string {
  switch (status) {
    case 'draft':
      return 'Edição';
    case 'closed':
      return 'Fechada';
    case 'in_progress':
      return 'Realizando compra';
    case 'completed':
      return 'Compra realizada';
    case 'optimized':
      return 'Otimizada';
    default:
      return status;
  }
}

function computeListStatus(base: ShoppingListStatus, items: ShoppingListDraft['items']): ShoppingListStatus {
  if (!items.length) return base;
  const checked = items.filter((it) => Boolean(it.is_checked)).length;
  if (checked === 0) return base;
  if (checked === items.length) return 'completed';
  return 'in_progress';
}

export default function ListDetailScreen() {
  const router = useRouter();
  const { id, autoOptimize } = useLocalSearchParams<{ id: string; autoOptimize?: string }>();
  const { tokens, refreshAccessToken } = useAuth();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [permission, requestPermission] = useCameraPermissions();

  const listId = typeof id === 'string' ? id : '';

  const [listName, setListName] = useState('');
  const [draftItems, setDraftItems] = useState<ShoppingListDraft['items']>([]);
  const [draftStatus, setDraftStatus] = useState<ShoppingListStatus>('draft');
  const [optimization, setOptimization] = useState<ShoppingListOptimizationResult | null>(null);
  const [maxStores, setMaxStores] = useState(3);

  const [query, setQuery] = useState('');
  const [qty, setQty] = useState('1');
  const [suggestions, setSuggestions] = useState<CanonicalProduct[]>([]);
  const [selected, setSelected] = useState<CanonicalProduct | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [finalizeVisible, setFinalizeVisible] = useState(false);
  const [receiptQrRaw, setReceiptQrRaw] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  const [isOptimizing, setIsOptimizing] = useState(false);
  const didAutoOptimizeRef = useRef(false);
  const createdAtRef = useRef<string>(new Date().toISOString());
  const optimizationSigRef = useRef<string | null>(null);

  const [editVisible, setEditVisible] = useState(false);
  const [expandedStoreIds, setExpandedStoreIds] = useState<Record<string, boolean>>({});

  const totalUnits = useMemo(
    () => draftItems.reduce((acc, it) => acc + (Number.isFinite(it.quantity) ? it.quantity : 0), 0),
    [draftItems]
  );

  const checkedCount = useMemo(() => draftItems.filter((it) => Boolean(it.is_checked)).length, [draftItems]);
  const hasOptimization = Boolean(optimization?.allocations?.length);

  const optimizationSets = useMemo(() => {
    const allocations = optimization?.allocations ?? [];
    const allocated = new Set<number>();
    for (const a of allocations) for (const it of a.items) allocated.add(it.canonical_id);

    const withoutRecent = new Set<number>((optimization?.items_without_price ?? []) as number[]);

    const inferredOutside = draftItems
      .map((it) => it.canonical_id)
      .filter((cid) => !allocated.has(cid) && !withoutRecent.has(cid));

    const outside = (optimization?.items_outside_selected_stores?.length
      ? optimization.items_outside_selected_stores
      : inferredOutside) as number[];

    return {
      allocated,
      withoutRecent,
      outside: new Set<number>(outside.map((x) => Number(x)).filter((x) => Number.isFinite(x))),
    };
  }, [draftItems, optimization?.allocations, optimization?.items_outside_selected_stores, optimization?.items_without_price]);

  const kpis = useMemo(() => {
    if (!optimization?.allocations?.length) {
      return {
        optimizedTotal: 0,
        baselineTotal: 0,
        savings: 0,
        savingsPercent: 0,
        excludedNoPriceCount: 0,
        excludedOutsideCount: 0,
        hasWorstData: false,
      };
    }

    const optimizedTotal = optimization.allocations.reduce((acc, a) => acc + (Number.isFinite(a.total) ? a.total : 0), 0);

    // Valor máximo deve ser o pior custo possível considerando apenas itens otimizados.
    // Quando o backend enviar total_worst_cost/potential_savings, usamos diretamente.
    const worstFromBackend = Number((optimization as any).total_worst_cost);
    const hasWorstData = Number.isFinite(worstFromBackend) && worstFromBackend > 0;
    const fallbackBaseline = optimizedTotal + (Number.isFinite(optimization.savings) ? Math.max(0, optimization.savings) : 0);
    const baselineTotal = hasWorstData ? worstFromBackend : fallbackBaseline;

    const potentialFromBackend = Number((optimization as any).potential_savings);
    const savings =
      hasWorstData && Number.isFinite(potentialFromBackend) && potentialFromBackend >= 0
        ? potentialFromBackend
        : Math.max(0, baselineTotal - optimizedTotal);

    const pctFromBackend = Number((optimization as any).potential_savings_percent);
    const savingsPercent =
      hasWorstData && Number.isFinite(pctFromBackend) && pctFromBackend >= 0
        ? pctFromBackend
        : baselineTotal > 0
          ? (savings / baselineTotal) * 100
          : 0;

    return {
      optimizedTotal,
      baselineTotal,
      savings,
      savingsPercent,
      excludedNoPriceCount: optimizationSets.withoutRecent.size,
      excludedOutsideCount: optimizationSets.outside.size,
      hasWorstData,
    };
  }, [draftItems, optimization?.allocations, optimization?.savings, optimization?.unoptimized_prices, optimizationSets.outside, optimizationSets.withoutRecent.size]);
  const currentOptimizationSignature = useMemo(
    () => optimizationSignature(draftItems, maxStores),
    [draftItems, maxStores]
  );

  const effectiveStatus = useMemo(() => computeListStatus(draftStatus, draftItems), [draftStatus, draftItems]);

  useEffect(() => {
    if (didAutoOptimizeRef.current) return;
    if (autoOptimize !== '1') return;
    if (isOptimizing) return;
    if (hasOptimization) return;
    if (!listName.trim()) return;
    if (!draftItems.length) return;

    didAutoOptimizeRef.current = true;
    void optimizeList();
  }, [autoOptimize, draftItems.length, hasOptimization, isOptimizing, listName]);

  useEffect(() => {
    void (async () => {
      const existing = listId ? await getShoppingListById(listId) : null;
      if (existing) {
        setListName(existing.name);
        setDraftItems(existing.items);
        setDraftStatus(existing.status ?? 'draft');
        setOptimization(existing.optimization ?? null);
        setMaxStores(existing.max_stores ?? 3);
        optimizationSigRef.current = existing.optimization ? optimizationSignature(existing.items, existing.max_stores ?? 3) : null;
        setExpandedStoreIds({});
        createdAtRef.current = existing.created_at || createdAtRef.current;
      }
    })();
  }, [listId]);

  useEffect(() => {
    if (!optimization) return;
    if (!optimizationSigRef.current) {
      optimizationSigRef.current = currentOptimizationSignature;
      return;
    }
    if (optimizationSigRef.current === currentOptimizationSignature) return;

    setOptimization(null);
    optimizationSigRef.current = null;
    setExpandedStoreIds({});
    if (draftStatus === 'optimized') setDraftStatus('draft');
  }, [currentOptimizationSignature, draftStatus, optimization]);

  useEffect(() => {
    // Sempre iniciar com todos os supermercados fechados
    setExpandedStoreIds({});
  }, [optimization?.optimized_at]);

  useEffect(() => {
    if (!listId) return;

    const hasUserContent = Boolean(listName.trim()) || draftItems.length > 0 || Boolean(optimization);
    if (!hasUserContent) return;

    const t = setTimeout(() => {
      void upsertShoppingList({
        id: listId,
        name: listName.trim() || 'Sem nome',
        max_stores: maxStores,
        items: draftItems,
        status: draftStatus,
        optimization,
        created_at: createdAtRef.current,
      });
    }, 350);

    return () => clearTimeout(t);
  }, [draftItems, draftStatus, effectiveStatus, listId, listName, maxStores, optimization]);

  useEffect(() => {
    setError(null);
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSelected(null);
      return;
    }

    const t = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await apiGet<CanonicalListResponse>('/canonical', { search: q, page: 1, page_size: 8 });
        const ranked = (res.items ?? [])
          .map((it) => ({ it, score: suggestionScore(it, q) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return canonicalTitle(a.it).localeCompare(canonicalTitle(b.it), 'pt-BR');
          })
          .map((x) => x.it);

        setSuggestions(ranked);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Erro ao buscar produtos';
        setError(message);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [query]);

  async function persist(partial?: Partial<ShoppingListDraft>) {
    const name = listName.trim();

    const next: Omit<ShoppingListDraft, 'updated_at'> = {
      id: listId,
      name: name || 'Sem nome',
      max_stores: maxStores,
      items: draftItems,
      status: draftStatus,
      optimization,
      created_at: createdAtRef.current,
      ...(partial ?? null),
    };

    await upsertShoppingList(next);
  }

  async function handleBack() {
    try {
      await persist();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao salvar lista';
      setError(message);
    } finally {
      router.back();
    }
  }

  function addItem() {
    setError(null);
    if (!selected) {
      setError('Selecione um produto da lista de sugestões');
      return;
    }

    const n = Number(qty);
    const quantity = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;

    setDraftItems((prev) => {
      const idx = prev.findIndex((it) => it.canonical_id === selected.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          quantity: next[idx].quantity + quantity,
        };
        return next;
      }

      const label = canonicalListLabel(selected);
      return [{ canonical_id: selected.id, product_name: label, quantity, is_checked: false }, ...prev];
    });

    setQuery('');
    setQty('1');
    setSelected(null);
    setSuggestions([]);
  }

  function toggleItemChecked(canonicalId: number) {
    setDraftItems((prev) =>
      prev.map((it) => (it.canonical_id === canonicalId ? { ...it, is_checked: !Boolean(it.is_checked) } : it))
    );
  }

  function removeItem(canonicalId: number) {
    setDraftItems((prev) => prev.filter((it) => it.canonical_id !== canonicalId));
  }

  async function saveList() {
    setError(null);
    const name = listName.trim();
    if (!name) {
      setError('Informe o nome da lista');
      return;
    }
    await persist({ name });
    router.back();
  }

  async function optimizeList() {
    setError(null);
    const name = listName.trim();

    const effectiveMaxStores = Number.isFinite(maxStores) ? Math.min(5, Math.max(1, maxStores)) : 3;

    const accessToken = tokens?.access_token;

    if (!accessToken) {
      setError('Você precisa estar logado para otimizar a lista');
      return;
    }
    if (!name) {
      setError('Informe o nome da lista antes de otimizar');
      return;
    }
    if (!draftItems.length) {
      setError('Adicione ao menos 1 item antes de otimizar');
      return;
    }
    setIsOptimizing(true);
    try {
      const res = await apiPost<AppOptimizationResult>(
        '/app/optimization',
        {
          max_stores: effectiveMaxStores,
          items: draftItems.map((it) => ({ canonical_id: it.canonical_id, quantity: it.quantity })),
        },
        { token: accessToken, onRefreshToken: refreshAccessToken }
      );

      if (!res.success) {
        setError(res.message || 'Não foi possível otimizar');
        return;
      }

      const normalized: ShoppingListOptimizationResult = {
        message: res.message,
        allocations: res.allocations.map((a) => ({
          store_id: a.store_id,
          store_name: a.store_name,
          store_address: a.store_address,
          total: a.total,
          items: a.items.map((it) => ({
            canonical_id: it.canonical_id,
            product_name: it.product_name,
            quantity: it.quantity,
            price: it.price,
            subtotal: it.subtotal,
          })),
        })),
        total_cost: res.total_cost,
        savings: res.savings,
        savings_percent: res.savings_percent,
        total_worst_cost: typeof res.total_worst_cost === 'number' ? res.total_worst_cost : undefined,
        potential_savings: typeof res.potential_savings === 'number' ? res.potential_savings : undefined,
        potential_savings_percent: typeof res.potential_savings_percent === 'number' ? res.potential_savings_percent : undefined,
        items_without_price: res.items_without_price,
        items_outside_selected_stores: res.items_outside_selected_stores,
        unoptimized_prices: res.unoptimized_prices,
        fallback_prices: res.fallback_prices,
        price_lookback_days: res.price_lookback_days,
        optimized_at: new Date().toISOString(),
      };

      setOptimization(normalized);
      optimizationSigRef.current = optimizationSignature(draftItems, effectiveMaxStores);
      setDraftStatus('optimized');
      setExpandedStoreIds({});
      await upsertShoppingList({
        id: listId,
        name,
        max_stores: effectiveMaxStores,
        items: draftItems,
        status: 'optimized',
        optimization: normalized,
        created_at: new Date().toISOString(),
      });
    } catch (e: any) {
      const message = e instanceof Error ? e.message : 'Erro ao otimizar lista';
      setError(message);
    } finally {
      setIsOptimizing(false);
    }
  }

  async function finalizePurchase() {
    setFinalizeError(null);
    const name = listName.trim();

    if (!tokens?.access_token) {
      setFinalizeError('Você precisa estar logado para finalizar a compra');
      return;
    }
    if (!name) {
      setFinalizeError('Informe o nome da lista antes de finalizar');
      return;
    }
    if (!draftItems.length) {
      setFinalizeError('Adicione ao menos 1 item antes de finalizar');
      return;
    }

    setIsFinalizing(true);
    try {
      await apiPost<{ id: number; receipt_chave_acesso?: string | null }>(
        '/app/purchases',
        {
          local_list_id: listId,
          list_name: name,
          status_final: effectiveStatus,
          finished_at: new Date().toISOString(),
          receipt_qr_raw: receiptQrRaw.trim() || null,
          items: draftItems.map((it) => ({
            canonical_id: it.canonical_id,
            product_name_snapshot: it.product_name,
            quantity: it.quantity,
            unit: 'un',
            is_checked: Boolean(it.is_checked),
          })),
        },
        { token: tokens.access_token, onRefreshToken: refreshAccessToken }
      );

      await upsertShoppingList({
        id: listId,
        name,
        items: draftItems,
        status: 'completed',
        optimization,
        created_at: new Date().toISOString(),
      });

      setFinalizeVisible(false);
      setReceiptQrRaw('');
      setDraftStatus('completed');
      setHasScanned(false);
      setShowScanner(false);
      router.back();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao finalizar compra';
      setFinalizeError(message);
    } finally {
      setIsFinalizing(false);
    }
  }

  return (
    <Screen>
      {hasOptimization ? (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Button variant="secondary" style={styles.headerIconBtn} onPress={() => void handleBack()}>
              Voltar
            </Button>
            <View style={styles.headerCenter}>
              <Text style={styles.title} numberOfLines={1}>
                {listName || 'Lista'}
              </Text>
              <Text style={styles.subtitle}>
                {checkedCount}/{draftItems.length} • {statusLabel(effectiveStatus)}
                {hasOptimization ? ' • Otimizada' : ''}
              </Text>
            </View>
            <Button variant="secondary" style={styles.headerIconBtn} onPress={() => setEditVisible(true)}>
              Editar
            </Button>
          </View>

          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Progresso</Text>
              <Text style={styles.summaryValue}>{checkedCount}/{draftItems.length}</Text>
            </View>

            <View style={styles.kpiGrid}>
              <View style={styles.kpiTile}>
                <Text style={styles.kpiLabel}>Valor máximo</Text>
                <Text style={styles.kpiValue}>R$ {formatCurrencyBRL(kpis.baselineTotal)}</Text>
              </View>
              <View style={styles.kpiTile}>
                <Text style={styles.kpiLabel}>Valor otimizado</Text>
                <Text style={styles.kpiValue}>R$ {formatCurrencyBRL(kpis.optimizedTotal)}</Text>
              </View>
              <View style={styles.kpiTile}>
                <Text style={styles.kpiLabel}>Economia proj.</Text>
                <Text style={styles.kpiValue}>R$ {formatCurrencyBRL(kpis.savings)}</Text>
              </View>
              <View style={styles.kpiTile}>
                <Text style={styles.kpiLabel}>Economia (%)</Text>
                <Text style={styles.kpiValue}>{kpis.savingsPercent.toFixed(1)}%</Text>
              </View>
            </View>

            {hasOptimization ? (
              <Text style={styles.kpiHint}>
                {kpis.hasWorstData
                  ? 'Cálculos consideram apenas itens com preço recente e dentro da otimização.'
                  : 'Economia projetada (pior caso) ainda não disponível para esta lista. Toque em Editar e otimize novamente para recalcular.'}
                {kpis.excludedNoPriceCount > 0 ? ` ${kpis.excludedNoPriceCount} item(ns) sem preço foram ignorados.` : ''}
                {kpis.excludedOutsideCount > 0 ? ` ${kpis.excludedOutsideCount} item(ns) fora da otimização foram ignorados.` : ''}
              </Text>
            ) : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </Card>

          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Supermercados</Text>
            {optimization!.allocations.map((a, idx) => {
              const key = String(a.store_id);
              const isOpen = Boolean(expandedStoreIds[key]);
              const tone = storeTone(theme, idx);
              return (
                <View key={key} style={[styles.storeBlock, { borderColor: tone.border, backgroundColor: tone.bg }]}>
                  <Pressable
                    onPress={() => setExpandedStoreIds((prev) => ({ ...prev, [key]: !Boolean(prev[key]) }))}
                    style={[styles.storeHeader, { backgroundColor: tone.headerBg }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.storeTitle} numberOfLines={1}>
                        {a.store_name}
                      </Text>
                      {a.store_address ? <Text style={styles.storeSub} numberOfLines={1}>{a.store_address}</Text> : null}
                    </View>
                    <Text style={[styles.storeTotal, { color: tone.accent }]}>R$ {a.total.toFixed(2)}</Text>
                  </Pressable>

                  {isOpen ? (
                    <View style={styles.storeItems}>
                      {a.items.map((it) => {
                        const local = draftItems.find((x) => x.canonical_id === it.canonical_id);
                        const checked = Boolean(local?.is_checked);
                        return (
                          <View
                            key={String(it.canonical_id)}
                            style={[styles.storeItemRow, { borderColor: tone.itemBorder, backgroundColor: tone.itemBg }]}>
                            <Pressable style={styles.checkWrap} onPress={() => toggleItemChecked(it.canonical_id)}>
                              <View style={[styles.checkBox, checked ? styles.checkBoxChecked : null]}>
                                {checked ? <View style={styles.checkDot} /> : null}
                              </View>
                            </Pressable>
                            <View style={styles.storeItemInfo}>
                              <Text style={[styles.itemName, checked ? styles.itemNameChecked : null]} numberOfLines={1}>
                                {it.product_name}
                              </Text>
                              <Text style={styles.itemSub} numberOfLines={1}>
                                Qtd: {it.quantity} • R$ {it.price.toFixed(2)} • Sub: R$ {it.subtotal.toFixed(2)}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}

            {(() => {
              const allocations = optimization?.allocations ?? [];
              const allocated = new Set<number>();
              for (const a of allocations) for (const it of a.items) allocated.add(it.canonical_id);

              const withoutRecent = new Set<number>((optimization?.items_without_price ?? []) as number[]);
              const inferredOutside = draftItems
                .map((it) => it.canonical_id)
                .filter((id) => !allocated.has(id) && !withoutRecent.has(id));

              const outside = (optimization?.items_outside_selected_stores?.length
                ? optimization.items_outside_selected_stores
                : inferredOutside) as number[];

              if (!outside.length) return null;

              const prices = optimization?.unoptimized_prices ?? [];
              const byId = new Map<number, ShoppingListFallbackPriceItem>();
              for (const p of prices) byId.set(p.canonical_id, p);

              const items = draftItems
                .filter((it) => outside.includes(it.canonical_id))
                .map((it) => ({ it, price: byId.get(it.canonical_id) }));

              if (!items.length) return null;

              return (
                <View style={{ marginTop: theme.spacing.md, backgroundColor: 'transparent' }}>
                  <Text style={styles.sectionTitle}>Itens fora dos supermercados selecionados</Text>
                  {items.map(({ it, price }) => (
                    <View key={String(it.canonical_id)} style={styles.storeItemRow}>
                      <Pressable style={styles.checkWrap} onPress={() => toggleItemChecked(it.canonical_id)}>
                        <View style={[styles.checkBox, it.is_checked ? styles.checkBoxChecked : null]}>
                          {it.is_checked ? <View style={styles.checkDot} /> : null}
                        </View>
                      </Pressable>
                      <View style={styles.storeItemInfo}>
                        <Text style={[styles.itemName, it.is_checked ? styles.itemNameChecked : null]} numberOfLines={1}>
                          {it.product_name}
                        </Text>
                        {price ? (
                          <Text style={styles.itemSub} numberOfLines={1}>
                            Qtd: {it.quantity} • R$ {price.price.toFixed(2)} ({price.store_name})
                          </Text>
                        ) : (
                          <Text style={styles.itemSub} numberOfLines={1}>
                            Qtd: {it.quantity} • sem preço nos supermercados selecionados
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                  <Text style={styles.meta}>
                    Dica: aumente a quantidade de supermercados na edição da lista para incluir esses itens na otimização.
                  </Text>
                </View>
              );
            })()}

            {(() => {
              const withoutRecent = optimization?.items_without_price ?? [];
              if (!withoutRecent.length) return null;

              const lookback = optimization?.price_lookback_days ?? 15;
              const fallback = optimization?.fallback_prices ?? [];
              const byId = new Map<number, ShoppingListFallbackPriceItem>();
              for (const p of fallback) byId.set(p.canonical_id, p);

              const items = draftItems
                .filter((it) => withoutRecent.includes(it.canonical_id))
                .map((it) => ({ it, fallback: byId.get(it.canonical_id) }));

              if (!items.length) return null;

              return (
                <View style={{ marginTop: theme.spacing.md, backgroundColor: 'transparent' }}>
                  <Text style={styles.sectionTitle}>Itens sem preço recente (últimos {lookback} dias)</Text>
                  {items.map(({ it, fallback }) => (
                    <View key={String(it.canonical_id)} style={styles.storeItemRow}>
                      <Pressable style={styles.checkWrap} onPress={() => toggleItemChecked(it.canonical_id)}>
                        <View style={[styles.checkBox, it.is_checked ? styles.checkBoxChecked : null]}>
                          {it.is_checked ? <View style={styles.checkDot} /> : null}
                        </View>
                      </Pressable>
                      <View style={styles.storeItemInfo}>
                        <Text style={[styles.itemName, it.is_checked ? styles.itemNameChecked : null]} numberOfLines={1}>
                          {it.product_name}
                        </Text>
                        {fallback ? (
                          <Text style={styles.itemSub} numberOfLines={1}>
                            Qtd: {it.quantity} • R$ {fallback.price.toFixed(2)} ({fallback.store_name})
                          </Text>
                        ) : (
                          <Text style={styles.itemSub} numberOfLines={1}>
                            Qtd: {it.quantity} • sem preço
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              );
            })()}
          </Card>
        </ScrollView>
      ) : (
        <>
          <View style={styles.headerRow}>
            <Button variant="secondary" style={styles.headerIconBtn} onPress={() => void handleBack()}>
              Voltar
            </Button>
            <View style={styles.headerCenter}>
              <Text style={styles.title} numberOfLines={1}>
                {listName || 'Lista'}
              </Text>
              <Text style={styles.subtitle}>
                {checkedCount}/{draftItems.length} • {statusLabel(effectiveStatus)}
                {hasOptimization ? ' • Otimizada' : ''}
              </Text>
            </View>
            <Button variant="secondary" style={styles.headerIconBtn} onPress={() => setEditVisible(true)}>
              Editar
            </Button>
          </View>

          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Progresso</Text>
              <Text style={styles.summaryValue}>{checkedCount}/{draftItems.length}</Text>
            </View>
            {hasOptimization ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total</Text>
                <Text style={styles.summaryValue}>R$ {optimization!.total_cost.toFixed(2)}</Text>
              </View>
            ) : null}
            {hasOptimization ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Economia</Text>
                <Text style={styles.summaryValue}>
                  R$ {optimization!.savings.toFixed(2)} ({optimization!.savings_percent.toFixed(1)}%)
                </Text>
              </View>
            ) : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </Card>

        <FlatList
          data={draftItems}
          keyExtractor={(it) => String(it.canonical_id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>Adicione itens para começar.</Text>}
          renderItem={({ item }) => (
            <View style={styles.itemRow}>
              <Pressable style={styles.checkWrap} onPress={() => toggleItemChecked(item.canonical_id)}>
                <View style={[styles.checkBox, item.is_checked ? styles.checkBoxChecked : null]}>
                  {item.is_checked ? <View style={styles.checkDot} /> : null}
                </View>
              </Pressable>

              <View style={styles.itemInfo}>
                <Text style={[styles.itemName, item.is_checked ? styles.itemNameChecked : null]}>{item.product_name}</Text>
                <Text style={styles.itemSub}>Qtd: {item.quantity}</Text>
              </View>
            </View>
          )}
        />
        </>
      )}

      <View style={styles.bottomBar}>
        <Button
          variant="secondary"
          onPress={() => {
            setFinalizeError(null);
            setShowScanner(false);
            setFinalizeVisible(true);
          }}
          style={styles.bottomBtn}>
          Finalizar
        </Button>
      </View>

      <Modal visible={editVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setEditVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => null}>
            <Text style={styles.modalTitle}>Editar lista</Text>
            <Input label="Nome da lista" value={listName} onChangeText={setListName} placeholder="Ex: Jantar" />

            <Input
              label="Máx. supermercados (1 a 5)"
              value={String(maxStores)}
              keyboardType="numeric"
              onChangeText={(v) => {
                const n = Number(v.replace(/[^0-9]/g, ''));
                if (!Number.isFinite(n)) {
                  setMaxStores(3);
                  return;
                }
                setMaxStores(Math.min(5, Math.max(1, n)));
              }}
              placeholder="3"
            />

            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Status</Text>
              <View style={styles.statusPills}>
                <Pressable style={[styles.statusPill, draftStatus === 'draft' ? styles.statusPillActive : null]} onPress={() => setDraftStatus('draft')}>
                  <Text style={[styles.statusPillText, draftStatus === 'draft' ? styles.statusPillTextActive : null]}>Edição</Text>
                </Pressable>
                <Pressable style={[styles.statusPill, draftStatus === 'closed' ? styles.statusPillActive : null]} onPress={() => setDraftStatus('closed')}>
                  <Text style={[styles.statusPillText, draftStatus === 'closed' ? styles.statusPillTextActive : null]}>Fechada</Text>
                </Pressable>
                <Pressable style={[styles.statusPill, draftStatus === 'optimized' ? styles.statusPillActive : null]} onPress={() => setDraftStatus('optimized')}>
                  <Text style={[styles.statusPillText, draftStatus === 'optimized' ? styles.statusPillTextActive : null]}>Otimizada</Text>
                </Pressable>
              </View>
            </View>

            <Input
              label="Produto (canônico)"
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                setSelected(null);
              }}
              placeholder="Digite para buscar..."
            />

            {isSearching ? <Text style={styles.meta}>Buscando...</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {suggestions.length > 0 ? (
              <View style={styles.suggestionsBox}>
                {suggestions.map((s) => {
                  const selectedId = selected?.id;
                  const isSelected = selectedId === s.id;
                  const title = canonicalTitle(s);
                  const meta = canonicalMeta(s);
                  return (
                    <Pressable
                      key={s.id}
                      style={[styles.suggestionRow, isSelected ? styles.suggestionRowSelected : null]}
                      onPress={() => {
                        setSelected(s);
                        setQuery(title);
                        setSuggestions([]);
                      }}>
                      <Text style={styles.suggestionTitle}>{title}</Text>
                      {meta ? <Text style={styles.suggestionSub}>{meta}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.row}>
              <View style={styles.colQtyWide}>
                <Input label="Qtd" value={qty} onChangeText={setQty} keyboardType="numeric" placeholder="1" />
              </View>
              <Button onPress={addItem} style={styles.primaryButton}>
                Adicionar
              </Button>
            </View>

            <View style={styles.row}>
              <Button onPress={() => void optimizeList()} disabled={isOptimizing} style={styles.primaryButton}>
                {isOptimizing ? 'Otimizando...' : 'Otimizar'}
              </Button>
            </View>

            <FlatList
              data={draftItems}
              keyExtractor={(it) => String(it.canonical_id)}
              style={{ maxHeight: 260, marginTop: theme.spacing.md }}
              renderItem={({ item }) => (
                <View style={styles.editItemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.product_name}</Text>
                    <Text style={styles.itemSub}>Qtd: {item.quantity}</Text>
                  </View>
                  <Pressable style={styles.removeButton} onPress={() => removeItem(item.canonical_id)}>
                    <Text style={styles.removeButtonText}>Remover</Text>
                  </Pressable>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>Sem itens.</Text>}
            />

            <View style={styles.modalActions}>
              <Button variant="secondary" onPress={() => setEditVisible(false)} style={styles.modalBtn}>
                Fechar
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={finalizeVisible} transparent animationType="fade" onRequestClose={() => setFinalizeVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Finalizar compra</Text>
            <Text style={styles.modalSub}>Cole o texto do QR code do cupom (opcional por enquanto).</Text>

            {!showScanner ? (
              <>
                <View style={styles.modalActions}>
                  <Button
                    variant="secondary"
                    onPress={() => {
                      void (async () => {
                        setFinalizeError(null);
                        const res = await requestPermission();
                        if (!res.granted) {
                          setFinalizeError('Permissão de câmera negada');
                          return;
                        }
                        setHasScanned(false);
                        setShowScanner(true);
                      })();
                    }}
                    style={styles.modalBtn}>
                    Escanear QR
                  </Button>
                </View>

                <Input
                  label="QR do cupom (texto)"
                  value={receiptQrRaw}
                  onChangeText={setReceiptQrRaw}
                  placeholder="Cole aqui o texto/URL do QR..."
                />
              </>
            ) : (
              <>
                <View style={styles.cameraBox}>
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={(result) => {
                      if (hasScanned) return;
                      if (!result?.data) return;
                      setHasScanned(true);
                      setReceiptQrRaw(result.data);
                      setShowScanner(false);
                    }}
                  />
                </View>

                <View style={styles.modalActions}>
                  <Button variant="secondary" onPress={() => setShowScanner(false)} style={styles.modalBtn}>
                    Voltar
                  </Button>
                  <Button
                    onPress={() => {
                      setShowScanner(false);
                    }}
                    style={styles.modalBtn}>
                    Usar código
                  </Button>
                </View>

                {permission?.granted ? null : <Text style={styles.modalSub}>Permissão de câmera não concedida.</Text>}
              </>
            )}

            {finalizeError ? <Text style={styles.errorText}>{finalizeError}</Text> : null}

            <View style={styles.modalActions}>
              <Button variant="secondary" onPress={() => setFinalizeVisible(false)} style={styles.modalBtn}>
                Cancelar
              </Button>
              <Button
                onPress={() => {
                  void finalizePurchase();
                }}
                disabled={isFinalizing}
                style={styles.modalBtn}>
                {isFinalizing ? 'Enviando...' : 'Confirmar'}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const makeStyles = (theme: AppTheme) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: theme.spacing.md,
    },
    title: {
      fontSize: theme.font.size.lg,
      fontWeight: theme.font.weight.bold,
      color: theme.colors.text.primary,
      textTransform: 'uppercase',
    },
    headerIconBtn: {
      height: 40,
    },
    headerCenter: {
      flex: 1,
    },
    subtitle: {
      marginTop: 2,
      color: theme.colors.text.muted,
      fontSize: 12,
    },
    summaryCard: {
      marginTop: theme.spacing.sm,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: theme.spacing.sm,
    },
    summaryLabel: {
      color: theme.colors.text.muted,
      fontSize: 12,
      fontWeight: '700',
    },
    summaryValue: {
      color: theme.colors.text.primary,
      fontSize: 12,
      fontWeight: '800',
    },
    kpiGrid: {
      marginTop: theme.spacing.md,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      backgroundColor: 'transparent',
    },
    kpiTile: {
      flexGrow: 1,
      flexBasis: '48%',
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.colors.bg.surface,
    },
    kpiLabel: {
      color: theme.colors.text.muted,
      fontSize: 12,
      fontWeight: '700',
    },
    kpiValue: {
      marginTop: 6,
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: '900',
    },
    kpiHint: {
      marginTop: theme.spacing.sm,
      color: theme.colors.text.muted,
      fontSize: theme.font.size.xs,
      lineHeight: 18,
    },
    card: {
      marginTop: theme.spacing.sm,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: theme.colors.text.primary,
    },
    row: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-end',
    },
    colQtyWide: {
      width: 120,
    },
    primaryButton: {
      flex: 1,
      marginTop: theme.spacing.sm,
    },
    meta: {
      marginTop: theme.spacing.sm,
      color: theme.colors.text.muted,
      fontSize: theme.font.size.xs,
    },
    errorText: {
      marginTop: theme.spacing.sm,
      color: theme.colors.danger.text,
      fontSize: theme.font.size.xs,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 96,
    },
    listContent: {
      paddingTop: 12,
      paddingBottom: 96,
    },
    emptyText: {
      color: theme.colors.text.muted,
      marginTop: theme.spacing.md,
      textAlign: 'center',
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radius.md,
      padding: 12,
      marginBottom: 10,
      backgroundColor: theme.colors.bg.surface,
    },
    checkWrap: {
      paddingRight: 10,
      paddingVertical: 6,
    },
    checkBox: {
      width: 22,
      height: 22,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.colors.border.subtle,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.bg.surface,
    },
    checkBoxChecked: {
      borderColor: theme.colors.text.primary,
    },
    checkDot: {
      width: 10,
      height: 10,
      borderRadius: 4,
      backgroundColor: theme.colors.text.primary,
    },
    itemInfo: {
      flex: 1,
      paddingRight: 12,
    },
    itemName: {
      fontWeight: '700',
      color: theme.colors.text.primary,
    },
    itemNameChecked: {
      color: theme.colors.text.muted,
      textDecorationLine: 'line-through',
    },
    itemSub: {
      marginTop: 4,
      color: theme.colors.text.muted,
      fontSize: 12,
    },
    removeButton: {
      height: 36,
      paddingHorizontal: 12,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.danger.soft,
    },
    removeButtonText: {
      color: theme.colors.danger.text,
      fontWeight: '700',
      fontSize: 12,
    },
    suggestionsBox: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radius.md,
      overflow: 'hidden',
      backgroundColor: theme.colors.bg.surface,
    },
    suggestionRow: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border.subtle,
    },
    suggestionRowSelected: {
      backgroundColor: theme.colors.bg.surfaceAlt,
    },
    suggestionTitle: {
      fontWeight: '700',
    },
    suggestionSub: {
      marginTop: 3,
      color: theme.colors.text.muted,
      fontSize: 12,
    },
    statusRow: {
      marginTop: theme.spacing.sm,
    },
    statusLabel: {
      marginBottom: 6,
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.text.muted,
    },
    statusPills: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    statusPill: {
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.bg.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
    },
    statusPillActive: {
      borderColor: theme.colors.text.primary,
    },
    statusPillText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.text.muted,
    },
    statusPillTextActive: {
      color: theme.colors.text.primary,
    },
    statusAuto: {
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    statusAutoText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.text.primary,
    },
    storeItemRow: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    storeItemInfo: {
      flex: 1,
    },
    storeBlock: {
      marginTop: 12,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      borderRadius: theme.radius.md,
      overflow: 'hidden',
      backgroundColor: theme.colors.bg.surface,
    },
    storeHeader: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.colors.bg.surfaceAlt,
    },
    storeTitle: {
      fontWeight: '800',
      color: theme.colors.text.primary,
    },
    storeSub: {
      marginTop: 2,
      fontSize: 12,
      color: theme.colors.text.muted,
    },
    storeTotal: {
      fontWeight: '800',
      color: theme.colors.text.primary,
    },
    storeItems: {
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    bottomBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: theme.spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.bg.surface,
    },
    bottomBtn: {
      height: 48,
    },
    editItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border.subtle,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(2, 6, 23, 0.55)',
      padding: theme.spacing.lg,
      justifyContent: 'center',
    },
    modalCard: {
      backgroundColor: theme.colors.bg.surface,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      padding: theme.spacing.lg,
    },
    modalTitle: {
      fontSize: theme.font.size.lg,
      fontWeight: theme.font.weight.bold,
      color: theme.colors.text.primary,
    },
    modalSub: {
      marginTop: 6,
      marginBottom: theme.spacing.md,
      fontSize: theme.font.size.sm,
      color: theme.colors.text.muted,
    },
    modalActions: {
      marginTop: theme.spacing.md,
      flexDirection: 'row',
      gap: 10,
    },
    modalBtn: {
      flex: 1,
      height: 42,
    },
    cameraBox: {
      marginTop: theme.spacing.md,
      width: '100%',
      height: 320,
      borderRadius: theme.radius.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.border.subtle,
      backgroundColor: theme.colors.bg.surfaceAlt,
    },
  });
