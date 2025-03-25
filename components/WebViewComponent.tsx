import AsyncStorage from '@react-native-async-storage/async-storage';
import CookieManager, { type Cookies } from '@react-native-cookies/cookies';
import { useContext, useEffect, useRef, useState } from 'react';
import { BackHandler, Dimensions, Platform, StyleSheet, View } from 'react-native';
import * as Progress from 'react-native-progress';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { WebViewProgressEvent } from 'react-native-webview/lib/WebViewTypes';
import { CurrentUrlContext } from '@/hooks/useCurrentUrlContext';

const { height, width } = Dimensions.get('screen');

const COOKIE_STORAGE_KEY = 'persistedCookies';
const SITE_URL = 'https://freedium.cfd';

interface WebViewComponentProps {
  uri: string;
}

export default function WebViewComponent({ uri }: WebViewComponentProps) {
  const webViewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const [loading, setLoading] = useState(true);
  const [percentageLoaded, setPercentageLoaded] = useState(0);

  const [_, setCurrentUrl] = useContext(CurrentUrlContext);

  useEffect(() => {
    const restoreCookies = async () => {
      const savedCookies = await AsyncStorage.getItem(COOKIE_STORAGE_KEY);
      if (savedCookies) {
        const parsedCookies: Cookies = JSON.parse(savedCookies);
        await Promise.all(
          Object.entries(parsedCookies).map(([cookieName, cookie]) =>
            CookieManager.set(SITE_URL, {
              name: cookieName,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path || '/',
              version: '1',
              expires: cookie.expires || undefined,
            }),
          ),
        );
      }
      setLoading(false);
    };
    restoreCookies();
  }, []);

  useEffect(() => {
    const onAndroidBackPress = () => {
      if (canGoBackRef.current) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    };

    if (Platform.OS === 'android') {
      BackHandler.addEventListener('hardwareBackPress', onAndroidBackPress);
      return () => BackHandler.removeEventListener('hardwareBackPress', onAndroidBackPress);
    }
  }, []);

  const onNavigationStateChange = async (event: WebViewNavigation) => {
    setCurrentUrl(event.url);
    const cookies = await CookieManager.get(SITE_URL);
    await AsyncStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify(cookies));
  };

  const onLoadProgress = (event: WebViewProgressEvent) => {
    canGoBackRef.current = event.nativeEvent.canGoBack;
    setPercentageLoaded(event.nativeEvent.progress);
  };

  const onLoadStart = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
    setLoading(true);
  };

  const onLoadEnd = () => {
    const timeout = setTimeout(() => setLoading(false), 500);
    timeoutRef.current = timeout;
  };

  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={webViewRef}
        style={styles.container}
        source={{ uri: `${SITE_URL}/${uri}` }}
        originWhitelist={[SITE_URL]}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        onNavigationStateChange={onNavigationStateChange}
        allowsBackForwardNavigationGestures
        onLoadStart={onLoadStart}
        onLoadEnd={onLoadEnd}
        onLoadProgress={onLoadProgress}
      />
      {loading && (
        <Progress.Bar
          style={styles.progressBar}
          progress={percentageLoaded}
          height={3}
          borderRadius={0}
          borderWidth={0}
          width={width}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height,
    width,
    overflow: 'hidden',
  },
  progressBar: {
    position: 'absolute',
    top: 10,
  },
});
