import { useCallback, useMemo, useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/lib/auth';
import { loadShoppingLists, ShoppingListDraft } from '@/lib/shoppingLists';
import { useTheme } from '@/lib/theme';

export default function HomeScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const [lists, setLists] = useState<ShoppingListDraft[]>([]);

  const refreshLists = useCallback(async () => {
    const data = await loadShoppingLists();
    setLists(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshLists();
    }, [refreshLists])
  );

  const firstName = useMemo(() => {
    const name = (user?.name ?? '').trim();
    if (!name) return '';
    return name.split(' ')[0] ?? name;
  }, [user?.name]);

  const totals = useMemo(() => {
    const totalLists = lists.length;
    const optimized = lists.filter(
      (l) => (l.status ?? 'draft') === 'optimized' || Boolean((l as any).optimization?.allocations?.length)
    ).length;
    const inProgress = lists.filter((l) => (l.status ?? 'draft') === 'in_progress').length;
    return { totalLists, optimized, inProgress };
  }, [lists]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          marginBottom: theme.spacing.md,
        },
        greeting: {
          fontSize: theme.font.size.xl,
          fontWeight: theme.font.weight.extrabold,
          color: theme.colors.text.primary,
        },
        subtitle: {
          marginTop: 6,
          color: theme.colors.text.secondary,
          fontSize: theme.font.size.sm,
        },
        kpisCard: {
          marginTop: theme.spacing.md,
          paddingVertical: theme.spacing.md,
        },
        kpisRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          backgroundColor: 'transparent',
        },
        kpi: {
          flex: 1,
          backgroundColor: theme.colors.bg.surfaceAlt,
          borderRadius: theme.radius.md,
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
        },
        kpiTop: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'transparent',
        },
        kpiLabel: {
          fontSize: 12,
          fontWeight: theme.font.weight.bold,
          color: theme.colors.text.muted,
        },
        kpiValue: {
          marginTop: 6,
          fontSize: 22,
          fontWeight: theme.font.weight.extrabold,
          color: theme.colors.text.primary,
        },
        primaryCta: {
          marginTop: theme.spacing.md,
        },
        sectionTitle: {
          marginTop: theme.spacing.xl,
          marginBottom: theme.spacing.sm,
          fontSize: theme.font.size.md,
          fontWeight: theme.font.weight.bold,
          color: theme.colors.text.primary,
        },
        grid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
        },
        tile: {
          width: '48%',
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
          backgroundColor: theme.colors.bg.surface,
          paddingHorizontal: 14,
          paddingVertical: 14,
        },
        tileTop: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'transparent',
        },
        tileTitle: {
          marginTop: 10,
          fontWeight: theme.font.weight.bold,
          color: theme.colors.text.primary,
          fontSize: theme.font.size.sm,
        },
        tileSubtitle: {
          marginTop: 6,
          color: theme.colors.text.muted,
          fontSize: 12,
        },
        subtleCard: {
          marginTop: theme.spacing.md,
        },
        subtleTitleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          backgroundColor: 'transparent',
        },
        subtleLeft: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: 'transparent',
        },
        subtleTitle: {
          fontWeight: theme.font.weight.bold,
          color: theme.colors.text.primary,
        },
        subtlePill: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: theme.colors.bg.surfaceAlt,
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
        },
        subtlePillText: {
          fontSize: 11,
          fontWeight: theme.font.weight.bold,
          color: theme.colors.text.muted,
        },
        subtleText: {
          marginTop: theme.spacing.xs,
          color: theme.colors.text.muted,
        },
      }),
    [theme]
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.greeting}>Olá{firstName ? `, ${firstName}` : ''}!</Text>
        <Text style={styles.subtitle}>Acompanhe suas listas e economias em um só lugar.</Text>
      </View>

      <Card style={styles.kpisCard}>
        <View style={styles.kpisRow}>
          <View style={styles.kpi}>
            <View style={styles.kpiTop}>
              <Text style={styles.kpiLabel}>Listas</Text>
              <FontAwesome name="shopping-cart" size={16} color={theme.colors.text.muted} />
            </View>
            <Text style={styles.kpiValue}>{totals.totalLists}</Text>
          </View>

          <View style={styles.kpi}>
            <View style={styles.kpiTop}>
              <Text style={styles.kpiLabel}>Otimizadas</Text>
              <FontAwesome name="magic" size={16} color={theme.colors.text.muted} />
            </View>
            <Text style={styles.kpiValue}>{totals.optimized}</Text>
          </View>

          <View style={styles.kpi}>
            <View style={styles.kpiTop}>
              <Text style={styles.kpiLabel}>Em compra</Text>
              <FontAwesome name="check-circle" size={16} color={theme.colors.text.muted} />
            </View>
            <Text style={styles.kpiValue}>{totals.inProgress}</Text>
          </View>
        </View>
      </Card>

      <Button style={styles.primaryCta} variant="primary" onPress={() => router.push('/lists')}>
        Ver minhas listas
      </Button>

      <Text style={styles.sectionTitle}>Atalhos</Text>
      <View style={styles.grid}>
        <Pressable style={styles.tile} onPress={() => router.push('/lists')}>
          <View style={styles.tileTop}>
            <FontAwesome name="shopping-cart" size={18} color={theme.colors.brand.primary} />
            <FontAwesome name="chevron-right" size={14} color={theme.colors.text.muted} />
          </View>
          <Text style={styles.tileTitle}>Listas</Text>
          <Text style={styles.tileSubtitle}>Criar, otimizar e comprar</Text>
        </Pressable>

        <Pressable style={styles.tile} onPress={() => router.push('/coupons')}>
          <View style={styles.tileTop}>
            <FontAwesome name="qrcode" size={18} color={theme.colors.brand.primary} />
            <FontAwesome name="chevron-right" size={14} color={theme.colors.text.muted} />
          </View>
          <Text style={styles.tileTitle}>Enviar cupom</Text>
          <Text style={styles.tileSubtitle}>Escanear NFC-e / QR Code</Text>
        </Pressable>

        <Pressable style={styles.tile} onPress={() => router.push('/messages')}>
          <View style={styles.tileTop}>
            <FontAwesome name="bell" size={18} color={theme.colors.brand.primary} />
            <FontAwesome name="chevron-right" size={14} color={theme.colors.text.muted} />
          </View>
          <Text style={styles.tileTitle}>Mensagens</Text>
          <Text style={styles.tileSubtitle}>Avisos e atualizações</Text>
        </Pressable>

        <Pressable style={styles.tile} onPress={() => router.push('/profile')}>
          <View style={styles.tileTop}>
            <FontAwesome name="user" size={18} color={theme.colors.brand.primary} />
            <FontAwesome name="chevron-right" size={14} color={theme.colors.text.muted} />
          </View>
          <Text style={styles.tileTitle}>Perfil</Text>
          <Text style={styles.tileSubtitle}>Cadastro e preferências</Text>
        </Pressable>
      </View>

      <Card style={styles.subtleCard}>
        <View style={styles.subtleTitleRow}>
          <View style={styles.subtleLeft}>
            <FontAwesome name="rocket" size={16} color={theme.colors.brand.primary} />
            <Text style={styles.subtleTitle}>Novidades</Text>
          </View>
          <View style={styles.subtlePill}>
            <Text style={styles.subtlePillText}>EM BREVE</Text>
          </View>
        </View>
        <Text style={styles.subtleText}>Promoções personalizadas e indicadores de economia na tela inicial.</Text>
      </Card>
    </Screen>
  );
}
