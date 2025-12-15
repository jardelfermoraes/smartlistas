export const theme = {
  colors: {
    brand: {
      primary: '#15803d',
      primaryDark: '#166534',
      accent: '#0ea5e9',
    },
    text: {
      primary: '#0f172a',
      secondary: '#475569',
      muted: '#64748b',
      inverse: '#ffffff',
    },
    bg: {
      app: '#f8fafc',
      surface: '#ffffff',
      surfaceAlt: '#f1f5f9',
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
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
  },
  font: {
    size: {
      xs: 12,
      sm: 13,
      md: 15,
      lg: 18,
      xl: 22,
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
