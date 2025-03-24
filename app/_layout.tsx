import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Linking, useColorScheme, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import Toast from 'react-native-toast-message';
import { CurrentUrlContext } from '@/hooks/useCurrentUrlContext';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  const [currentUrl, setCurrentUrl] = useState('https://freedium.cfd');

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  const copyToClipboard = async () => {
    await Clipboard.setStringAsync(currentUrl);
    Toast.show({
      type: 'success',
      text1: 'URL copied to clipboard',
    });
  };

  const openInBrowser = () => {
    Linking.openURL(currentUrl);
  };

  return (
    <CurrentUrlContext.Provider value={[currentUrl, setCurrentUrl]}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen
            name="(tabs)"
            options={{
              title: currentUrl,
              headerTitle: ({ children }) => (
                <View style={styles.titleContainer}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={styles.urlText}>
                    {children}
                  </Text>
                  <TouchableOpacity onPress={copyToClipboard}>
                    <Ionicons name="copy-outline" size={22} color="#007AFF" />
                  </TouchableOpacity>
                </View>
              ),
              headerRight: () => (
                <TouchableOpacity onPress={openInBrowser}>
                  <Ionicons name="open-outline" size={22} color="#007AFF" />
                </TouchableOpacity>
              ),
            }}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
      </ThemeProvider>
      <Toast position="bottom" />
    </CurrentUrlContext.Provider>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 65,
  },
  urlText: {
    flex: 1,
    fontSize: 14,
    color: '#000',
    marginRight: 8,
  },
});
