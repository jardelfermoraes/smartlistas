export type StorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export const storage: StorageLike = {
  async getItem(key: string) {
    if (!hasLocalStorage()) return null;
    return window.localStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    if (!hasLocalStorage()) return;
    window.localStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    if (!hasLocalStorage()) return;
    window.localStorage.removeItem(key);
  },
};
