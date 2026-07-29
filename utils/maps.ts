import { Linking, Platform } from 'react-native';

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export async function openDirections(destination: Coordinates, origin?: Coordinates) {
  if (origin) {
    const url =
      Platform.OS === 'ios'
        ? `maps://?saddr=${origin.latitude},${origin.longitude}&daddr=${destination.latitude},${destination.longitude}&dirflg=d`
        : `https://www.google.com/maps/dir/?api=1&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}`;
    await Linking.openURL(url);
    return;
  }

  const nativeUrl =
    Platform.OS === 'ios'
      ? `maps://?daddr=${destination.latitude},${destination.longitude}&dirflg=d`
      : Platform.OS === 'android'
        ? `google.navigation:q=${destination.latitude},${destination.longitude}`
        : null;

  if (nativeUrl && (await Linking.canOpenURL(nativeUrl))) {
    await Linking.openURL(nativeUrl);
    return;
  }

  await Linking.openURL(
    `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}`
  );
}
