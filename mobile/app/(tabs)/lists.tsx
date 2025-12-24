import { useCallback, useEffect, useMemo, useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Alert, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { deleteShoppingList, loadShoppingLists, newId, ShoppingListDraft, upsertShoppingList } from '@/lib/shoppingLists';
import { useTheme } from '@/lib/theme';

function statusLabel(status: string): string {
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

type FilterKey = 'all' | 'active' | 'optimized' | 'completed';

type ToneKey = 'draft' | 'in_progress' | 'optimized' | 'completed';

function isCompleted(list: ShoppingListDraft): boolean {
  return (list.status ?? 'draft') === 'completed';
}

function isOptimized(list: ShoppingListDraft): boolean {
  if ((list.status ?? 'draft') === 'optimized') return true;
  return Boolean((list as any).optimization?.allocations?.length);
}

function formatUpdatedAt(list: ShoppingListDraft): string {
  const raw = list.updated_at || list.created_at;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return '';
  try {
    return `Atualizada ${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return '';
  }
}

function checkedCount(list: ShoppingListDraft): number {
  return Array.isArray(list.items) ? list.items.filter((it) => Boolean((it as any).is_checked)).length : 0;
}

function isInPurchase(list: ShoppingListDraft): boolean {
  if (isCompleted(list)) return false;
  const total = Array.isArray(list.items) ? list.items.length : 0;
  const checked = checkedCount(list);
  if (!total) return false;
  return checked > 0 && checked < total;
}

function listTone(list: ShoppingListDraft): ToneKey {
  if (isCompleted(list)) return 'completed';
  if (isInPurchase(list)) return 'in_progress';
  if (isOptimized(list)) return 'optimized';
  return 'draft';
}

function filterTone(filter: FilterKey): ToneKey {
  if (filter === 'completed') return 'completed';
  if (filter === 'optimized') return 'optimized';
  if (filter === 'active') return 'in_progress';
  return 'draft';
}

export default function ListsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [savedLists, setSavedLists] = useState<ShoppingListDraft[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const tones: Record<ToneKey, { bg: string; border: string; text: string }> = useMemo(
    () => {
      if (theme.name === 'dark') {
        return {
          draft: { bg: theme.colors.bg.surfaceAlt, border: theme.colors.border.subtle, text: theme.colors.text.muted },
          in_progress: { bg: 'rgba(245, 158, 11, 0.18)', border: 'rgba(245, 158, 11, 0.45)', text: '#fbbf24' },
          optimized: { bg: 'rgba(59, 130, 246, 0.18)', border: 'rgba(59, 130, 246, 0.45)', text: theme.colors.brand.accent },
          completed: { bg: theme.colors.bg.surfaceAlt, border: theme.colors.border.subtle, text: theme.colors.text.muted },
        };
      }
      return {
        draft: { bg: theme.colors.bg.surfaceAlt, border: theme.colors.border.subtle, text: theme.colors.text.muted },
        in_progress: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
        optimized: { bg: '#dbeafe', border: '#93c5fd', text: theme.colors.brand.primaryDark },
        completed: { bg: theme.colors.bg.surfaceAlt, border: theme.colors.border.subtle, text: theme.colors.text.muted },
      };
    },
    [theme]
  );

  const styles = useMemo(
    () =>
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
        },
        iconBtn: {
          height: 40,
          width: 40,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
          backgroundColor: theme.colors.bg.surface,
        },
        filtersRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: theme.spacing.md,
        },
        filterPill: {
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
          backgroundColor: theme.colors.bg.surface,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
        },
        filterPillActive: {
          borderColor: theme.colors.text.primary,
        },
        filterText: {
          fontSize: 12,
          fontWeight: '700',
          color: theme.colors.text.muted,
        },
        filterTextActive: {
          color: theme.colors.text.primary,
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
        cardRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        },
        cardMain: {
          flex: 1,
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
          borderRadius: theme.radius.md,
          paddingHorizontal: 12,
          paddingVertical: 12,
          backgroundColor: theme.colors.bg.surface,
        },
        trashBtn: {
          marginLeft: 10,
          height: 44,
          width: 44,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
          backgroundColor: theme.colors.bg.surface,
        },
        cardTop: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          backgroundColor: 'transparent',
        },
        badges: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: 'transparent',
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
        itemName: {
          fontWeight: '700',
          color: theme.colors.text.primary,
          flex: 1,
          textTransform: 'uppercase',
        },
        cardBottom: {
          marginTop: 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'transparent',
        },
        cardActionsRow: {
          marginTop: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 10,
          backgroundColor: 'transparent',
        },
        cardActionBtn: {
          height: 40,
          paddingHorizontal: 12,
          borderRadius: 12,
        },
        metaText: {
          color: theme.colors.text.muted,
          fontSize: 12,
          fontWeight: '600',
        },
      }),
    [theme]
  );

  async function refreshLists() {
    const lists = await loadShoppingLists();
    const sorted = [...lists].sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at).getTime();
      const tb = new Date(b.updated_at || b.created_at).getTime();
      return tb - ta;
    });
    setSavedLists(sorted);
  }

  useEffect(() => {
    refreshLists();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshLists();
    }, [])
  );

  function startNewList() {
    const id = newId();
    void (async () => {
      try {
        await upsertShoppingList({
          id,
          name: 'Nova lista',
          items: [],
          status: 'draft',
          optimization: null,
          created_at: new Date().toISOString(),
        });
      } finally {
        router.push(`/list/${id}` as any);
      }
    })();
  }

  function openList(l: ShoppingListDraft) {
    router.push(`/list/${l.id}` as any);
  }

  function openListAndOptimize(l: ShoppingListDraft) {
    router.push(`/list/${l.id}?autoOptimize=1` as any);
  }

  function primaryActionLabel(list: ShoppingListDraft): string {
    if (isCompleted(list)) return 'Ver';
    if (isInPurchase(list)) return 'Continuar';
    if (isOptimized(list)) return 'Comprar';
    return 'Editar';
  }

  async function removeList(id: string) {
    await deleteShoppingList(id);
    await refreshLists();
  }

  function confirmRemoveList(list: ShoppingListDraft) {
    Alert.alert('Excluir lista', `Tem certeza que deseja excluir "${list.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          void removeList(list.id);
        },
      },
    ]);
  }

  const visibleLists = useMemo(() => {
    return savedLists.filter((l) => {
      if (filter === 'all') return true;
      if (filter === 'completed') return isCompleted(l);
      if (filter === 'optimized') return isOptimized(l);
      // active (em compra)
      return isInPurchase(l);
    });
  }, [filter, savedLists]);

  const emptyText = useMemo(() => {
    if (filter === 'all') return 'Você ainda não tem listas. Toque no + para criar a primeira.';
    if (filter === 'active') return 'Nenhuma lista em compra no momento.';
    if (filter === 'optimized') return 'Nenhuma lista otimizada ainda.';
    return 'Nenhuma lista concluída ainda.';
  }, [filter]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    void refreshLists().finally(() => setIsRefreshing(false));
  }, []);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Minhas listas</Text>
        <Pressable accessibilityLabel="Nova lista" style={styles.iconBtn} onPress={startNewList}>
          <FontAwesome name="plus" size={18} color={theme.colors.text.primary} />
        </Pressable>
      </View>

      <View style={styles.filtersRow}>
        <Pressable
          style={[
            styles.filterPill,
            filter === 'all' ? styles.filterPillActive : null,
            filter === 'all' ? { backgroundColor: tones[filterTone('all')].bg, borderColor: tones[filterTone('all')].border } : null,
          ]}
          onPress={() => setFilter('all')}>
          <Text
            style={[
              styles.filterText,
              filter === 'all' ? styles.filterTextActive : null,
              filter === 'all' ? { color: tones[filterTone('all')].text } : null,
            ]}>
            Todas
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.filterPill,
            filter === 'active' ? styles.filterPillActive : null,
            filter === 'active'
              ? { backgroundColor: tones[filterTone('active')].bg, borderColor: tones[filterTone('active')].border }
              : null,
          ]}
          onPress={() => setFilter('active')}>
          <Text
            style={[
              styles.filterText,
              filter === 'active' ? styles.filterTextActive : null,
              filter === 'active' ? { color: tones[filterTone('active')].text } : null,
            ]}>
            Em compra
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.filterPill,
            filter === 'optimized' ? styles.filterPillActive : null,
            filter === 'optimized'
              ? { backgroundColor: tones[filterTone('optimized')].bg, borderColor: tones[filterTone('optimized')].border }
              : null,
          ]}
          onPress={() => setFilter('optimized')}>
          <Text
            style={[
              styles.filterText,
              filter === 'optimized' ? styles.filterTextActive : null,
              filter === 'optimized' ? { color: tones[filterTone('optimized')].text } : null,
            ]}>
            Otimizada
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.filterPill,
            filter === 'completed' ? styles.filterPillActive : null,
            filter === 'completed'
              ? { backgroundColor: tones[filterTone('completed')].bg, borderColor: tones[filterTone('completed')].border }
              : null,
          ]}
          onPress={() => setFilter('completed')}>
          <Text
            style={[
              styles.filterText,
              filter === 'completed' ? styles.filterTextActive : null,
              filter === 'completed' ? { color: tones[filterTone('completed')].text } : null,
            ]}>
            Concluída
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={visibleLists}
        keyExtractor={(it) => it.id}
        contentContainerStyle={styles.listContent}
        onRefresh={onRefresh}
        refreshing={isRefreshing}
        ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}
        renderItem={({ item }) => (
          <View style={styles.cardRow}>
            <Pressable
              style={[
                styles.cardMain,
                {
                  borderColor: tones[listTone(item)].border,
                  backgroundColor: theme.name === 'dark' ? theme.colors.bg.surface : tones[listTone(item)].bg,
                },
              ]}
              onPress={() => openList(item)}>
              <View style={styles.cardTop}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={styles.badges}>
                  {isOptimized(item) ? (
                    <View style={[styles.badge, { backgroundColor: tones.optimized.bg, borderColor: tones.optimized.border }]}>
                      <Text style={[styles.badgeText, { color: tones.optimized.text }]}>Otimizada</Text>
                    </View>
                  ) : null}
                  {listTone(item) !== 'optimized' ? (
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: tones[listTone(item)].bg,
                          borderColor: tones[listTone(item)].border,
                        },
                      ]}>
                      <Text style={[styles.badgeText, { color: tones[listTone(item)].text }]}>{statusLabel(listTone(item))}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={styles.cardBottom}>
                <Text style={styles.metaText}>{checkedCount(item)}/{item.items.length} itens</Text>
                {isOptimized(item) ? (
                  <Text style={styles.metaText}>Total: R$ {(item as any).optimization?.total_cost?.toFixed?.(2) ?? '--'}</Text>
                ) : (
                  <Text style={styles.metaText}>{formatUpdatedAt(item) || 'Toque para abrir'}</Text>
                )}
              </View>

              {isOptimized(item) ? (
                <View style={styles.cardBottom}>
                  <Text style={styles.metaText}>{formatUpdatedAt(item) || ''}</Text>
                  <Text style={styles.metaText}>
                    Economia: R$ {(item as any).optimization?.savings?.toFixed?.(2) ?? '--'} ({(item as any).optimization?.savings_percent?.toFixed?.(1) ?? '--'}%)
                  </Text>
                </View>
              ) : null}

              <View style={styles.cardActionsRow}>
                <Button variant="secondary" style={styles.cardActionBtn} onPress={() => openList(item)}>
                  {primaryActionLabel(item)}
                </Button>
                {!isCompleted(item) && !isOptimized(item) && item.items.length > 0 ? (
                  <Button style={styles.cardActionBtn} onPress={() => openListAndOptimize(item)}>
                    Otimizar
                  </Button>
                ) : null}
              </View>
            </Pressable>

            <Pressable
              accessibilityLabel="Excluir lista"
              style={styles.trashBtn}
              onPress={() => confirmRemoveList(item)}>
              <FontAwesome name="trash" size={18} color={theme.colors.danger.text} />
            </Pressable>
          </View>
        )}
      />
    </Screen>
  );
}
