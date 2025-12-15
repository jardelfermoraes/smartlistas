/**
 * Hook principal de autenticação
 * @module auth/hooks
 */

import { useContext, createContext } from 'react';
import type { AuthContextType } from '../types';

// Re-export do contexto para uso interno
// O contexto real é criado no AuthProvider
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Hook para acessar o contexto de autenticação
 * @throws Error se usado fora do AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}
