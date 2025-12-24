import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useNativeColorScheme } from 'react-native';

export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeModeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isLoaded: boolean;
};

const STORAGE_KEY = '@smartlistas/theme_mode';

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'system' || stored === 'light' || stored === 'dark') {
          setModeState(stored);
        }
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(() => ({ mode, setMode, isLoaded }), [isLoaded, mode, setMode]);

  return React.createElement(ThemeModeContext.Provider, { value }, children);
}

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) {
    return { mode: 'system', setMode: () => undefined, isLoaded: true };
  }
  return ctx;
}

export function useColorScheme() {
  const nativeScheme = (useNativeColorScheme() ?? 'light') as 'light' | 'dark';
  const { mode } = useThemeMode();
  if (mode === 'system') return nativeScheme;
  return mode;
}
