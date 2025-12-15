/**
 * Componente para controle de visibilidade baseado em permissões
 * @module auth/components
 */

import { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';

interface PermissionGateProps {
  children: ReactNode;
  /** Permissão única requerida */
  permission?: string;
  /** Lista de permissões (usuário precisa ter qualquer uma) */
  anyOf?: string[];
  /** Lista de permissões (usuário precisa ter todas) */
  allOf?: string[];
  /** Conteúdo a exibir quando não tem permissão */
  fallback?: ReactNode;
}

/**
 * Componente que controla visibilidade de elementos baseado em permissões
 * 
 * @example
 * // Permissão única
 * <PermissionGate permission="users.create">
 *   <button>Criar Usuário</button>
 * </PermissionGate>
 * 
 * @example
 * // Qualquer uma das permissões
 * <PermissionGate anyOf={["users.edit", "users.delete"]}>
 *   <ActionsMenu />
 * </PermissionGate>
 * 
 * @example
 * // Todas as permissões
 * <PermissionGate allOf={["reports.view", "reports.export"]}>
 *   <ExportButton />
 * </PermissionGate>
 */
export function PermissionGate({ 
  children, 
  permission,
  anyOf,
  allOf,
  fallback = null 
}: PermissionGateProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = useAuth();

  // Verifica permissão única
  if (permission && !hasPermission(permission)) {
    return <>{fallback}</>;
  }

  // Verifica múltiplas permissões (qualquer uma)
  if (anyOf && anyOf.length > 0 && !hasAnyPermission(...anyOf)) {
    return <>{fallback}</>;
  }

  // Verifica múltiplas permissões (todas)
  if (allOf && allOf.length > 0 && !hasAllPermissions(...allOf)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
