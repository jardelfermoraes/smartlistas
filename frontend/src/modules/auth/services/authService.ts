/**
 * Serviço de autenticação - API calls
 * @module auth/services
 */

import { api } from '../../../api/client';
import type { 
  LoginCredentials, 
  LoginResponse, 
  TokenResponse, 
  User, 
  SetupData, 
  SetupStatus,
  Role,
  Permission
} from '../types';

// Storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'melhorcompra_access_token',
  REFRESH_TOKEN: 'melhorcompra_refresh_token',
  USER: 'melhorcompra_user',
} as const;

/**
 * Serviço de autenticação
 */
export const authService = {
  /**
   * Realiza login
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/auth/login', credentials);
    const data = response.data;
    
    // Salva tokens e usuário
    this.setTokens(data.access_token, data.refresh_token);
    this.setUser(data.user);
    
    // Configura header de autorização
    api.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`;
    
    return data;
  },

  /**
   * Realiza logout
   */
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignora erros no logout
    }
    this.clearAuth();
  },

  /**
   * Renova tokens
   */
  async refresh(): Promise<TokenResponse | null> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await api.post<TokenResponse>('/auth/refresh', {
        refresh_token: refreshToken
      });
      
      const data = response.data;
      this.setTokens(data.access_token, data.refresh_token);
      api.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`;
      
      return data;
    } catch {
      this.clearAuth();
      return null;
    }
  },

  /**
   * Busca dados do usuário atual
   */
  async getMe(): Promise<User> {
    const response = await api.get<User>('/auth/me');
    this.setUser(response.data);
    return response.data;
  },

  /**
   * Verifica status de setup
   */
  async getSetupStatus(): Promise<SetupStatus> {
    const response = await api.get<SetupStatus>('/auth/setup/status');
    return response.data;
  },

  /**
   * Realiza setup inicial
   */
  async setup(data: SetupData): Promise<void> {
    await api.post('/auth/setup', data);
  },

  /**
   * Lista usuários
   */
  async listUsers(): Promise<User[]> {
    const response = await api.get<User[]>('/auth/users');
    return response.data;
  },

  /**
   * Cria usuário
   */
  async createUser(data: {
    email: string;
    password: string;
    nome: string;
    telefone?: string;
    role_id: number;
  }): Promise<User> {
    const response = await api.post<User>('/auth/users', data);
    return response.data;
  },

  /**
   * Atualiza usuário
   */
  async updateUser(id: number, data: {
    nome?: string;
    telefone?: string;
    is_active?: boolean;
    role_id?: number;
  }): Promise<User> {
    const response = await api.put<User>(`/auth/users/${id}`, data);
    return response.data;
  },

  /**
   * Deleta usuário
   */
  async deleteUser(id: number): Promise<void> {
    await api.delete(`/auth/users/${id}`);
  },

  /**
   * Lista roles
   */
  async listRoles(): Promise<Role[]> {
    const response = await api.get<Role[]>('/auth/roles');
    return response.data;
  },

  /**
   * Lista roles com permissões
   */
  async listRolesFull(): Promise<Role[]> {
    const response = await api.get<Role[]>('/auth/roles/full');
    return response.data;
  },

  /**
   * Lista permissões
   */
  async listPermissions(): Promise<Permission[]> {
    const response = await api.get<Permission[]>('/auth/permissions');
    return response.data;
  },

  /**
   * Atualiza permissões de uma role
   */
  async updateRolePermissions(roleId: number, permissionIds: number[]): Promise<void> {
    await api.put(`/auth/roles/${roleId}/permissions`, { permission_ids: permissionIds });
  },

  // === Storage helpers ===

  setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
  },

  getAccessToken(): string | null {
    return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  },

  getRefreshToken(): string | null {
    return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  },

  setUser(user: User): void {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  },

  getStoredUser(): User | null {
    const stored = localStorage.getItem(STORAGE_KEYS.USER);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  },

  clearAuth(): void {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    delete api.defaults.headers.common['Authorization'];
  },

  /**
   * Inicializa autenticação a partir do storage
   */
  initFromStorage(): { user: User | null; token: string | null } {
    const token = this.getAccessToken();
    const user = this.getStoredUser();
    
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    
    return { user, token };
  }
};

// Interceptor para refresh automático
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const result = await authService.refresh();
      if (result) {
        originalRequest.headers['Authorization'] = `Bearer ${result.access_token}`;
        return api(originalRequest);
      } else {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);
