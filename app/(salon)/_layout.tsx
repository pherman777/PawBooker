import { Stack } from 'expo-router';
import { View } from 'react-native';

import { BusinessAssistantFab } from '@/components/BusinessAssistantFab';

export default function SalonLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      <BusinessAssistantFab />
    </View>
  );
}
