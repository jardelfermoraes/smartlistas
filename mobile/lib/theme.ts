import { useColorScheme } from '@/components/useColorScheme';

const tokens = {
  radius: {
    sm: 12,
    md: 16,
    lg: 22,
  },
  spacing: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 28,
  },
  font: {
    size: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 20,
      xl: 24,
    },
    weight: {
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
    },
  },
} as const;

export type AppTheme = {
  name: ThemeName;
  colors: {
    brand: {
      primary: string;
      primaryDark: string;
      accent: string;
    };
    text: {
      primary: string;
      secondary: string;
      muted: string;
      inverse: string;
    };
    bg: {
      app: string;
      surface: string;
      surfaceAlt: string;
    };
    border: {
      subtle: string;
    };
    danger: {
      base: string;
      soft: string;
      text: string;
    };
  };
} & typeof tokens;

export const lightTheme: AppTheme = {
  name: 'light',
  colors: {
    brand: {
      primary: '#2563eb',
      primaryDark: '#1e3a8a',
      accent: '#0ea5e9',
    },
    text: {
      primary: '#0f172a',
      secondary: '#475569',
      muted: '#64748b',
      inverse: '#ffffff',
    },
    bg: {
      app: '#f2f2f7',
      surface: '#ffffff',
      surfaceAlt: '#f8fafc',
    },
    border: {
      subtle: '#e5e7eb',
    },
    danger: {
      base: '#ef4444',
      soft: '#fee2e2',
      text: '#b91c1c',
    },
  },
  ...tokens,
};

export const darkTheme: AppTheme = {
  name: 'dark',
  colors: {
    brand: {
      primary: '#3b82f6',
      primaryDark: '#1d4ed8',
      accent: '#38bdf8',
    },
    text: {
      primary: '#f8fafc',
      secondary: '#cbd5e1',
      muted: '#94a3b8',
      inverse: '#0b1220',
    },
    bg: {
      app: '#0b1220',
      surface: '#0f172a',
      surfaceAlt: '#111c2e',
    },
    border: {
      subtle: 'rgba(148,163,184,0.25)',
    },
    danger: {
      base: '#ef4444',
      soft: 'rgba(239,68,68,0.16)',
      text: '#fca5a5',
    },
  },
  ...tokens,
};

export type ThemeName = 'light' | 'dark';

export function getTheme(name: ThemeName): AppTheme {
  return name === 'dark' ? darkTheme : lightTheme;
}

export function useTheme(): AppTheme {
  const scheme = useColorScheme() ?? 'light';
  return getTheme(scheme);
}

export const theme = lightTheme;
