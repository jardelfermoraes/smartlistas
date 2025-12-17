import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet } from 'react-native';
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
  ShoppingListOptimizationResult,
  ShoppingListStatus,
  upsertShoppingList,
} from '@/lib/shoppingLists';
import { theme } from '@/lib/theme';

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

function canonicalSuggestionLabel(s: CanonicalProduct, typedQuery: string): string {
  const base = (s.nome ?? '').trim();
  const q = (typedQuery ?? '').trim();
  if (!base) return q || 'Produto';

  const baseLower = base.toLowerCase();
  const qLower = q.toLowerCase();
  const shouldPrefix = qLower.length >= 2 && !baseLower.includes(qLower);

  const name = shouldPrefix ? `${q} - ${base}` : base;

  const brand = (s.marca ?? '').trim();
  const size = s.quantidade_padrao ? `${s.quantidade_padrao}${s.unidade_padrao}` : (s.unidade_padrao ?? '').trim();

  const parts = [name, brand, size].filter((p) => Boolean(p));
  return parts.join(' • ');
}

function canonicalSuggestionLabelStable(s: CanonicalProduct): string {
  const base = (s.nome ?? '').trim();
  const brand = (s.marca ?? '').trim();
  const size = s.quantidade_padrao ? `${s.quantidade_padrao}${s.unidade_padrao}` : (s.unidade_padrao ?? '').trim();
  const parts = [base, brand, size].filter((p) => Boolean(p));
  return parts.join(' • ') || 'Produto';
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
  items_without_price: number[];
};

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
  const { tokens } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();

  const listId = typeof id === 'string' ? id : '';

  const [listName, setListName] = useState('');
  const [draftItems, setDraftItems] = useState<ShoppingListDraft['items']>([]);
  const [draftStatus, setDraftStatus] = useState<ShoppingListStatus>('draft');
  const [optimization, setOptimization] = useState<ShoppingListOptimizationResult | null>(null);

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

  const [editVisible, setEditVisible] = useState(false);
  const [expandedStoreIds, setExpandedStoreIds] = useState<Record<string, boolean>>({});

  const totalUnits = useMemo(
    () => draftItems.reduce((acc, it) => acc + (Number.isFinite(it.quantity) ? it.quantity : 0), 0),
    [draftItems]
  );

  const checkedCount = useMemo(() => draftItems.filter((it) => Boolean(it.is_checked)).length, [draftItems]);
  const hasOptimization = Boolean(optimization?.allocations?.length);

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
        setExpandedStoreIds({});
        createdAtRef.current = existing.created_at || createdAtRef.current;
      }
    })();
  }, [listId]);

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
        items: draftItems,
        status: effectiveStatus,
        optimization,
        created_at: createdAtRef.current,
      });
    }, 350);

    return () => clearTimeout(t);
  }, [listId, listName, draftItems, effectiveStatus, optimization]);

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
        setSuggestions(res.items);
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
      items: draftItems,
      status: effectiveStatus,
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

      const label = canonicalSuggestionLabel(selected, query);
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

    if (!tokens?.access_token) {
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
        `/app/optimization`,
        {
          max_stores: 3,
          items: draftItems.map((it) => ({
            canonical_id: it.canonical_id,
            quantity: it.quantity,
          })),
        },
        { token: tokens.access_token }
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
        optimized_at: new Date().toISOString(),
      };

      setOptimization(normalized);
      setDraftStatus('optimized');
      setExpandedStoreIds({});
      await upsertShoppingList({
        id: listId,
        name,
        items: draftItems,
        status: 'optimized',
        optimization: normalized,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
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
        { token: tokens.access_token }
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

      {hasOptimization ? (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Supermercados</Text>
          {optimization!.allocations.map((a) => {
            const key = String(a.store_id);
            const isOpen = Boolean(expandedStoreIds[key]);
            return (
              <View key={key} style={styles.storeBlock}>
                <Pressable
                  onPress={() => setExpandedStoreIds((prev) => ({ ...prev, [key]: !Boolean(prev[key]) }))}
                  style={styles.storeHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.storeTitle} numberOfLines={1}>
                      {a.store_name}
                    </Text>
                    {a.store_address ? <Text style={styles.storeSub} numberOfLines={1}>{a.store_address}</Text> : null}
                  </View>
                  <Text style={styles.storeTotal}>R$ {a.total.toFixed(2)}</Text>
                </Pressable>

                {isOpen ? (
                  <View style={styles.storeItems}>
                    {a.items.map((it) => {
                      const local = draftItems.find((x) => x.canonical_id === it.canonical_id);
                      const checked = Boolean(local?.is_checked);
                      return (
                        <Pressable
                          key={String(it.canonical_id)}
                          style={styles.storeItemRow}
                          onPress={() => toggleItemChecked(it.canonical_id)}>
                          <View style={[styles.checkBox, checked ? styles.checkBoxChecked : null]}>
                            {checked ? <View style={styles.checkDot} /> : null}
                          </View>
                          <View style={styles.storeItemInfo}>
                            <Text style={[styles.itemName, checked ? styles.itemNameChecked : null]} numberOfLines={1}>
                              {it.product_name}
                            </Text>
                            <Text style={styles.itemSub} numberOfLines={1}>
                              Qtd: {it.quantity} • R$ {it.price.toFixed(2)} • Sub: R$ {it.subtotal.toFixed(2)}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
      ) : (
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

              <Pressable style={styles.itemInfo} onPress={() => toggleItemChecked(item.canonical_id)}>
                <Text style={[styles.itemName, item.is_checked ? styles.itemNameChecked : null]}>{item.product_name}</Text>
                <Text style={styles.itemSub}>Qtd: {item.quantity}</Text>
              </Pressable>
            </View>
          )}
        />
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
                  const label = canonicalSuggestionLabel(s, query);
                  const stableLabel = canonicalSuggestionLabelStable(s);
                  return (
                    <Pressable
                      key={s.id}
                      style={[styles.suggestionRow, isSelected ? styles.suggestionRowSelected : null]}
                      onPress={() => {
                        setSelected(s);
                        setQuery(stableLabel);
                        setSuggestions([]);
                      }}>
                      <Text style={styles.suggestionTitle}>{label}</Text>
                      <Text style={styles.suggestionSub}>
                        {s.marca ? `${s.marca} • ` : ''}
                        {s.quantidade_padrao ? `${s.quantidade_padrao}${s.unidade_padrao}` : s.unidade_padrao}
                      </Text>
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

const styles = StyleSheet.create({
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
