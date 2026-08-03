import type { ReactNode, RefObject } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getKeyboardBehavior, getScreenPadding } from '../layout/mobileLayout';
import { theme } from '../theme';

type ScreenScrollProps = {
  children: ReactNode;
  hasTabs?: boolean;
  scrollViewRef?: RefObject<ScrollView | null>;
};

export function ScreenScroll({ children, hasTabs = false, scrollViewRef }: ScreenScrollProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView behavior={getKeyboardBehavior(Platform.OS)} style={styles.keyboardAvoidingView}>
      <ScrollView
        ref={scrollViewRef}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.content, getScreenPadding(insets, hasTabs)]}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: { flex: 1 },
  content: { gap: theme.spacing.lg, paddingHorizontal: theme.spacing.lg },
});
