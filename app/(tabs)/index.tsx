import { useURL } from 'expo-linking';
import { StyleSheet } from 'react-native';

import { ThemedView } from '@/components/ThemedView';
import WebViewComponent from '@/components/WebViewComponent';

export default function HomeScreen() {
  const url = useURL();

  return (
    <ThemedView style={styles.container}>
      {/* TEXT and URL */}
      {/* {!!shareIntent.text && <Text style={styles.gap}>{shareIntent.text}</Text>} */}
      <WebViewComponent uri={url || 'https://freedium.cfd/'} />
      {/* {!!shareIntent.meta?.title && (
        <Text style={styles.gap}>{JSON.stringify(shareIntent.meta)}</Text>
      )} */}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
  gap: {
    marginBottom: 20,
  },
  bold: {
    fontWeight: 'bold',
  },
  meta: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
    // backgroundColor: '#1a1c24'
    marginTop: -10,
  },
});
