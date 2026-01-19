import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { apiPost } from '@/lib/api';
import { storage } from '@/lib/storage';

type PendingPurchase = {
  id: string;
  created_at: string;
  payload: unknown;
  attempts: number;
  last_error?: string | null;
};

const STORAGE_KEY = 'melhorcompra.pendingPurchases.v1';

function newId(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getClientPurchaseMeta(): {
  client_platform: string;
  client_app_version: string | null;
  client_os_version: string | null;
  client_device_model: string | null;
  client_locale: string | null;
  client_time_zone: string | null;
  client_timezone_offset_min: number;
} {
  const appVersion = (() => {
    const raw = (Constants as any)?.expoConfig?.version;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  })();

  const osVersion = (() => {
    const raw = (Device as any)?.osVersion;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  })();

  const model = (() => {
    const raw = (Device as any)?.modelName;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  })();

  const locale = (() => {
    try {
      const raw = Intl.DateTimeFormat().resolvedOptions().locale;
      return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    } catch {
      return null;
    }
  })();

  const timeZone = (() => {
    try {
      const raw = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    } catch {
      return null;
    }
  })();

  return {
    client_platform: Platform.OS,
    client_app_version: appVersion,
    client_os_version: osVersion,
    client_device_model: model,
    client_locale: locale,
    client_time_zone: timeZone,
    client_timezone_offset_min: new Date().getTimezoneOffset(),
  };
}

export async function loadPendingPurchases(): Promise<PendingPurchase[]> {
  const raw = await storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PendingPurchase[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function savePendingPurchases(items: PendingPurchase[]): Promise<void> {
  await storage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function enqueuePendingPurchase(payload: unknown, lastError?: string | null): Promise<void> {
  const items = await loadPendingPurchases();
  const next: PendingPurchase[] = [
    {
      id: newId(),
      created_at: new Date().toISOString(),
      payload,
      attempts: 0,
      last_error: lastError ?? null,
    },
    ...items,
  ].slice(0, 50);

  await savePendingPurchases(next);
}

export async function flushPendingPurchases(
  token: string,
  onRefreshToken?: (() => Promise<string | null>) | null
): Promise<{ sent: number; remaining: number }>
{
  const items = await loadPendingPurchases();
  if (!items.length) return { sent: 0, remaining: 0 };

  let sent = 0;
  const remaining: PendingPurchase[] = [];

  for (const p of items) {
    try {
      await apiPost('/app/purchases', p.payload, { token, onRefreshToken: onRefreshToken ?? undefined });
      sent += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      remaining.push({
        ...p,
        attempts: (p.attempts ?? 0) + 1,
        last_error: msg,
      });
    }
  }

  await savePendingPurchases(remaining);
  return { sent, remaining: remaining.length };
}
