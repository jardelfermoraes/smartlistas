import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { apiGet } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { newId, upsertShoppingList } from '@/lib/shoppingLists';
import { theme } from '@/lib/theme';

type PurchaseItemOut = {
  id: number;
  canonical_id?: number | null;
  product_name_snapshot?: string | null;
  quantity: number;
  unit: string;
  is_checked: boolean;
};

type PurchaseOut = {
  id: number;
  local_list_id?: string | null;
  list_name?: string | null;
  status_final: string;
  finished_at: string;
  receipt_chave_acesso?: string | null;
  items: PurchaseItemOut[];
};

function redoableCount(p: PurchaseOut | null): number {
  if (!p?.items?.length) return 0;
  return p.items.filter((it) => typeof it.canonical_id === 'number' && Number.isFinite(it.canonical_id)).length;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  try {
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function HistoryScreen() {
  const { tokens, refreshAccessToken } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<PurchaseOut[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<PurchaseOut | null>(null);

  const totalPurchases = items.length;
  const totalChecked = useMemo(() => items.reduce((acc, p) => acc + p.items.filter((it) => Boolean(it.is_checked)).length, 0), [items]);

  async function redoPurchase(p: PurchaseOut) {
    const now = new Date();
    const id = newId();
    const baseName = (p.list_name ?? 'Compra').trim() || 'Compra';
    const dateLabel = (() => {
      try {
        return now.toLocaleDateString('pt-BR');
      } catch {
        return now.toISOString().slice(0, 10);
      }
    })();
    const name = `${baseName} (refazer) - ${dateLabel}`;

    const mapped = (p.items ?? [])
      .filter((it) => typeof it.canonical_id === 'number' && Number.isFinite(it.canonical_id))
      .map((it) => ({
        canonical_id: it.canonical_id as number,
        product_name: (it.product_name_snapshot ?? 'Item').trim() || 'Item',
        quantity: Number.isFinite(it.quantity) && it.quantity > 0 ? it.quantity : 1,
        is_checked: false,
      }));

    await upsertShoppingList({
      id,
      name,
      items: mapped,
      status: 'draft',
      optimization: null,
      created_at: now.toISOString(),
    });

    setSelected(null);
    router.push(`/list/${id}` as any);
  }

  async function load() {
    setError(null);

    if (!tokens?.access_token) {
      setItems([]);
      return;
    }

    setIsLoading(true);
    try {
      const data = await apiGet<PurchaseOut[]>(
        '/app/purchases',
        { page: 1, page_size: 20 },
        { token: tokens.access_token, onRefreshToken: refreshAccessToken }
      );
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar histórico');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tokens?.access_token]);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Histórico</Text>
        <Pressable style={styles.refreshBtn} onPress={() => void load()}>
          <Text style={styles.refreshText}>{isLoading ? '...' : 'Atualizar'}</Text>
        </Pressable>
      </View>

      {!tokens?.access_token ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Você precisa estar logado</Text>
          <Text style={styles.cardText}>Faça login para ver seu histórico de compras.</Text>
        </Card>
      ) : (
        <>
          <Card style={styles.card}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Compras</Text>
              <Text style={styles.summaryValue}>{totalPurchases}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Itens marcados</Text>
              <Text style={styles.summaryValue}>{totalChecked}</Text>
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </Card>

          <FlatList
            data={items}
            keyExtractor={(it) => String(it.id)}
            contentContainerStyle={styles.listContent}
            onRefresh={() => void load()}
            refreshing={isLoading}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {isLoading ? 'Carregando...' : 'Nenhuma compra registrada ainda.'}
              </Text>
            }
            renderItem={({ item }) => {
              const checked = item.items.filter((it) => Boolean(it.is_checked)).length;
              const total = item.items.length;
              return (
                <Pressable onPress={() => setSelected(item)}>
                  <Card style={styles.purchaseCard}>
                    <View style={styles.purchaseTop}>
                      <Text style={styles.purchaseTitle} numberOfLines={1}>
                        {item.list_name || 'Compra'}
                      </Text>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.status_final}</Text>
                      </View>
                    </View>

                    <View style={styles.purchaseBottom}>
                      <Text style={styles.metaText}>{formatDate(item.finished_at)}</Text>
                      <Text style={styles.metaText}>
                        {checked}/{total} itens
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              );
            }}
          />

          <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
            <Pressable style={styles.modalOverlay} onPress={() => setSelected(null)}>
              <Pressable style={styles.modalCard} onPress={() => null}>
                <Text style={styles.modalTitle}>{selected?.list_name || 'Detalhes da compra'}</Text>
                <Text style={styles.modalSub}>{selected ? formatDate(selected.finished_at) : ''}</Text>

                <FlatList
                  data={selected?.items ?? []}
                  keyExtractor={(it) => String(it.id)}
                  style={{ maxHeight: 360 }}
                  renderItem={({ item: it }) => (
                    <View style={styles.itemRow}>
                      <View style={[styles.checkBox, it.is_checked ? styles.checkBoxChecked : null]}>
                        {it.is_checked ? <View style={styles.checkDot} /> : null}
                      </View>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName} numberOfLines={1}>
                          {it.product_name_snapshot || 'Item'}
                        </Text>
                        <Text style={styles.itemSub}>
                          Qtd: {it.quantity} • {it.unit}
                        </Text>
                      </View>
                    </View>
                  )}
                  ListEmptyComponent={<Text style={styles.emptyText}>Sem itens.</Text>}
                />

                {selected && redoableCount(selected) < (selected.items?.length ?? 0) ? (
                  <Text style={styles.warnText}>
                    Atenção: {((selected.items?.length ?? 0) - redoableCount(selected)).toString()} item(ns) não podem ser refeitos
                    automaticamente.
                  </Text>
                ) : null}

                <View style={styles.modalActions}>
                  <Button
                    onPress={() => {
                      if (!selected) return;
                      void redoPurchase(selected);
                    }}
                    style={styles.modalBtn}>
                    Refazer compra
                  </Button>
                  <Button variant="secondary" onPress={() => setSelected(null)} style={styles.modalBtn}>
                    Fechar
                  </Button>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
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
  },
  refreshBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.bg.surface,
  },
  refreshText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  card: {
    marginTop: theme.spacing.sm,
  },
  cardTitle: {
    fontWeight: theme.font.weight.bold,
    color: theme.colors.text.primary,
  },
  cardText: {
    marginTop: theme.spacing.xs,
    color: theme.colors.text.muted,
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
  errorText: {
    marginTop: theme.spacing.sm,
    color: theme.colors.danger.text,
    fontSize: theme.font.size.xs,
  },
  warnText: {
    marginTop: theme.spacing.sm,
    color: theme.colors.text.muted,
    fontSize: theme.font.size.xs,
    fontWeight: '600',
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  emptyText: {
    color: theme.colors.text.muted,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
  purchaseCard: {
    marginTop: theme.spacing.sm,
  },
  purchaseTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  purchaseTitle: {
    fontWeight: '800',
    color: theme.colors.text.primary,
    flex: 1,
  },
  badge: {
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    backgroundColor: theme.colors.bg.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.text.muted,
  },
  purchaseBottom: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaText: {
    color: theme.colors.text.muted,
    fontSize: 12,
    fontWeight: '600',
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
  itemRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  },
  itemName: {
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  itemSub: {
    marginTop: 4,
    color: theme.colors.text.muted,
    fontSize: 12,
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
});
