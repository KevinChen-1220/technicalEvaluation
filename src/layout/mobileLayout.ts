import { theme } from '../theme';

type SafeAreaInsets = {
  top: number;
  bottom: number;
};

export function getScreenPadding(insets: SafeAreaInsets, hasTabs: boolean) {
  return {
    paddingTop: insets.top + theme.spacing.lg,
    paddingBottom: insets.bottom + theme.spacing.xl + (hasTabs ? 72 : 0),
  };
}

export function getKeyboardBehavior(platform: string): 'padding' | 'height' {
  return platform === 'ios' ? 'padding' : 'height';
}
