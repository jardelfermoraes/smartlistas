import { PropsWithChildren } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

type Props = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>;

export function Card({ children, style }: Props) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          borderRadius: theme.radius.md,
          padding: theme.spacing.lg,
          borderWidth: 1,
          borderColor: theme.colors.border.subtle,
          backgroundColor: theme.colors.bg.surface,
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 1,
        },
        style,
      ]}>
      {children}
    </View>
  );
}
