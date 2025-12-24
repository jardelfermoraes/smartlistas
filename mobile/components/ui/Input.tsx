import { useMemo, useState } from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

type Props = TextInputProps & {
  label?: string;
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
};

export function Input({ label, error, containerStyle, style, onFocus, onBlur, ...props }: Props) {
  const [isFocused, setIsFocused] = useState(false);
  const theme = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: {
          fontSize: theme.font.size.sm,
          fontWeight: theme.font.weight.semibold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.xs,
          marginTop: theme.spacing.sm,
        },
        input: {
          height: 46,
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
          borderRadius: theme.radius.sm,
          paddingHorizontal: 12,
          backgroundColor: theme.colors.bg.surface,
          color: theme.colors.text.primary,
          fontSize: theme.font.size.md,
        },
        inputFocused: {
          borderColor: theme.colors.brand.primary,
        },
        inputError: {
          borderColor: theme.colors.danger.base,
        },
        errorText: {
          marginTop: theme.spacing.xs,
          color: theme.colors.danger.text,
          fontSize: theme.font.size.xs,
        },
      }),
    [theme]
  );

  return (
    <View style={containerStyle}>
      {label ? (
        <Text allowFontScaling={false} maxFontSizeMultiplier={1.1} style={styles.label}>
          {label}
        </Text>
      ) : null}
      <TextInput
        {...props}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, isFocused ? styles.inputFocused : null, style, error ? styles.inputError : null]}
        placeholderTextColor={theme.colors.text.muted}
        allowFontScaling={false}
        maxFontSizeMultiplier={(props as any).maxFontSizeMultiplier ?? 1.1}
      />
      {error ? (
        <Text allowFontScaling={false} maxFontSizeMultiplier={1.1} style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
