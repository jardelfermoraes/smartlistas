import Constants from 'expo-constants';
import { Platform } from 'react-native';

function inferDevHostFromExpo(): string | null {
  const maybeHostUri =
    (Constants.expoConfig?.hostUri as unknown as string | undefined) ||
    // Older manifests
    ((Constants as any).manifest?.debuggerHost as string | undefined) ||
    ((Constants as any).manifest2?.extra?.expoClient?.hostUri as string | undefined);

  if (!maybeHostUri) return null;
  const host = maybeHostUri.split(':')[0]?.trim();
  if (!host) return null;
  if (host === 'localhost' || host === '127.0.0.1') return null;
  return host;
}

function normalizeApiBaseUrl(input: string): string {
  const url = input.replace(/\/$/, '');

  const isLocalhost = /^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url);
  if (!isLocalhost) return url;

  // Android emulator uses 10.0.2.2. Android physical devices must use your PC LAN IP.
  if (Platform.OS === 'android') {
    const isDevice = Boolean((Constants as any).isDevice);
    const inferred = inferDevHostFromExpo();
    if (isDevice) {
      if (inferred) return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)/i, `$1${inferred}`);
      return url;
    }
    return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)/i, '$110.0.2.2');
  }

  // Web (browser) can sometimes resolve localhost to IPv6 (::1) while the dev server binds only IPv4.
  // Use 127.0.0.1 to avoid intermittent network failures.
  if (Platform.OS === 'web') {
    return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)/i, '$1127.0.0.1');
  }

  // iOS simulator can reach host via localhost; physical devices can't.
  const inferred = inferDevHostFromExpo();
  if (inferred) return url.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1)/i, `$1${inferred}`);

  return url;
}

function getApiBaseUrl(): string {
  const fromEnv = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim();
  if (fromEnv) return normalizeApiBaseUrl(fromEnv);

  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const fromExtra = typeof extra.apiBaseUrl === 'string' ? extra.apiBaseUrl.trim() : '';
  if (fromExtra) return normalizeApiBaseUrl(fromExtra);

  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
}

export const API_BASE_URL = getApiBaseUrl();

function getConnectionHint(): string | null {
  const isDevice = Boolean((Constants as any).isDevice);
  if (!isDevice) return null;
  const isLocalhost = /^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?$/i.test(API_BASE_URL);
  if (!isLocalhost) return null;
  return (
    'Você está em um celular físico. Configure a URL da API com o IP do seu PC na mesma rede (ex: http://192.168.0.10:8000) em mobile/app.json -> expo.extra.apiBaseUrl, e inicie o backend com --host 0.0.0.0.'
  );
}

async function parseErrorDetail(res: Response): Promise<string> {
  let detail = 'Erro ao comunicar com o servidor';
  try {
    const data = (await res.json()) as any;
    if (typeof data?.detail === 'string') detail = data.detail;
  } catch {
    // ignore
  }
  return detail;
}

type RequestOptions = {
  token?: string;
  headers?: Record<string, string>;
};

export async function apiGet<TResponse>(
  path: string,
  params?: Record<string, string | number | undefined>,
  options?: RequestOptions
): Promise<TResponse> {
  const qs = params
    ? new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && `${v}`.length > 0)
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : '';

  const url = qs ? `${API_BASE_URL}${path}?${qs}` : `${API_BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        ...(options?.token ? { Authorization: `Bearer ${options.token}` } : null),
        ...(options?.headers ?? null),
      },
    });
  } catch {
    const hint = getConnectionHint();
    throw new Error(
      hint ? `Falha de conexão com a API (${API_BASE_URL}). ${hint}` : `Falha de conexão com a API (${API_BASE_URL}). Verifique a URL/servidor.`
    );
  }

  if (!res.ok) {
    throw new Error(await parseErrorDetail(res));
  }

  return (await res.json()) as TResponse;
}

export async function apiPut<TResponse>(path: string, body: unknown, options?: RequestOptions): Promise<TResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.token ? { Authorization: `Bearer ${options.token}` } : null),
        ...(options?.headers ?? null),
      },
      body: JSON.stringify(body),
    });
  } catch {
    const hint = getConnectionHint();
    throw new Error(
      hint ? `Falha de conexão com a API (${API_BASE_URL}). ${hint}` : `Falha de conexão com a API (${API_BASE_URL}). Verifique a URL/servidor.`
    );
  }

  if (!res.ok) {
    throw new Error(await parseErrorDetail(res));
  }

  return (await res.json()) as TResponse;
}

export async function apiPost<TResponse>(path: string, body: unknown, options?: RequestOptions): Promise<TResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options?.token ? { Authorization: `Bearer ${options.token}` } : null),
        ...(options?.headers ?? null),
      },
      body: JSON.stringify(body),
    });
  } catch {
    const hint = getConnectionHint();
    throw new Error(
      hint ? `Falha de conexão com a API (${API_BASE_URL}). ${hint}` : `Falha de conexão com a API (${API_BASE_URL}). Verifique a URL/servidor.`
    );
  }

  if (!res.ok) {
    throw new Error(await parseErrorDetail(res));
  }

  return (await res.json()) as TResponse;
}
