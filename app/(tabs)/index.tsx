import { Image, StyleSheet, Platform, View, Dimensions } from 'react-native';

import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useShareIntent } from "expo-share-intent";
import { Text } from 'react-native';
import WebViewComponent from '@/components/WebViewComponent'
import React from 'react';
import * as SystemUI from 'expo-system-ui';
import { Appearance, useColorScheme } from 'react-native';


export default function HomeScreen() {
  let colorScheme = useColorScheme();
  console.log('COLOR SCGEME', colorScheme)
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntent();
  return (
    <ThemedView style={styles.container}>
      {!hasShareIntent &&
        <ThemedText style={[styles.gap, styles.bold]}>
          NO SHARED LINK DETECTED!!
        </ThemedText>
      }
      {!hasShareIntent &&
        <ThemedText style={[styles.gap, styles.bold]}>
          TRY SHARING A LINK FROM MEDIUM
        </ThemedText>
      }

      {/* TEXT and URL */}
      {/* {!!shareIntent.text && <Text style={styles.gap}>{shareIntent.text}</Text>} */}
      { !!shareIntent.webUrl && <WebViewComponent uri={shareIntent.webUrl} />}
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
    fontWeight: "bold",
  },
  meta: {
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: '100%', 
    width: '100%',
    overflow: 'hidden',
    // backgroundColor: '#1a1c24'
    marginTop: -10
  },
});
