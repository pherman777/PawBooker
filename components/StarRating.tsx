import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';

type Props = {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
};

export function StarRating({ value, onChange, size = 22 }: Props) {
  const stars = [1, 2, 3, 4, 5];
  const interactive = Boolean(onChange);

  return (
    <View style={styles.row}>
      {stars.map((star) =>
        interactive ? (
          <Pressable key={star} onPress={() => onChange?.(star)} hitSlop={4}>
            <Ionicons
              name={star <= value ? 'star' : 'star-outline'}
              size={size}
              color={Colors.light.warning}
            />
          </Pressable>
        ) : (
          <Ionicons
            key={star}
            name={star <= value ? 'star' : 'star-outline'}
            size={size}
            color={Colors.light.warning}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
  },
});
