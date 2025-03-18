import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import WebViewComponent from '@/components/WebViewComponent';
import { useURL } from 'expo-linking';

export default function HomeScreen() {
  const url = useURL();

  if (url === null) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={[styles.gap, styles.bold]}>NO SHARED LINK DETECTED!!</ThemedText>
        <ThemedText style={[styles.gap, styles.bold]}>TRY SHARING A LINK FROM MEDIUM</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* TEXT and URL */}
      {/* {!!shareIntent.text && <Text style={styles.gap}>{shareIntent.text}</Text>} */}
      <WebViewComponent uri={url} />
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
