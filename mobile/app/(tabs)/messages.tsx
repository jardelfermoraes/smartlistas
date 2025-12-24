import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, FlatList, Pressable, StyleSheet } from 'react-native';

import { useFocusEffect } from '@react-navigation/native';

import { useRouter } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import {
  clearInbox,
  InboxMessage,
  loadInbox,
  deleteInboxMessage,
  markAllInboxMessagesRead,
  markInboxMessageRead,
  markInboxMessageUnread,
} from '@/lib/notifications';
import { useTheme } from '@/lib/theme';

type FilterKey = 'all' | 'unread' | 'read';

export default function MessagesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<InboxMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await loadInbox();
      setItems(next);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
      }
    });

    return () => {
      sub.remove();
    };
  }, [refresh]);

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
        headerActionsRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        },
        title: {
          fontSize: theme.font.size.lg,
          fontWeight: theme.font.weight.bold,
          color: theme.colors.text.primary,
        },
        clearBtn: {
          height: 40,
          paddingHorizontal: 12,
          borderRadius: 12,
        },
        markAllBtn: {
          height: 40,
          paddingHorizontal: 12,
          borderRadius: 12,
        },
        empty: {
          marginTop: theme.spacing.lg,
          color: theme.colors.text.muted,
          textAlign: 'center',
        },
        itemCard: {
          marginBottom: theme.spacing.md,
        },
        itemCardUnread: {
          borderColor: theme.colors.brand.primary,
        },
        itemHeaderRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          backgroundColor: 'transparent',
        },
        unreadDot: {
          width: 10,
          height: 10,
          borderRadius: 999,
          backgroundColor: theme.colors.brand.primary,
          marginTop: 4,
        },
        itemTitle: {
          fontSize: theme.font.size.md,
          fontWeight: theme.font.weight.bold,
          color: theme.colors.text.primary,
        },
        itemTitleRead: {
          fontWeight: theme.font.weight.semibold,
          color: theme.colors.text.secondary,
        },
        itemBody: {
          marginTop: 6,
          fontSize: theme.font.size.sm,
          color: theme.colors.text.secondary,
        },
        itemMeta: {
          marginTop: 10,
          fontSize: theme.font.size.xs,
          color: theme.colors.text.muted,
        },
        filterRow: {
          flexDirection: 'row',
          gap: 8,
          flexWrap: 'wrap',
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
        filterPillText: {
          fontSize: 12,
          fontWeight: '800',
          color: theme.colors.text.muted,
        },
        filterPillTextActive: {
          color: theme.colors.text.primary,
        },
      }),
    [theme]
  );

  const filteredItems = useMemo(() => {
    if (filter === 'unread') return items.filter((m) => !m.readAt);
    if (filter === 'read') return items.filter((m) => Boolean(m.readAt));
    return items;
  }, [filter, items]);

  const orderedItems = useMemo(() => {
    const arr = [...filteredItems];
    arr.sort((a, b) => {
      const ta = Date.parse(a.receivedAt);
      const tb = Date.parse(b.receivedAt);
      if (Number.isFinite(ta) && Number.isFinite(tb)) return tb - ta;
      if (Number.isFinite(tb)) return 1;
      if (Number.isFinite(ta)) return -1;
      return String(b.receivedAt).localeCompare(String(a.receivedAt));
    });
    return arr;
  }, [filteredItems]);

  const unreadCount = useMemo(() => items.filter((m) => !m.readAt).length, [items]);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Mensagens</Text>
        <View style={styles.headerActionsRow}>
          <Button
            variant="secondary"
            style={styles.markAllBtn}
            disabled={unreadCount === 0 || isLoading}
            onPress={() => {
              if (unreadCount === 0) return;
              Alert.alert('Marcar tudo como lida', 'Deseja marcar todas as mensagens como lidas?', [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Marcar',
                  style: 'default',
                  onPress: () => {
                    void (async () => {
                      setIsLoading(true);
                      try {
                        await markAllInboxMessagesRead();
                        await refresh();
                      } finally {
                        setIsLoading(false);
                      }
                    })();
                  },
                },
              ]);
            }}>
            Lidas ({unreadCount})
          </Button>
          <Button
            variant="secondary"
            style={styles.clearBtn}
            disabled={items.length === 0 || isLoading}
            onPress={() => {
              if (items.length === 0) return;
              Alert.alert('Limpar mensagens', 'Deseja apagar todas as mensagens? Essa ação é permanente.', [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Apagar',
                  style: 'destructive',
                  onPress: () => {
                    void (async () => {
                      setIsLoading(true);
                      try {
                        await clearInbox();
                        await refresh();
                      } finally {
                        setIsLoading(false);
                      }
                    })();
                  },
                },
              ]);
            }}>
            Limpar
          </Button>
        </View>
      </View>

      <View style={styles.filterRow}>
        <Pressable
          style={[styles.filterPill, filter === 'all' ? styles.filterPillActive : null]}
          onPress={() => setFilter('all')}>
          <Text style={[styles.filterPillText, filter === 'all' ? styles.filterPillTextActive : null]}>Todas</Text>
        </Pressable>
        <Pressable
          style={[styles.filterPill, filter === 'unread' ? styles.filterPillActive : null]}
          onPress={() => setFilter('unread')}>
          <Text style={[styles.filterPillText, filter === 'unread' ? styles.filterPillTextActive : null]}>Não lidas</Text>
        </Pressable>
        <Pressable
          style={[styles.filterPill, filter === 'read' ? styles.filterPillActive : null]}
          onPress={() => setFilter('read')}>
          <Text style={[styles.filterPillText, filter === 'read' ? styles.filterPillTextActive : null]}>Lidas</Text>
        </Pressable>
      </View>

      {orderedItems.length === 0 ? (
        <Text style={styles.empty}>
          Nenhuma mensagem por aqui ainda.
          {filter === 'unread' ? ' Você não tem mensagens não lidas.' : ''}
        </Text>
      ) : (
        <FlatList
          data={orderedItems}
          keyExtractor={(it, idx) => (it?.id ? String(it.id) : String(idx))}
          onRefresh={refresh}
          refreshing={isLoading}
          renderItem={({ item }) => (
            <Pressable
              onLongPress={() => {
                if (!item?.id) return;
                const isUnread = !item.readAt;
                Alert.alert('Ações', item.title || 'Mensagem', [
                  {
                    text: isUnread ? 'Marcar como lida' : 'Marcar como não lida',
                    onPress: () => {
                      void (async () => {
                        setIsLoading(true);
                        try {
                          if (isUnread) await markInboxMessageRead(item.id);
                          else await markInboxMessageUnread(item.id);
                          await refresh();
                        } finally {
                          setIsLoading(false);
                        }
                      })();
                    },
                  },
                  {
                    text: 'Excluir',
                    style: 'destructive',
                    onPress: () => {
                      Alert.alert('Excluir mensagem', 'Deseja excluir esta mensagem? Essa ação é permanente.', [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Excluir',
                          style: 'destructive',
                          onPress: () => {
                            void (async () => {
                              setIsLoading(true);
                              try {
                                await deleteInboxMessage(item.id);
                                await refresh();
                              } finally {
                                setIsLoading(false);
                              }
                            })();
                          },
                        },
                      ]);
                    },
                  },
                  { text: 'Cancelar', style: 'cancel' },
                ]);
              }}
              onPress={() => {
                if (!item?.id) return;
                router.push({ pathname: '/messages/[id]' as any, params: { id: item.id } } as any);
              }}>
              <Card style={[styles.itemCard, !item.readAt ? styles.itemCardUnread : null]}>
                <View style={styles.itemHeaderRow}>
                  <View style={{ flex: 1, backgroundColor: 'transparent' }}>
                    <Text style={[styles.itemTitle, item.readAt ? styles.itemTitleRead : null]}>{item.title}</Text>
                  </View>
                  {!item.readAt ? <View style={styles.unreadDot} /> : null}
                </View>
                {item.body ? <Text style={styles.itemBody}>{item.body}</Text> : null}
                <Text style={styles.itemMeta}>
                  {(() => {
                    try {
                      const d = new Date(item.receivedAt);
                      return Number.isFinite(d.getTime()) ? d.toLocaleString('pt-BR') : item.receivedAt;
                    } catch {
                      return item.receivedAt;
                    }
                  })()}
                </Text>
              </Card>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
