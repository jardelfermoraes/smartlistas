import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ referral_code?: string | string[]; ref?: string | string[] }>();
  const theme = useTheme();
  const { isLoading, isAuthenticated, signUpWithEmail } = useAuth();

  const referralCode = (() => {
    const raw = params.referral_code ?? params.ref;
    const v = Array.isArray(raw) ? raw[0] : raw;
    const code = (v ?? '').trim();
    return code ? code.toUpperCase() : null;
  })();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<string>('');
  const [selectingGender, setSelectingGender] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) router.replace('/(tabs)');
  }, [isAuthenticated, isLoading, router]);

  const genderOptions: Array<{ value: string; label: string }> = [
    { value: 'female', label: 'Feminino' },
    { value: 'male', label: 'Masculino' },
    { value: 'other', label: 'Outro' },
    { value: 'prefer_not_say', label: 'Prefiro não informar' },
  ];

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
        selectField: {
          marginTop: theme.spacing.sm,
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
          borderRadius: theme.radius.md,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: theme.colors.bg.surface,
        },
        selectLabel: {
          fontSize: 12,
          fontWeight: theme.font.weight.semibold,
          color: theme.colors.text.muted,
        },
        selectValue: {
          marginTop: 6,
          fontSize: theme.font.size.md,
          fontWeight: theme.font.weight.semibold,
          color: theme.colors.text.primary,
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
        optionRow: {
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border.subtle,
        },
        optionText: {
          fontSize: theme.font.size.md,
          fontWeight: theme.font.weight.semibold,
          color: theme.colors.text.primary,
        },
      }),
    [theme]
  );

  function formatPhone(input: string): string {
    const digits = input.replace(/\D/g, '').slice(0, 11);
    if (digits.length === 0) return '';
    if (digits.length <= 2) return `(${digits}`;
    const ddd = digits.slice(0, 2);
    const rest = digits.slice(2);
    if (rest.length <= 4) return `(${ddd}) ${rest}`;
    if (rest.length <= 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  }

  function formatBirthDate(input: string): string {
    const digits = input.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  function parseBirthDate(input: string): string | null {
    const raw = input.trim();
    if (!raw) return null;
    const m1 = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}T00:00:00Z`;
    const m2 = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}T00:00:00Z`;
    return '__invalid__';
  }

  return (
    <Screen style={styles.container}>
      <Card style={styles.card}>
        <Text style={styles.brand}>SmartListas</Text>
        <Text style={styles.subtitle}>Crie sua conta</Text>

        <Input label="Nome" value={name} onChangeText={setName} placeholder="Seu nome" />

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
          placeholder="Mínimo 6 caracteres"
        />

        <Input
          label="Celular"
          value={phone}
          onChangeText={(v) => setPhone(formatPhone(v))}
          keyboardType="phone-pad"
          placeholder="(DDD) 99999-9999"
        />

        <Input
          label="Data de nascimento"
          value={birthDate}
          onChangeText={(v) => setBirthDate(formatBirthDate(v))}
          placeholder="DD/MM/AAAA ou AAAA-MM-DD"
        />

        <Pressable
          style={styles.selectField}
          onPress={() => {
            setSelectingGender(true);
          }}
        >
          <Text style={styles.selectLabel}>Gênero</Text>
          <Text style={styles.selectValue}>
            {genderOptions.find((g) => g.value === gender)?.label ?? (gender ? gender : 'Selecione')}
          </Text>
        </Pressable>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button
          disabled={isLoading}
          onPress={async () => {
            setError(null);
            const cleanName = name.trim();
            const cleanEmail = email.trim();
            if (cleanName.length < 2) {
              setError('Informe seu nome');
              return;
            }
            if (!cleanEmail.includes('@')) {
              setError('Informe um email válido');
              return;
            }
            if (password.length < 6) {
              setError('A senha deve ter no mínimo 6 caracteres');
              return;
            }

            const parsedBirth = parseBirthDate(birthDate);
            if (parsedBirth === '__invalid__') {
              setError('Data de nascimento inválida (use DD/MM/AAAA ou AAAA-MM-DD)');
              return;
            }

            try {
              await signUpWithEmail({
                name: cleanName,
                email: cleanEmail,
                password,
                phone: phone.replace(/\D/g, '') || null,
                birth_date: parsedBirth,
                gender: gender || null,
                referral_code: referralCode,
              });
              router.replace('/(tabs)');
            } catch (e) {
              const message = e instanceof Error ? e.message : 'Erro ao criar conta';
              setError(message);
            }
          }}>
          {isLoading ? 'Criando...' : 'Criar conta'}
        </Button>

        <Pressable
          disabled={isLoading}
          onPress={() => {
            router.back();
          }}
          style={({ pressed }) => [styles.linkWrap, pressed && !isLoading ? styles.linkPressed : null]}
        >
          <Text style={styles.linkText}>Já tenho conta</Text>
        </Pressable>
      </Card>

      <Modal visible={selectingGender} transparent animationType="fade" onRequestClose={() => setSelectingGender(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectingGender(false)}>
          <Pressable style={styles.modalCard} onPress={() => null}>
            <Text style={styles.modalTitle}>Selecione o gênero</Text>
            <FlatList
              data={genderOptions}
              keyExtractor={(it) => it.value}
              style={{ maxHeight: 320, marginTop: theme.spacing.sm }}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.optionRow}
                  onPress={() => {
                    setGender(item.value);
                    setSelectingGender(false);
                  }}
                >
                  <Text style={styles.optionText}>{item.label}</Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
