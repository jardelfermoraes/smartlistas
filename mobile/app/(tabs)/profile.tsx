import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/lib/auth';
import { apiGet } from '@/lib/api';
import { useRouter } from 'expo-router';
import { theme } from '@/lib/theme';

type UfOut = { uf: string };
type CityOut = { city: string };

export default function ProfileScreen() {
  const { user, signOut, updateProfile, isLoading } = useAuth();
  const router = useRouter();

  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<string>('');
  const [stateUf, setStateUf] = useState('');
  const [city, setCity] = useState('');
  const [radiusKm, setRadiusKm] = useState('10');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selecting, setSelecting] = useState<'uf' | 'city' | 'gender' | null>(null);
  const [ufOptions, setUfOptions] = useState<string[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [citySearch, setCitySearch] = useState('');

  const genderOptions: Array<{ value: string; label: string }> = [
    { value: 'female', label: 'Feminino' },
    { value: 'male', label: 'Masculino' },
    { value: 'other', label: 'Outro' },
    { value: 'prefer_not_say', label: 'Prefiro não informar' },
  ];

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

  function formatBirthDateForInput(value?: string | null): string {
    if (!value) return '';
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy}`;
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

  useEffect(() => {
    setPhone(user?.phone ?? '');
    setBirthDate(formatBirthDateForInput(user?.birth_date));
    setGender(user?.gender ?? '');
    setStateUf((user?.state ?? '').toUpperCase());
    setCity(user?.city ?? '');
    setRadiusKm(String(user?.shopping_radius_km ?? 10));
  }, [user?.phone, user?.birth_date, user?.gender, user?.state, user?.city, user?.shopping_radius_km]);

  useEffect(() => {
    void (async () => {
      try {
        const ufs = await apiGet<UfOut[]>('/app/locations/ufs');
        setUfOptions(ufs.map((u) => u.uf));
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (selecting !== 'city') return;
    const uf = stateUf.trim().toUpperCase();
    if (!uf || uf.length !== 2) {
      setCityOptions([]);
      return;
    }

    const t = setTimeout(() => {
      void (async () => {
        try {
          const cities = await apiGet<CityOut[]>('/app/locations/cities', { uf, search: citySearch, limit: 50 });
          setCityOptions(cities.map((c) => c.city));
        } catch {
          setCityOptions([]);
        }
      })();
    }, 200);

    return () => clearTimeout(t);
  }, [selecting, stateUf, citySearch]);

  async function handleSave() {
    setError(null);
    setSuccess(null);

    const uf = stateUf.trim().toUpperCase();
    const c = city.trim();
    const r = Number(radiusKm);
    const p = phone.replace(/\D/g, '');
    const parsedBirth = parseBirthDate(birthDate);

    if (uf && uf.length !== 2) {
      setError('UF deve ter 2 letras (ex: PA)');
      return;
    }
    if (c && c.length < 2) {
      setError('Cidade inválida');
      return;
    }
    if (!Number.isFinite(r) || r < 1 || r > 50) {
      setError('Raio deve estar entre 1 e 50 km');
      return;
    }

    if (parsedBirth === '__invalid__') {
      setError('Data de nascimento inválida (use DD/MM/AAAA ou AAAA-MM-DD)');
      return;
    }

    try {
      await updateProfile({
        phone: p || null,
        birth_date: parsedBirth,
        gender: gender || null,
        state: uf || null,
        city: c || null,
        shopping_radius_km: r,
      });
      setSuccess('Perfil atualizado');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Perfil</Text>
      <Card style={styles.card}>
        <Text style={styles.lineLabel}>Nome</Text>
        <Text style={styles.lineValue}>{user?.name ?? '-'}</Text>

        <Text style={styles.lineLabel}>Email</Text>
        <Text style={styles.lineValue}>{user?.email ?? '-'}</Text>

        <Text style={styles.sectionTitle}>Dados pessoais</Text>

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
          placeholder="DD/MM/AAAA"
        />

        <Pressable
          style={styles.selectField}
          onPress={() => {
            setSelecting('gender');
          }}>
          <Text style={styles.selectLabel}>Gênero</Text>
          <Text style={styles.selectValue}>
            {genderOptions.find((g) => g.value === gender)?.label ?? (gender ? gender : 'Selecione')}
          </Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Localização</Text>

        <Pressable
          style={styles.selectField}
          onPress={() => {
            setSelecting('uf');
          }}>
          <Text style={styles.selectLabel}>UF</Text>
          <Text style={styles.selectValue}>{stateUf || 'Selecione'}</Text>
        </Pressable>

        <Pressable
          style={styles.selectField}
          onPress={() => {
            setCitySearch('');
            setSelecting('city');
          }}>
          <Text style={styles.selectLabel}>Cidade</Text>
          <Text style={styles.selectValue}>{city || 'Selecione'}</Text>
        </Pressable>

        <Input label="Raio de compra (km)" value={radiusKm} onChangeText={setRadiusKm} keyboardType="numeric" placeholder="10" />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}

        <Button style={styles.saveButton} onPress={() => void handleSave()} disabled={isLoading}>
          {isLoading ? 'Salvando...' : 'Salvar perfil'}
        </Button>

        <Button
          variant="danger"
          style={styles.logoutButton}
          onPress={() => {
            signOut();
            router.replace('/login');
          }}>
          Sair
        </Button>
      </Card>

      <Modal visible={selecting !== null} transparent animationType="fade" onRequestClose={() => setSelecting(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelecting(null)}>
          <Pressable style={styles.modalCard} onPress={() => null}>
            <Text style={styles.modalTitle}>
              {selecting === 'uf' ? 'Selecione a UF' : selecting === 'city' ? 'Selecione a cidade' : 'Selecione o gênero'}
            </Text>

            {selecting === 'city' ? (
              <Input label="Buscar" value={citySearch} onChangeText={setCitySearch} placeholder="Digite para filtrar..." />
            ) : null}

            <FlatList
              data={
                selecting === 'uf'
                  ? ufOptions
                  : selecting === 'city'
                    ? cityOptions
                    : genderOptions.map((g) => g.value)
              }
              keyExtractor={(it) => it}
              style={{ maxHeight: 360, marginTop: theme.spacing.sm }}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.optionRow}
                  onPress={() => {
                    if (selecting === 'uf') {
                      setStateUf(item);
                      setCity('');
                    } else if (selecting === 'city') {
                      setCity(item);
                    } else {
                      setGender(item);
                    }
                    setSelecting(null);
                  }}>
                  <Text style={styles.optionText}>
                    {selecting === 'gender' ? (genderOptions.find((g) => g.value === item)?.label ?? item) : item}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.emptyOptions}>Nenhuma opção.</Text>}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: theme.font.size.lg,
    fontWeight: theme.font.weight.bold,
    color: theme.colors.text.primary,
  },
  card: {
    marginTop: theme.spacing.md,
  },
  lineLabel: {
    marginTop: theme.spacing.sm,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.text.muted,
  },
  lineValue: {
    marginTop: theme.spacing.xs,
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.semibold,
    color: theme.colors.text.primary,
  },
  logoutButton: {
    marginTop: theme.spacing.lg,
  },
  sectionTitle: {
    marginTop: theme.spacing.lg,
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.bold,
    color: theme.colors.text.primary,
  },
  saveButton: {
    marginTop: theme.spacing.md,
  },
  errorText: {
    marginTop: theme.spacing.sm,
    color: theme.colors.danger.text,
    fontSize: theme.font.size.xs,
  },
  successText: {
    marginTop: theme.spacing.sm,
    color: theme.colors.brand.primaryDark,
    fontSize: theme.font.size.xs,
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
  emptyOptions: {
    marginTop: theme.spacing.md,
    textAlign: 'center',
    color: theme.colors.text.muted,
  },
});
