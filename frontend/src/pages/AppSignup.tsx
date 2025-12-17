import { FormEvent, useEffect, useMemo, useState } from 'react';

import { api } from '../api/client';

const REFERRAL_STORAGE_KEY = 'smartlistas.referral_code';
const APK_LATEST_URL = 'https://github.com/jardelfermoraes/smartlistas/releases/latest/download/smartlistas-latest.apk';

export function AppSignup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(REFERRAL_STORAGE_KEY);
      if (stored) setReferralCode(stored);
    } catch {
      // ignore
    }
  }, []);

  const normalizedReferral = useMemo(() => referralCode.trim().toUpperCase(), [referralCode]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await api.post('/app/register', {
        name,
        email,
        password,
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
      const msg =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
        'Erro ao criar conta';
      setError(msg);
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
