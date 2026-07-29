import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AddressSearchInput } from '@/components/AddressSearchInput';
import { Colors } from '@/constants/theme';
import { notify } from '@/utils/confirm';
import { openDirections, type Coordinates } from '@/utils/maps';

type Props = {
  destination: Coordinates;
};

export function DirectionsButton({ destination }: Props) {
  const [choosingOrigin, setChoosingOrigin] = useState(false);

  function handlePress() {
    openDirections(destination).catch(() =>
      notify('Could not open maps', 'Make sure you have a maps app installed.')
    );
  }

  return (
    <View>
      <Pressable style={styles.button} onPress={handlePress}>
        <Text style={styles.buttonText}>Get directions</Text>
      </Pressable>

      {choosingOrigin ? (
        <View style={styles.originWrapper}>
          <AddressSearchInput
            onSelect={(location) => {
              setChoosingOrigin(false);
              openDirections(destination, location).catch(() =>
                notify('Could not open maps', 'Make sure you have a maps app installed.')
              );
            }}
          />
        </View>
      ) : (
        <Pressable onPress={() => setChoosingOrigin(true)}>
          <Text style={styles.linkText}>Starting from somewhere else?</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.light.border,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.tint,
  },
  linkText: {
    marginTop: 8,
    fontSize: 13,
    color: Colors.light.textMuted,
    textDecorationLine: 'underline',
  },
  originWrapper: {
    marginTop: 8,
  },
});
