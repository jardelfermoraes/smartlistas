import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { Text } from '@/components/Themed';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function HomeScreen() {
  const { user } = useAuth();
  const theme = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        title: {
          fontSize: theme.font.size.lg,
          fontWeight: theme.font.weight.bold,
          color: theme.colors.text.primary,
        },
        subtitle: {
          marginTop: theme.spacing.xs,
          color: theme.colors.text.secondary,
        },
        card: {
          marginTop: theme.spacing.md,
        },
        cardTitle: {
          fontWeight: theme.font.weight.bold,
          color: theme.colors.text.primary,
        },
        cardText: {
          marginTop: theme.spacing.xs,
          color: theme.colors.text.muted,
        },
      }),
    [theme]
  );

  return (
    <Screen>
      <Text style={styles.title}>Início</Text>
      <Text style={styles.subtitle}>Olá, {user?.name ?? 'bem-vindo'}!</Text>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Promoções</Text>
        <Text style={styles.cardText}>Em breve: ofertas e recomendações personalizadas.</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Economia</Text>
        <Text style={styles.cardText}>Em breve: indicadores de economia realizada e potencial.</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Atalhos</Text>
        <Text style={styles.cardText}>Em breve: criar lista, enviar cupom, otimizar.</Text>
      </Card>
    </Screen>
  );
}
