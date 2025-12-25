import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { storage } from '@/lib/storage';

export type InboxMessage = {
  id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  receivedAt: string;
  readAt?: string | null;
};

export type PushPermissionInfo = {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
};

const INBOX_KEY = 'smartlistas.inbox.v1';
const LAST_PUSH_TOKEN_KEY = 'smartlistas.push_token.last.v1';
const LAST_PUSH_TOKEN_ERROR_KEY = 'smartlistas.push_token.last_error.v1';
const LAST_NOTIFICATION_DEBUG_KEY = 'smartlistas.notifications.last_debug.v1';
const LAST_INBOX_WRITE_DEBUG_KEY = 'smartlistas.inbox.last_write_debug.v1';
const LAST_INBOX_WRITE_ERROR_KEY = 'smartlistas.inbox.last_write_error.v1';

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeEncodeURIComponent(value: string): string {
  try {
    return encodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeIdForCompare(value: string): string {
  return safeEncodeURIComponent(value.trim());
}

function normalizeInboxMessage(raw: unknown): InboxMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as any;

  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : null;
  if (!id) return null;

  const title = typeof r.title === 'string' ? r.title : '';
  const body = typeof r.body === 'string' ? r.body : '';
  const receivedAt = typeof r.receivedAt === 'string' && r.receivedAt.trim() ? r.receivedAt : new Date().toISOString();
  const readAt = typeof r.readAt === 'string' && r.readAt.trim() ? r.readAt : null;
  const data = r.data && typeof r.data === 'object' ? (r.data as Record<string, unknown>) : undefined;

  return {
    id,
    title,
    body,
    data,
    receivedAt,
    readAt,
  };
}

async function readInboxRaw(): Promise<InboxMessage[]> {
  try {
    const raw = await storage.getItem(INBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((it) => normalizeInboxMessage(it))
      .filter((it): it is InboxMessage => Boolean(it));
  } catch {
    return [];
  }
}

export async function loadInbox(): Promise<InboxMessage[]> {
  return await readInboxRaw();
}

async function resolveInboxMessageId(id: string): Promise<string | null> {
  const safeId = id.trim();
  if (!safeId) return null;

  const items = await readInboxRaw();
  const targets = new Set<string>();
  targets.add(safeId);
  targets.add(safeDecodeURIComponent(safeId));
  targets.add(safeEncodeURIComponent(safeId));
  targets.add(normalizeIdForCompare(safeId));
  targets.add(normalizeIdForCompare(safeDecodeURIComponent(safeId)));

  for (const m of items) {
    const itemCandidates = [
      m.id,
      safeDecodeURIComponent(m.id),
      safeEncodeURIComponent(m.id),
      normalizeIdForCompare(m.id),
      normalizeIdForCompare(safeDecodeURIComponent(m.id)),
    ];
    if (itemCandidates.some((c) => targets.has(c))) {
      return m.id;
    }
  }

  return null;
}

export async function getInboxMessageById(id: string): Promise<InboxMessage | null> {
  const canonicalId = await resolveInboxMessageId(id);
  if (!canonicalId) return null;
  const items = await readInboxRaw();
  return items.find((m) => m.id === canonicalId) ?? null;
}

export async function markInboxMessageRead(id: string): Promise<void> {
  const safeId = await resolveInboxMessageId(id);
  if (!safeId) return;
  const items = await readInboxRaw();
  const next = items.map((m) => {
    if (m.id !== safeId) return m;
    if (m.readAt) return m;
    return { ...m, readAt: new Date().toISOString() };
  });
  await writeInboxRaw(next);
}

export async function markInboxMessageUnread(id: string): Promise<void> {
  const safeId = await resolveInboxMessageId(id);
  if (!safeId) return;
  const items = await readInboxRaw();
  const next = items.map((m) => {
    if (m.id !== safeId) return m;
    if (!m.readAt) return m;
    return { ...m, readAt: null };
  });
  await writeInboxRaw(next);
}

export async function markAllInboxMessagesRead(): Promise<void> {
  const items = await readInboxRaw();
  const now = new Date().toISOString();
  const next = items.map((m) => (m.readAt ? m : { ...m, readAt: now }));
  await writeInboxRaw(next);
}

export async function deleteInboxMessage(id: string): Promise<void> {
  const safeId = await resolveInboxMessageId(id);
  if (!safeId) return;
  const items = await readInboxRaw();
  const next = items.filter((m) => m.id !== safeId);
  await writeInboxRaw(next);
}

async function writeInboxRaw(next: InboxMessage[]): Promise<void> {
  await storage.setItem(INBOX_KEY, JSON.stringify(next));
}

export async function clearInbox(): Promise<void> {
  await writeInboxRaw([]);
}

export async function getLastExpoPushToken(): Promise<string | null> {
  try {
    return await storage.getItem(LAST_PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function getLastExpoPushTokenError(): Promise<string | null> {
  try {
    return await storage.getItem(LAST_PUSH_TOKEN_ERROR_KEY);
  } catch {
    return null;
  }
}

export async function getLastNotificationDebug(): Promise<string | null> {
  try {
    return await storage.getItem(LAST_NOTIFICATION_DEBUG_KEY);
  } catch {
    return null;
  }
}

export async function getLastInboxWriteDebug(): Promise<string | null> {
  try {
    return await storage.getItem(LAST_INBOX_WRITE_DEBUG_KEY);
  } catch {
    return null;
  }
}

export async function getLastInboxWriteError(): Promise<string | null> {
  try {
    return await storage.getItem(LAST_INBOX_WRITE_ERROR_KEY);
  } catch {
    return null;
  }
}

export function getPushDiagnostics(): {
  platform: string;
  isDevice: boolean;
  projectId: string | null;
  appOwnership: string | null;
} {
  const projectId = getProjectId();
  const appOwnership = (Constants as any)?.appOwnership ?? null;
  return {
    platform: Platform.OS,
    isDevice: Boolean(Device.isDevice),
    projectId: projectId ?? null,
    appOwnership: appOwnership ? String(appOwnership) : null,
  };
}

export async function getPushPermissionInfo(): Promise<PushPermissionInfo> {
  if (Platform.OS === 'web') {
    return { status: 'unavailable', granted: false, canAskAgain: false };
  }

  try {
    const perms = await Notifications.getPermissionsAsync();
    return {
      status: String((perms as any).status ?? 'unknown'),
      granted: Boolean((perms as any).granted ?? false),
      canAskAgain: Boolean((perms as any).canAskAgain ?? false),
    };
  } catch {
    return { status: 'error', granted: false, canAskAgain: false };
  }
}

export async function requestPushPermissions(): Promise<PushPermissionInfo> {
  if (Platform.OS === 'web') {
    return { status: 'unavailable', granted: false, canAskAgain: false };
  }

  try {
    const perms = await Notifications.requestPermissionsAsync();
    return {
      status: String((perms as any).status ?? 'unknown'),
      granted: Boolean((perms as any).granted ?? false),
      canAskAgain: Boolean((perms as any).canAskAgain ?? false),
    };
  } catch {
    return { status: 'error', granted: false, canAskAgain: false };
  }
}

function getProjectId(): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as any;
  const easConfigProjectId = (Constants as any)?.easConfig?.projectId;
  const expoConfigProjectId = extra?.eas?.projectId;
  return expoConfigProjectId ?? easConfigProjectId;
}

function getIdFromNotification(n: Notifications.Notification): string {
  return (n.request?.identifier as string | undefined) ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function addInboxMessageFromNotification(notification: Notifications.Notification): Promise<void> {
  const content = notification.request?.content;
  const title = (content?.title ?? '').trim();
  const body = (content?.body ?? '').trim();

  try {
    const debug = {
      id: getIdFromNotification(notification),
      title,
      body,
      dataKeys: content?.data && typeof content.data === 'object' ? Object.keys(content.data as any) : [],
      capturedAt: new Date().toISOString(),
    };
    await storage.setItem(LAST_NOTIFICATION_DEBUG_KEY, JSON.stringify(debug));
  } catch {}

  if (!title && !body) return;

  const id = getIdFromNotification(notification);
  const data = (content?.data ?? undefined) as any;

  const prev = await readInboxRaw();
  if (prev.some((m) => m.id === id)) return;

  const msg: InboxMessage = {
    id,
    title: title || 'Notificação',
    body: body || '',
    data: data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined,
    receivedAt: new Date().toISOString(),
    readAt: null,
  };

  try {
    await writeInboxRaw([msg, ...prev].slice(0, 200));
    try {
      await storage.setItem(
        LAST_INBOX_WRITE_DEBUG_KEY,
        JSON.stringify({ id: msg.id, title: msg.title, receivedAt: msg.receivedAt, count: prev.length + 1 })
      );
      await storage.removeItem(LAST_INBOX_WRITE_ERROR_KEY);
    } catch {}
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      await storage.setItem(LAST_INBOX_WRITE_ERROR_KEY, message);
    } catch {}
  }
}

export function startNotificationInboxListeners(): () => void {
  if (Platform.OS === 'web') {
    return () => {};
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  void (async () => {
    try {
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      if (lastResponse?.notification) {
        await addInboxMessageFromNotification(lastResponse.notification);
      }
    } catch {}
  })();

  const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
    void addInboxMessageFromNotification(notification);
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    void addInboxMessageFromNotification(response.notification);
  });

  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    await storage.removeItem(LAST_PUSH_TOKEN_ERROR_KEY);
  } catch {
    // ignore
  }

  if (!Device.isDevice) {
    try {
      await storage.setItem(LAST_PUSH_TOKEN_ERROR_KEY, 'push_token_unavailable: not a physical device');
    } catch {
      // ignore
    }
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const projectId = getProjectId();
  if (!projectId) {
    try {
      await storage.setItem(LAST_PUSH_TOKEN_ERROR_KEY, 'push_token_error: missing projectId');
    } catch {
      // ignore
    }
    return null;
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    try {
      await storage.setItem(LAST_PUSH_TOKEN_KEY, token.data);
    } catch {
      // ignore
    }
    return token.data;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    try {
      await storage.setItem(LAST_PUSH_TOKEN_ERROR_KEY, `push_token_error: ${message}`);
    } catch {
      // ignore
    }
    return null;
  }
}
