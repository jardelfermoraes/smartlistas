import { FormEvent, useEffect, useMemo, useState } from 'react';

import { api } from '../api/client';

const REFERRAL_STORAGE_KEY = 'smartlistas.referral_code';
const APK_LATEST_URL = 'https://github.com/jardelfermoraes/smartlistas/releases/download/apk-latest/smartlistas-latest.apk';

export function AppSignup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [stateUf, setStateUf] = useState('');
  const [city, setCity] = useState('');
  const [radiusKm, setRadiusKm] = useState('10');
  const [referralCode, setReferralCode] = useState('');

  const [ufOptions, setUfOptions] = useState<string[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  type UfOut = { uf: string };
  type CityOut = { city: string };

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(REFERRAL_STORAGE_KEY);
      if (stored) setReferralCode(stored);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const ufs = await api.get<UfOut[]>('/app/locations/ufs');
        setUfOptions(ufs.data.map((u) => u.uf));
      } catch {
        setUfOptions([]);
      }
    })();
  }, []);

  useEffect(() => {
    const uf = stateUf.trim().toUpperCase();
    if (!uf || uf.length !== 2) {
      setCityOptions([]);
      setCity('');
      return;
    }

    const t = setTimeout(() => {
      void (async () => {
        try {
          const cities = await api.get<CityOut[]>('/app/locations/cities', {
            params: { uf, search: city.trim(), limit: 50 },
          });
          setCityOptions(cities.data.map((c) => c.city));
        } catch {
          setCityOptions([]);
        }
      })();
    }, 200);

    return () => clearTimeout(t);
  }, [stateUf, city]);

  const normalizedReferral = useMemo(() => referralCode.trim().toUpperCase(), [referralCode]);

  function normalizePhone(input: string): string {
    return input.replace(/\D/g, '').slice(0, 11);
  }

  function formatPhone(input: string): string {
    const digits = normalizePhone(input);
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

  function parseBirthDateToIso(value: string): string | null {
    const raw = value.trim();
    if (!raw) return null;

    const m1 = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m1) {
      const dd = Number(m1[1]);
      const mm = Number(m1[2]);
      const yyyy = Number(m1[3]);
      if (!dd || !mm || !yyyy) return '__invalid__';
      if (dd < 1 || dd > 31) return '__invalid__';
      if (mm < 1 || mm > 12) return '__invalid__';
      if (yyyy < 1900 || yyyy > 2100) return '__invalid__';
      return `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}T00:00:00Z`;
    }

    const m2 = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}T00:00:00Z`;

    return '__invalid__';
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const p = normalizePhone(phone);
    const uf = stateUf.trim().toUpperCase();
    const c = city.trim();
    const r = Number(radiusKm);
    const g = gender.trim();
    const parsedBirth = parseBirthDateToIso(birthDate);

    if (!p || p.length < 10) {
      setIsLoading(false);
      setError('Informe um celular válido (com DDD)');
      return;
    }
    if (!uf || uf.length !== 2) {
      setIsLoading(false);
      setError('UF deve ter 2 letras (ex: PA)');
      return;
    }
    if (!c || c.length < 2) {
      setIsLoading(false);
      setError('Informe uma cidade válida');
      return;
    }
    if (!Number.isFinite(r) || r < 1 || r > 50) {
      setIsLoading(false);
      setError('Raio deve estar entre 1 e 50 km');
      return;
    }
    if (!g) {
      setIsLoading(false);
      setError('Selecione um gênero');
      return;
    }
    if (!birthDate.trim() || parsedBirth === '__invalid__') {
      setIsLoading(false);
      setError('Data de nascimento inválida (use DD/MM/AAAA)');
      return;
    }

    try {
      await api.post('/app/register', {
        name,
        email,
        password,
        phone: p,
        birth_date: parsedBirth,
        gender: g,
        state: uf,
        city: c,
        shopping_radius_km: r,
        referral_code: normalizedReferral || null,
      });

      setSuccess(true);

      try {
        if (normalizedReferral) {
          window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
        }
      } catch {
        // ignore
      }
    } catch (err: unknown) {
      const e2 = err as { message?: string; response?: { status?: number; data?: any } };
      const status = e2.response?.status;
      const detail =
        (typeof e2.response?.data?.detail === 'string' && e2.response?.data?.detail) ||
        (typeof e2.response?.data === 'string' && e2.response?.data) ||
        e2.message ||
        'Erro ao criar conta';
      setError(status ? `${detail} (HTTP ${status})` : detail);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-600 to-green-800">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white">SmartListas</h1>
          <p className="text-green-100 mt-2">Crie sua conta e baixe o app</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {success ? (
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2 text-center">Conta criada!</h2>
              <p className="text-gray-600 text-center mb-6">Agora é só baixar e instalar o app no Android.</p>

              <a className="btn-primary w-full block text-center" href={APK_LATEST_URL}>
                Baixar APK (última versão)
              </a>

              <p className="text-xs text-gray-500 mt-4 text-center">
                Se o Android bloquear, habilite “Instalar apps desconhecidos” e tente novamente.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-gray-900 mb-6 text-center">Cadastro</h2>

              {error ? (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nome</label>
                  <input
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    placeholder="Seu nome"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="seu@email.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Senha</label>
                  <input
                    className="input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Celular (com DDD)</label>
                  <input
                    className="input"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    required
                    inputMode="tel"
                    placeholder="(99) 99999-9999"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Data de nascimento</label>
                  <input
                    className="input"
                    value={birthDate}
                    onChange={(e) => setBirthDate(formatBirthDate(e.target.value))}
                    required
                    placeholder="DD/MM/AAAA"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gênero</label>
                  <select className="input" value={gender} onChange={(e) => setGender(e.target.value)} required>
                    <option value="">Selecione</option>
                    <option value="female">Feminino</option>
                    <option value="male">Masculino</option>
                    <option value="other">Outro</option>
                    <option value="prefer_not_say">Prefiro não informar</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">UF</label>
                  <select
                    className="input"
                    value={stateUf}
                    onChange={(e) => {
                      setStateUf(e.target.value);
                      setCity('');
                    }}
                    required
                  >
                    <option value="">Selecione</option>
                    {ufOptions.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cidade</label>
                  <input
                    className="input"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Digite para buscar..."
                    disabled={!stateUf}
                    list="city-options"
                    required
                  />
                  <datalist id="city-options">
                    {cityOptions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Raio de compra (km)</label>
                  <input
                    className="input"
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(e.target.value)}
                    required
                    inputMode="numeric"
                    placeholder="10"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Código do convite (opcional)</label>
                  <input
                    className="input"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    placeholder="Ex: ABC123"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Se você veio por um convite, esse campo já deve estar preenchido.
                  </p>
                </div>

                <button
                  type="submit"
                  className="btn-primary w-full"
                  disabled={isLoading}
                >
                  {isLoading ? 'Criando...' : 'Criar conta'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-green-100 mt-6 text-sm">© 2025 SmartListas</p>
      </div>
    </div>
  );
}
