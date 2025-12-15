/**
 * Componente de formulário de login
 * @module auth/components
 */

import { useState, FormEvent } from 'react';
import { Eye, EyeOff, AlertCircle, LogIn } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface LoginFormProps {
  /** Callback após login bem-sucedido */
  onSuccess?: () => void;
  /** Callback em caso de erro */
  onError?: (error: string) => void;
  /** Título do formulário */
  title?: string;
  /** Subtítulo do formulário */
  subtitle?: string;
  /** Texto do botão de submit */
  submitText?: string;
  /** Classes CSS adicionais */
  className?: string;
}

/**
 * Formulário de login reutilizável
 */
export function LoginForm({
  onSuccess,
  onError,
  title = 'Entrar',
  subtitle,
  submitText = 'Entrar',
  className = ''
}: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login({ email, password });
      onSuccess?.();
    } catch (err: unknown) {
      const errorMessage = (err as { response?: { data?: { detail?: string } } })
        .response?.data?.detail || 'Erro ao fazer login';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={className}>
      {title && (
        <h2 className="text-2xl font-semibold text-gray-900 mb-2 text-center">
          {title}
        </h2>
      )}
      
      {subtitle && (
        <p className="text-gray-500 text-center mb-6">{subtitle}</p>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email */}
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-2">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            placeholder="seu@email.com"
          />
        </div>

        {/* Senha */}
        <div>
          <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-2">
            Senha
          </label>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors pr-12"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {/* Botão de Login */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <LogIn size={20} />
              {submitText}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
