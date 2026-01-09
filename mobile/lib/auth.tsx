import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { apiPost, apiPut } from '@/lib/api';
import { registerForPushNotificationsAsync } from '@/lib/notifications';
import { storage } from '@/lib/storage';

export type AppUser = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  state?: string | null;
  city?: string | null;
  shopping_radius_km: number;
  avatar_url?: string | null;
  is_verified: boolean;
  notification_enabled: boolean;
  referral_code?: string | null;
  created_at: string;
};

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer' | string;
};

type LoginResponse = AuthTokens & { user: AppUser };

type AuthContextValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  tokens: AuthTokens | null;
  user: AppUser | null;
  signInWithEmail(email: string, password: string): Promise<void>;
  signUpWithEmail(
    data: Pick<AppUser, 'name' | 'email'> & {
      password: string;
      phone?: string | null;
      birth_date?: string | null;
      gender?: string | null;
      referral_code?: string | null;
    }
  ): Promise<void>;
  updateProfile(
    data: Partial<Pick<AppUser, 'name' | 'phone' | 'birth_date' | 'gender' | 'state' | 'city' | 'shopping_radius_km'>>
  ): Promise<void>;
  refreshAccessToken(): Promise<string | null>;
  signOut(): void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKENS_KEY = 'melhorcompra.auth.tokens.v1';
const USER_KEY = 'melhorcompra.auth.user.v1';
const PUSH_TOKEN_SENT_KEY = 'smartlistas.push_token.sent.v1';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null);
  const pushSyncInFlightRef = useRef<Promise<void> | null>(null);

  function clearSession() {
    setTokens(null);
    setUser(null);
    void storage.removeItem(TOKENS_KEY);
    void storage.removeItem(USER_KEY);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rawTokens = await storage.getItem(TOKENS_KEY);
        const rawUser = await storage.getItem(USER_KEY);
        if (cancelled) return;

        if (rawTokens) {
          try {
            const parsed = JSON.parse(rawTokens) as AuthTokens;
            if (parsed?.access_token && parsed?.refresh_token) setTokens(parsed);
          } catch {
            await storage.removeItem(TOKENS_KEY);
          }
        }

        if (rawUser) {
          try {
            const parsed = JSON.parse(rawUser) as AppUser;
            if (parsed?.id && parsed?.email) setUser(parsed);
          } catch {
            await storage.removeItem(USER_KEY);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!tokens?.access_token || !user?.id) return;
    if (pushSyncInFlightRef.current) return;

    pushSyncInFlightRef.current = (async () => {
      try {
        const expoPushToken = await registerForPushNotificationsAsync();
        if (!expoPushToken || cancelled) return;

        const lastSent = await storage.getItem(PUSH_TOKEN_SENT_KEY);
        if (lastSent === expoPushToken) return;

        try {
          await apiPost(
            '/app/me/push-token',
            {
              expo_push_token: expoPushToken,
              provider: 'expo',
            },
            { token: tokens.access_token }
          );
          await storage.setItem(PUSH_TOKEN_SENT_KEY, expoPushToken);
        } catch {
          // tolerate missing endpoint / backend not ready
        }
      } finally {
        pushSyncInFlightRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tokens?.access_token, user?.id]);

  const value = useMemo<AuthContextValue>(() => {
    const refreshAccessTokenImpl = async (): Promise<string | null> => {
      if (!tokens?.refresh_token) return null;
      if (refreshInFlightRef.current) return await refreshInFlightRef.current;

      refreshInFlightRef.current = (async () => {
        try {
          const data = await apiPost<LoginResponse>('/app/refresh', {
            refresh_token: tokens.refresh_token,
          });
          const nextTokens: AuthTokens = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            token_type: data.token_type,
          };
          setTokens(nextTokens);
          setUser(data.user);
          await storage.setItem(TOKENS_KEY, JSON.stringify(nextTokens));
          await storage.setItem(USER_KEY, JSON.stringify(data.user));
          return nextTokens.access_token;
        } catch {
          clearSession();
          return null;
        } finally {
          refreshInFlightRef.current = null;
        }
      })();

      return await refreshInFlightRef.current;
    };

    return {
      isLoading,
      isAuthenticated: Boolean(tokens?.access_token),
      tokens,
      user,
      async refreshAccessToken() {
        return await refreshAccessTokenImpl();
      },
      async signInWithEmail(email: string, password: string) {
        setIsLoading(true);
        try {
          const data = await apiPost<LoginResponse>('/app/login', {
            email,
            password,
          });
          const nextTokens: AuthTokens = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            token_type: data.token_type,
          };
          setTokens(nextTokens);
          setUser(data.user);
          await storage.setItem(TOKENS_KEY, JSON.stringify(nextTokens));
          await storage.setItem(USER_KEY, JSON.stringify(data.user));
        } finally {
          setIsLoading(false);
        }
      },
      async signUpWithEmail(dataIn) {
        setIsLoading(true);
        try {
          const data = await apiPost<LoginResponse>('/app/register', {
            name: dataIn.name,
            email: dataIn.email,
            password: dataIn.password,
            phone: dataIn.phone ?? null,
            birth_date: dataIn.birth_date ?? null,
            gender: dataIn.gender ?? null,
            referral_code: dataIn.referral_code ?? null,
          });
          const nextTokens: AuthTokens = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            token_type: data.token_type,
          };
          setTokens(nextTokens);
          setUser(data.user);
          await storage.setItem(TOKENS_KEY, JSON.stringify(nextTokens));
          await storage.setItem(USER_KEY, JSON.stringify(data.user));
        } finally {
          setIsLoading(false);
        }
      },
      async updateProfile(data) {
        if (!tokens?.access_token) throw new Error('Você precisa estar logado');
        setIsLoading(true);
        try {
          const updated = await apiPut<AppUser>('/app/me', data, {
            token: tokens.access_token,
            onRefreshToken: refreshAccessTokenImpl,
          });
          setUser(updated);
          await storage.setItem(USER_KEY, JSON.stringify(updated));
        } finally {
          setIsLoading(false);
        }
      },
      signOut() {
        clearSession();
      },
    };
  }, [isLoading, tokens, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
