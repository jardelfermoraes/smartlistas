import { PropsWithChildren } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

import { useTheme } from '@/lib/theme';

type Props = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>;

export function Screen({ children, style }: Props) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          flex: 1,
          padding: theme.spacing.lg,
          backgroundColor: theme.colors.bg.app,
        },
        style,
      ]}>
      {children}
    </View>
  );
}
