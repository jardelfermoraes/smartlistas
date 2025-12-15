/**
 * Módulo de Autenticação
 * 
 * Este módulo fornece toda a infraestrutura de autenticação e autorização
 * para a aplicação, incluindo:
 * 
 * - AuthProvider: Context provider para gerenciar estado de autenticação
 * - Hooks: useAuth, usePermissions
 * - Componentes: ProtectedRoute, PermissionGate, UserMenu, LoginForm
 * - Serviços: authService para chamadas à API
 * - Tipos: User, Role, Permission, etc.
 * 
 * @example
 * // No App.tsx
 * import { AuthProvider } from '@/modules/auth';
 * 
 * function App() {
 *   return (
 *     <AuthProvider>
 *       <Routes />
 *     </AuthProvider>
 *   );
 * }
 * 
 * @example
 * // Em qualquer componente
 * import { useAuth, PermissionGate } from '@/modules/auth';
 * 
 * function MyComponent() {
 *   const { user, hasPermission } = useAuth();
 *   
 *   return (
 *     <PermissionGate permission="users.create">
 *       <button>Criar Usuário</button>
 *     </PermissionGate>
 *   );
 * }
 * 
 * @module auth
 */

// Provider
export { AuthProvider, AuthContext } from './AuthProvider';

// Hooks
export { useAuth } from './hooks/useAuth';
export { usePermissions } from './hooks/usePermissions';

// Components
export { ProtectedRoute } from './components/ProtectedRoute';
export { PermissionGate } from './components/PermissionGate';
export { UserMenu } from './components/UserMenu';
export { LoginForm } from './components/LoginForm';

// Services
export { authService } from './services/authService';

// Types
export type {
  User,
  Role,
  Permission,
  LoginCredentials,
  LoginResponse,
  TokenResponse,
  SetupData,
  SetupStatus,
  AuthState,
  AuthContextType,
} from './types';
