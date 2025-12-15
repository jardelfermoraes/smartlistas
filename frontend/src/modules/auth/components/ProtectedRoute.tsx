/**
 * Componente de rota protegida
 * @module auth/components
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Permissão única requerida */
  requiredPermission?: string;
  /** Lista de permissões (usuário precisa ter qualquer uma) */
  requiredPermissions?: string[];
  /** Lista de permissões (usuário precisa ter todas) */
  requiredAllPermissions?: string[];
  /** Rota de redirecionamento para não autenticados */
  loginPath?: string;
  /** Componente a exibir quando não tem permissão */
  fallback?: React.ReactNode;
}

/**
 * Componente que protege rotas que requerem autenticação
 */
export function ProtectedRoute({ 
  children, 
  requiredPermission,
  requiredPermissions,
  requiredAllPermissions,
  loginPath = '/login',
  fallback
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, hasPermission, hasAnyPermission, hasAllPermissions } = useAuth();
  const location = useLocation();

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  // Não autenticado
  if (!isAuthenticated) {
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  // Verifica permissão única
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return fallback || <AccessDenied />;
  }

  // Verifica múltiplas permissões (qualquer uma)
  if (requiredPermissions && requiredPermissions.length > 0 && !hasAnyPermission(...requiredPermissions)) {
    return fallback || <AccessDenied />;
  }

  // Verifica múltiplas permissões (todas)
  if (requiredAllPermissions && requiredAllPermissions.length > 0 && !hasAllPermissions(...requiredAllPermissions)) {
    return fallback || <AccessDenied />;
  }

  return <>{children}</>;
}

/**
 * Componente de acesso negado
 */
function AccessDenied() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Acesso Negado</h1>
        <p className="text-gray-600">Você não tem permissão para acessar esta página.</p>
      </div>
    </div>
  );
}
