import { useURL } from 'expo-linking';
import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/ThemedView';
import WebViewComponent from '@/components/WebViewComponent';

export default function HomeScreen() {
  const url = useURL();

  return (
    <ThemedView style={styles.container}>
      <WebViewComponent uri={url || ''} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#1a1c24',
    marginTop: -10,
  },
});
