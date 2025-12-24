import { PropsWithChildren, useMemo } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

type Variant = 'primary' | 'secondary' | 'danger';

type Props = PropsWithChildren<{
  onPress?: () => void;
  disabled?: boolean;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
}>;

export function Button({ children, onPress, disabled, variant = 'primary', style }: Props) {
  const theme = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        base: {
          height: 46,
          borderRadius: theme.radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.md,
          borderWidth: 1,
        },
        text: {
          fontSize: theme.font.size.sm,
          fontWeight: theme.font.weight.bold,
        },
        pressed: {
          opacity: 0.92,
          transform: [{ scale: 0.98 }],
        },
        disabled: {
          opacity: 0.6,
        },
      }),
    [theme]
  );

  const variantStyles: Record<Variant, ViewStyle> = useMemo(
    () => ({
      primary: {
        backgroundColor: theme.colors.brand.primary,
        borderColor: theme.colors.brand.primary,
      },
      secondary: {
        backgroundColor: theme.colors.bg.surface,
        borderColor: theme.colors.border.subtle,
      },
      danger: {
        backgroundColor: theme.colors.danger.base,
        borderColor: theme.colors.danger.base,
      },
    }),
    [theme]
  );

  const textVariantStyles: Record<Variant, TextStyle> = useMemo(
    () => ({
      primary: { color: theme.colors.text.inverse },
      secondary: { color: theme.colors.text.primary },
      danger: { color: theme.colors.text.inverse },
    }),
    [theme]
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}>
      <Text allowFontScaling={false} maxFontSizeMultiplier={1.1} style={[styles.text, textVariantStyles[variant]]}>
        {children}
      </Text>
    </Pressable>
  );
}
