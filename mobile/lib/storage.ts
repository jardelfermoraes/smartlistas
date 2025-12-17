export type StorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

import { Platform } from 'react-native';

let asyncStorage: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
} | null = null;

if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    asyncStorage = require('@react-native-async-storage/async-storage').default;
  } catch {
    asyncStorage = null;
  }
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export const storage: StorageLike = {
  async getItem(key: string) {
    if (asyncStorage) return asyncStorage.getItem(key);
    if (!hasLocalStorage()) return null;
    return window.localStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    if (asyncStorage) return asyncStorage.setItem(key, value);
    if (!hasLocalStorage()) return;
    window.localStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    if (asyncStorage) return asyncStorage.removeItem(key);
    if (!hasLocalStorage()) return;
    window.localStorage.removeItem(key);
  },
};
