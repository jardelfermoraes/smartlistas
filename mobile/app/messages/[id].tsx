import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { deleteInboxMessage, getInboxMessageById, InboxMessage, markInboxMessageRead, markInboxMessageUnread } from '@/lib/notifications';
import { useTheme } from '@/lib/theme';

export default function MessageDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const theme = useTheme();

  const [item, setItem] = useState<InboxMessage | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const safeId = typeof id === 'string' ? id : '';
    if (!safeId) return;

    setIsLoading(true);
    void (async () => {
      try {
        const found = await getInboxMessageById(safeId);
        setItem(found);
        if (found && !found.readAt) {
          await markInboxMessageRead(safeId);
          setItem({ ...found, readAt: new Date().toISOString() });
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id]);

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
        meta: {
          marginTop: 10,
          fontSize: theme.font.size.xs,
          color: theme.colors.text.muted,
        },
        body: {
          marginTop: theme.spacing.sm,
          fontSize: theme.font.size.md,
          color: theme.colors.text.secondary,
          lineHeight: 22,
        },
        actionsRow: {
          flexDirection: 'row',
          gap: 12,
          marginTop: theme.spacing.lg,
          backgroundColor: 'transparent',
        },
        actionBtn: {
          flex: 1,
          height: 42,
        },
        empty: {
          marginTop: theme.spacing.lg,
          color: theme.colors.text.muted,
          textAlign: 'center',
        },
      }),
    [theme]
  );

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Mensagem</Text>
        <Button variant="secondary" disabled={isLoading} style={{ height: 40, paddingHorizontal: 12 }} onPress={() => router.back()}>
          Voltar
        </Button>
      </View>

      {!id || typeof id !== 'string' ? (
        <Text style={styles.empty}>Mensagem inválida.</Text>
      ) : !item ? (
        <Text style={styles.empty}>{isLoading ? 'Carregando...' : 'Mensagem não encontrada.'}</Text>
      ) : (
        <Card>
          <Text style={styles.title}>{item.title}</Text>
          {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
          <Text style={styles.meta}>
            {(() => {
              try {
                const d = new Date(item.receivedAt);
                return Number.isFinite(d.getTime()) ? d.toLocaleString('pt-BR') : item.receivedAt;
              } catch {
                return item.receivedAt;
              }
            })()}
          </Text>

          <View style={styles.actionsRow}>
            <Button
              variant="secondary"
              disabled={isLoading}
              style={styles.actionBtn}
              onPress={() => {
                const safeId = typeof id === 'string' ? id : '';
                if (!safeId || !item) return;
                setIsLoading(true);
                void (async () => {
                  try {
                    if (item.readAt) {
                      await markInboxMessageUnread(safeId);
                      setItem({ ...item, readAt: null });
                    } else {
                      await markInboxMessageRead(safeId);
                      setItem({ ...item, readAt: new Date().toISOString() });
                    }
                  } finally {
                    setIsLoading(false);
                  }
                })();
              }}>
              {item.readAt ? 'Marcar não lida' : 'Marcar lida'}
            </Button>
            <Button
              variant="danger"
              disabled={isLoading}
              style={styles.actionBtn}
              onPress={() => {
                const safeId = typeof id === 'string' ? id : '';
                if (!safeId) return;
                Alert.alert('Excluir mensagem', 'Deseja excluir esta mensagem? Essa ação é permanente.', [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Excluir',
                    style: 'destructive',
                    onPress: () => {
                      setIsLoading(true);
                      void (async () => {
                        try {
                          await deleteInboxMessage(safeId);
                          router.back();
                        } finally {
                          setIsLoading(false);
                        }
                      })();
                    },
                  },
                ]);
              }}>
              Excluir
            </Button>
          </View>
        </Card>
      )}
    </Screen>
  );
}
