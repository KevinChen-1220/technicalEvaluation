import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { getLoadingDotDelay } from './loadingAnimation';

export function LoadingDots() {
  const values = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    const loops = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(getLoadingDotDelay(index as 0 | 1 | 2)),
          Animated.timing(value, { duration: 280, toValue: 1, useNativeDriver: true }),
          Animated.timing(value, { duration: 280, toValue: 0, useNativeDriver: true }),
        ]),
      ),
    );

    loops.forEach((loop) => loop.start());

    return () => {
      loops.forEach((loop) => loop.stop());
      values.forEach((value) => value.setValue(0));
    };
  }, [values]);

  return (
    <View style={styles.dots}>
      {values.map((value, index) => (
        <Animated.View
          key={index}
          style={[
            styles.dot,
            {
              opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
              transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [2, -2] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 4 },
  dot: { backgroundColor: theme.colors.surface, borderRadius: 3, height: 6, width: 6 },
});
