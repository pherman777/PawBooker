import { Stack } from 'expo-router';
import { View } from 'react-native';

import { BusinessAssistantFab } from '@/components/BusinessAssistantFab';
import { SalonWebNav } from '@/components/SalonWebNav';

export default function SalonLayout() {
  return (
    <View style={{ flex: 1 }}>
      <SalonWebNav />
      <Stack screenOptions={{ headerShown: false }} />
      <BusinessAssistantFab />
    </View>
  );
}
