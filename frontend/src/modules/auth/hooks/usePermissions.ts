/**
 * Hook para verificação de permissões
 * @module auth/hooks
 */

import { useMemo } from 'react';
import { useAuth } from './useAuth';

/**
 * Hook para verificar permissões do usuário
 */
export function usePermissions() {
  const { user } = useAuth();

  const permissions = useMemo(() => {
    return new Set(user?.permissions || []);
  }, [user?.permissions]);

  /**
   * Verifica se o usuário tem uma permissão específica
   */
  const hasPermission = (permission: string): boolean => {
    return permissions.has(permission);
  };

  /**
   * Verifica se o usuário tem qualquer uma das permissões
   */
  const hasAnyPermission = (...perms: string[]): boolean => {
    return perms.some(p => permissions.has(p));
  };

  /**
   * Verifica se o usuário tem todas as permissões
   */
  const hasAllPermissions = (...perms: string[]): boolean => {
    return perms.every(p => permissions.has(p));
  };

  /**
   * Verifica se o usuário tem permissão em um módulo
   */
  const hasModuleAccess = (module: string): boolean => {
    return Array.from(permissions).some(p => p.startsWith(`${module}.`));
  };

  /**
   * Retorna o nível do usuário
   */
  const userLevel = user?.role?.level || 0;

  /**
   * Verifica se é super admin
   */
  const isSuperAdmin = user?.role?.name === 'super_admin';

  /**
   * Verifica se é admin ou superior
   */
  const isAdmin = userLevel >= 80;

  /**
   * Verifica se é manager ou superior
   */
  const isManager = userLevel >= 50;

  return {
    permissions: Array.from(permissions),
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasModuleAccess,
    userLevel,
    isSuperAdmin,
    isAdmin,
    isManager,
  };
}
