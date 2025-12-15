/**
 * Tipos do módulo de autenticação
 * @module auth/types
 */

export interface Permission {
  id: number;
  code: string;
  name: string;
  description: string | null;
  module: string;
}

export interface Role {
  id: number;
  name: string;
  display_name: string;
  description?: string;
  level: number;
  is_system?: boolean;
  permissions?: Permission[];
}

export interface User {
  id: number;
  email: string;
  nome: string;
  telefone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  is_verified: boolean;
  role: Role;
  permissions: string[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface SetupData {
  email: string;
  password: string;
  nome: string;
}

export interface SetupStatus {
  needs_setup: boolean;
  has_roles: boolean;
  has_users: boolean;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (...permissions: string[]) => boolean;
  hasAllPermissions: (...permissions: string[]) => boolean;
}
