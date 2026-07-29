import { Alert, Platform } from 'react-native';

export function confirmAsync(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

type ActionSheetOption = {
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

export function showActionSheet(title: string, options: ActionSheetOption[]) {
  if (Platform.OS === 'web') {
    const labels = options.map((o, i) => `${i + 1}. ${o.label}`).join('\n');
    const choice = window.prompt(`${title}\n\n${labels}\n\nEnter a number, or Cancel:`);
    const index = choice ? parseInt(choice, 10) - 1 : -1;
    if (index >= 0 && index < options.length) options[index].onPress();
    return;
  }

  Alert.alert(title, undefined, [
    ...options.map((o) => ({
      text: o.label,
      style: o.destructive ? ('destructive' as const) : ('default' as const),
      onPress: o.onPress,
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}
