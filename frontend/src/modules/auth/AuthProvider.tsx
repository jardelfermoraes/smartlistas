/**
 * Provider de autenticação
 * @module auth
 */

import { useState, useEffect, useCallback, ReactNode } from 'react';
import { authService } from './services/authService';
import { AuthContext } from './hooks/useAuth';
import type { AuthContextType, User, LoginCredentials } from './types';

// Re-exporta o contexto para uso externo
export { AuthContext };

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Provider que gerencia o estado de autenticação
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Inicializa autenticação ao carregar
  useEffect(() => {
    const initAuth = async () => {
      const { user: storedUser, token } = authService.initFromStorage();

      if (storedUser && token) {
        try {
          if (authService.isAccessTokenExpired()) {
            const refreshResult = await authService.refresh();
            if (!refreshResult) {
              authService.clearAuth();
              setIsLoading(false);
              return;
            }
          }

          const currentUser = await authService.getMe();
          setUser(currentUser);
        } catch {
          // Token inválido, tenta refresh
          const refreshResult = await authService.refresh();
          if (refreshResult) {
            try {
              const currentUser = await authService.getMe();
              setUser(currentUser);
            } catch {
              authService.clearAuth();
            }
          }
        }
      }
      
      setIsLoading(false);
    };

    initAuth();
  }, []);

  /**
   * Realiza login
   */
  const login = useCallback(async (credentials: LoginCredentials) => {
    const response = await authService.login(credentials);
    setUser(response.user);
  }, []);

  /**
   * Realiza logout
   */
  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  /**
   * Verifica se tem uma permissão
   */
  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    return user.permissions.includes(permission);
  }, [user]);

  /**
   * Verifica se tem qualquer uma das permissões
   */
  const hasAnyPermission = useCallback((...permissions: string[]): boolean => {
    if (!user) return false;
    return permissions.some(p => user.permissions.includes(p));
  }, [user]);

  /**
   * Verifica se tem todas as permissões
   */
  const hasAllPermissions = useCallback((...permissions: string[]): boolean => {
    if (!user) return false;
    return permissions.every(p => user.permissions.includes(p));
  }, [user]);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
