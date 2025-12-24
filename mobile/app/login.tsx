import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { isLoading, isAuthenticated, signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          alignItems: 'center',
          justifyContent: 'center',
        },
        card: {
          width: '100%',
          maxWidth: 420,
          padding: theme.spacing.xl,
        },
        brand: {
          fontSize: theme.font.size.xl,
          fontWeight: theme.font.weight.extrabold,
          color: theme.colors.brand.primary,
        },
        subtitle: {
          marginTop: theme.spacing.xs,
          marginBottom: theme.spacing.md,
          color: theme.colors.text.secondary,
        },
        errorText: {
          marginTop: theme.spacing.sm,
          color: theme.colors.danger.text,
          fontSize: theme.font.size.xs,
        },
        footer: {
          marginTop: theme.spacing.md,
          textAlign: 'center',
          color: theme.colors.text.muted,
          fontSize: theme.font.size.xs,
        },
        linkWrap: {
          marginTop: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
          alignItems: 'center',
        },
        linkPressed: {
          opacity: 0.8,
        },
        linkText: {
          color: theme.colors.text.secondary,
          fontSize: theme.font.size.sm,
          fontWeight: theme.font.weight.semibold,
        },
      }),
    [theme]
  );

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) router.replace('/(tabs)');
  }, [isAuthenticated, isLoading, router]);

  return (
    <Screen style={styles.container}>
      <Card style={styles.card}>
        <Text style={styles.brand}>SmartListas</Text>
        <Text style={styles.subtitle}>Acesse sua conta</Text>

        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="seuemail@exemplo.com"
        />

        <Input
          label="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Sua senha"
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button
          disabled={isLoading}
          onPress={async () => {
            setError(null);
            try {
              await signInWithEmail(email.trim(), password);
              router.replace('/(tabs)');
            } catch (e) {
              const message = e instanceof Error ? e.message : 'Erro ao entrar';
              setError(message);
            }
          }}>
          {isLoading ? 'Entrando...' : 'Entrar'}
        </Button>

        <Pressable
          disabled={isLoading}
          onPress={() => router.push('/signup')}
          style={({ pressed }) => [styles.linkWrap, pressed && !isLoading ? styles.linkPressed : null]}
        >
          <Text style={styles.linkText}>Criar conta</Text>
        </Pressable>

        <Text style={styles.footer}>Sua lista, mais inteligente.</Text>
      </Card>
    </Screen>
  );
}
