import { MaterialIcons } from '@expo/vector-icons';
import CookieManager, { type Cookies } from '@preeternal/react-native-cookie-manager';
import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  PanResponder,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Progress from 'react-native-progress';
import Toast from 'react-native-toast-message';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import type { WebViewProgressEvent } from 'react-native-webview/lib/WebViewTypes';
import { Colors } from '@/constants/colors';
import { SITE_URL } from '@/constants/config';
import {
  CurrentUrlContext,
  HistoryContext,
  NavigateContext,
  ReloadContext,
} from '@/hooks/useCurrentUrlContext';
import {
  type DownloadedFile,
  downloadToCache,
  isPickerCancelled,
  openFile,
  saveDownload,
} from '@/modules/download';
import { openExternal } from '@/modules/open-in-browser';

// Chrome SwipeRefreshLayout values (dp maps 1:1 in RN)
const CIRCLE_DIAMETER = 40;
const DEFAULT_CIRCLE_TARGET = 64; // trigger distance (dampened drag)
const DRAG_RATE = 0.5;
const MAX_DRAG = DEFAULT_CIRCLE_TARGET * 2; // 128dp max overshoot
const ANIMATE_TO_TRIGGER_DURATION = 200;
const ANIMATE_TO_START_DURATION = 200;
const SCALE_DOWN_DURATION = 150;
const MAX_PROGRESS_ROTATION = 0.8; // 0.8 turns = 288 degrees
// Chrome: resting top = mSpinnerOffsetEnd - abs(mOriginalOffsetTop) = 64 - 40 = 24dp
// Our translateY = pullDistance - CIRCLE_DIAMETER/2, so pullDistance = 24 + 20 = 44
const RESTING_PULL_DISTANCE = DEFAULT_CIRCLE_TARGET - CIRCLE_DIAMETER / 2;

const COOKIE_STORAGE_KEY = 'persistedCookies';
const cookieStorage = createAsyncStorage(COOKIE_STORAGE_KEY);

const INJECTED_JS = `
  (function() {
    function getScrollTop() {
      return window.pageYOffset || document.documentElement.scrollTop || 0;
    }
    function postScroll(scrollTop) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'scrollPosition',
        scrollTop: scrollTop
      }));
    }
    let lastTop = 0;
    window.addEventListener('scroll', function() {
      var scrollTop = getScrollTop();
      if ((lastTop <= 1) !== (scrollTop <= 1)) {
        postScroll(scrollTop);
      }
      lastTop = scrollTop;
    }, { passive: true });
    postScroll(getScrollTop());
    // Re-check after browser scroll restoration (back/forward navigation).
    // Scroll restore happens during layout, so wait 2 frames to be sure.
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        postScroll(getScrollTop());
      });
    });

    document.addEventListener('contextmenu', function(e) {
      var el = e.target;
      while (el && el.tagName !== 'A') el = el.parentElement;
      if (el && el.href) {
        e.preventDefault();
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'linkLongPress',
          url: el.href,
          text: el.textContent || ''
        }));
      }
    });

    if (window.location.pathname.length > 1) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'pageInfo',
        title: document.title || window.location.pathname.slice(1),
        url: window.location.href
      }));
    }

    // Freedium's "Download as PDF" POSTs /api/pdf, then hands the resulting blob
    // to an <a download> click. Android WebView never routes blob: URLs to its
    // DownloadListener and ignores the download attribute, so that click is inert
    // and the download silently never happens. Intercept the request instead and
    // let the native side replay it and save the file.
    if (!window.__nativeDownload) {
      var pendingDownloads = {};
      var nextDownloadId = 1;

      // Called from native once the download settles. Idempotent, so the native
      // side can call it from both its success and failure paths.
      window.__nativeDownload = function(id) {
        var settle = pendingDownloads[id];
        if (!settle) return;
        delete pendingDownloads[id];
        settle();
      };

      var originalFetch = window.fetch;
      window.fetch = function(input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        var body = init && typeof init.body === 'string' ? init.body : null;

        if (method === 'POST' && body !== null && /\\/api\\/pdf(?:[?#]|$)/.test(url)) {
          var id = nextDownloadId++;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'nativeDownload',
            id: id,
            url: new URL(url, window.location.href).href,
            body: body,
            userAgent: navigator.userAgent,
            referer: window.location.href
          }));

          // Resolve only once the native download settles, so the page's own
          // "generating" state keeps guarding against a second tap. The empty
          // blob it then feeds to <a download> goes nowhere, which is fine.
          return new Promise(function(resolve) {
            pendingDownloads[id] = function() {
              resolve(new Response(new Blob([], { type: 'application/pdf' }), {
                status: 200,
                headers: { 'content-type': 'application/pdf' }
              }));
            };
          });
        }

        return originalFetch.apply(window, arguments);
      };
    }
  })();
  true;
`;

interface WebViewComponentProps {
  uri: string;
}

/** Payload posted by the fetch interceptor in {@link INJECTED_JS}. */
interface NativeDownloadRequest {
  id: number;
  url: string;
  body: string;
  userAgent?: string;
  referer?: string;
}

export default function WebViewComponent({ uri }: WebViewComponentProps) {
  const webViewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [percentageLoaded, setPercentageLoaded] = useState(0);
  const [longPressedLink, setLongPressedLink] = useState<string | null>(null);
  const menuSlide = useRef(new Animated.Value(300)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [, setCurrentUrl] = useContext(CurrentUrlContext);
  const reloadRef = useContext(ReloadContext);
  const navigateRef = useContext(NavigateContext);
  const { addEntry } = useContext(HistoryContext);
  const isDark = useColorScheme() === 'dark';
  const theme = Colors[isDark ? 'dark' : 'light'];
  const { height, width } = useWindowDimensions();

  const isAtTopRef = useRef(true);
  const wasAtTopOnTouchStartRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const pullDistance = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        wasAtTopOnTouchStartRef.current = isAtTopRef.current;
        return false;
      },
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !isRefreshingRef.current &&
        wasAtTopOnTouchStartRef.current &&
        gestureState.dy > 5 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          const dampened = Math.min(gestureState.dy * DRAG_RATE, MAX_DRAG);
          pullDistance.setValue(dampened);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const dampened = gestureState.dy * DRAG_RATE;
        if (dampened >= DEFAULT_CIRCLE_TARGET) {
          isRefreshingRef.current = true;
          Animated.timing(pullDistance, {
            toValue: RESTING_PULL_DISTANCE,
            duration: ANIMATE_TO_TRIGGER_DURATION,
            useNativeDriver: false,
          }).start(() => {
            impactAsync(ImpactFeedbackStyle.Medium);
            const loop = Animated.loop(
              Animated.timing(spinAnim, {
                toValue: 1,
                duration: 700,
                useNativeDriver: false,
              }),
            );
            spinLoopRef.current = loop;
            loop.start();
            webViewRef.current?.injectJavaScript('window.location.reload(); true;');
          });
        } else {
          Animated.timing(pullDistance, {
            toValue: 0,
            duration: ANIMATE_TO_START_DURATION,
            useNativeDriver: false,
          }).start();
        }
      },
    }),
  ).current;

  const settleDownload = (id: number) => {
    webViewRef.current?.injectJavaScript(
      `window.__nativeDownload && window.__nativeDownload(${id}); true;`,
    );
  };

  const handleNativeDownload = async (request: NativeDownloadRequest) => {
    Toast.show({ type: 'info', text1: 'Preparing download' });

    let file: DownloadedFile;
    try {
      const cookies = await CookieManager.get(SITE_URL);
      const cookie = Object.values(cookies)
        .map((entry) => `${entry.name}=${entry.value}`)
        .join('; ');
      file = await downloadToCache({ ...request, cookie, fallbackFilename: 'article.pdf' });
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Download failed',
        text2: error instanceof Error ? error.message : undefined,
      });
      return;
    } finally {
      // Release the page's intercepted fetch either way, so its "generating"
      // guard clears instead of blocking every later attempt.
      settleDownload(request.id);
    }

    try {
      const saved = await saveDownload(file);
      Toast.show({
        type: 'success',
        text1: `Saved ${saved.savedName}`,
        text2: 'Tap to open',
        onPress: () => {
          Toast.hide();
          // Opened from the cache copy, whose URI the app can grant access to.
          openFile(saved.cached).catch(() =>
            Toast.show({ type: 'error', text1: 'No app available to open this file' }),
          );
        },
      });
    } catch (error) {
      // Backing out of the folder picker is a choice, not a failure.
      if (isPickerCancelled(error)) return;
      Toast.show({
        type: 'error',
        text1: 'Could not save the file',
        text2: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const onWebViewMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'scrollPosition') {
        isAtTopRef.current = data.scrollTop <= 1;
      } else if (data.type === 'linkLongPress') {
        setLongPressedLink(data.url);
      } else if (data.type === 'pageInfo') {
        addEntry(data.url, data.title);
      } else if (data.type === 'nativeDownload') {
        handleNativeDownload(data);
      }
    } catch {
      // ignore non-JSON messages
    }
  };

  useEffect(() => {
    if (longPressedLink) {
      menuSlide.setValue(300);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(menuSlide, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [longPressedLink, menuSlide, backdropOpacity]);

  const dismissLinkMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(menuSlide, {
        toValue: 300,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(() => setLongPressedLink(null));
  }, [backdropOpacity, menuSlide]);

  const copyLink = async () => {
    if (!longPressedLink) return;
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(longPressedLink);
    dismissLinkMenu();
    Toast.show({
      type: 'success',
      text1: 'URL copied to clipboard',
    });
  };

  const shareLink = async () => {
    if (!longPressedLink) return;
    await Share.share({ url: longPressedLink, message: longPressedLink });
    dismissLinkMenu();
  };

  const openLink = () => {
    if (!longPressedLink) return;
    openExternal(longPressedLink);
    dismissLinkMenu();
  };

  const INJECTED_JS_BEFORE_CONTENT = `
    try { localStorage.setItem('theme', '${isDark ? 'dark' : 'light'}'); } catch(e) {}
    true;
  `;

  const resetPullIndicator = () => {
    if (spinLoopRef.current) {
      spinLoopRef.current.stop();
      spinLoopRef.current = null;
    }
    spinAnim.setValue(0);
    isRefreshingRef.current = false;
    Animated.timing(pullDistance, {
      toValue: 0,
      duration: SCALE_DOWN_DURATION,
      useNativeDriver: false,
    }).start();
  };

  useEffect(() => {
    reloadRef.current = () =>
      webViewRef.current?.injectJavaScript('window.location.reload(); true;');
    navigateRef.current = (url: string) =>
      webViewRef.current?.injectJavaScript(`window.location.href = ${JSON.stringify(url)}; true;`);
    return () => {
      reloadRef.current = null;
      navigateRef.current = null;
    };
  }, [reloadRef, navigateRef]);

  useEffect(() => {
    const restoreCookies = async () => {
      const savedCookies = await cookieStorage.getItem(COOKIE_STORAGE_KEY);
      if (savedCookies) {
        try {
          const parsedCookies: Cookies = JSON.parse(savedCookies);
          await Promise.all(
            Object.values(parsedCookies).map((cookie) => CookieManager.set(SITE_URL, cookie)),
          );
        } catch {
          await cookieStorage.removeItem(COOKIE_STORAGE_KEY);
        }
      }
      setIsLoading(false);
    };
    restoreCookies();
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
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
      const backHandler = BackHandler.addEventListener('hardwareBackPress', onAndroidBackPress);
      return () => backHandler.remove();
    }
  }, []);

  useEffect(() => {
    if (!longPressedLink || Platform.OS !== 'android') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissLinkMenu();
      return true;
    });
    return () => handler.remove();
  }, [dismissLinkMenu, longPressedLink]);

  const onNavigationStateChange = async (event: WebViewNavigation) => {
    setCurrentUrl(event.url);
    const cookies = await CookieManager.get(SITE_URL);
    await cookieStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify(cookies));
  };

  const onLoadProgress = (event: WebViewProgressEvent) => {
    canGoBackRef.current = event.nativeEvent.canGoBack;
    setPercentageLoaded(event.nativeEvent.progress);
  };

  const onShouldStartLoadWithRequest = (request: { url: string }) => {
    if (request.url.startsWith(SITE_URL)) {
      return true;
    }
    openExternal(request.url);
    return false;
  };

  const onLoadStart = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
    setIsLoading(true);
  };

  const onLoadEnd = () => {
    resetPullIndicator();
    const timeout = setTimeout(() => setIsLoading(false), 500);
    timeoutRef.current = timeout;
  };

  // Circle follows finger, offset so center aligns with pullDistance
  const indicatorTranslateY = Animated.subtract(pullDistance, CIRCLE_DIAMETER / 2);

  const indicatorScale = pullDistance.interpolate({
    inputRange: [0, DEFAULT_CIRCLE_TARGET * 0.5, DEFAULT_CIRCLE_TARGET],
    outputRange: [0, 0.75, 1],
    extrapolate: 'clamp',
  });

  // Arrow rotates 0.8 turns (288deg) during pull, matching Chrome's MAX_PROGRESS_ANGLE
  const arrowRotation = pullDistance.interpolate({
    inputRange: [0, DEFAULT_CIRCLE_TARGET],
    outputRange: ['0deg', `${MAX_PROGRESS_ROTATION * 360}deg`],
    extrapolate: 'clamp',
  });

  // Spinner rotation while refreshing
  const spinRotation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View
      style={[styles.wrapper, { backgroundColor: theme.background }]}
      {...panResponder.panHandlers}>
      <WebView
        ref={webViewRef}
        style={[styles.container, { height, width }]}
        source={{ uri: `${SITE_URL}${uri}` }}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onNavigationStateChange={onNavigationStateChange}
        allowsBackForwardNavigationGestures
        onLoadStart={onLoadStart}
        onLoadEnd={onLoadEnd}
        onLoadProgress={onLoadProgress}
        onMessage={onWebViewMessage}
        injectedJavaScriptBeforeContentLoaded={INJECTED_JS_BEFORE_CONTENT}
        injectedJavaScript={INJECTED_JS}
        domStorageEnabled={true}
      />
      {/* Floating refresh indicator — overlays content like Chrome */}
      <Animated.View
        style={[
          styles.indicatorCircle,
          {
            backgroundColor: theme.refreshIndicatorBg,
            transform: [
              { translateY: indicatorTranslateY },
              { scale: indicatorScale },
              { rotate: spinRotation },
            ],
          },
        ]}>
        <Animated.View style={{ transform: [{ rotate: arrowRotation }] }}>
          <MaterialIcons name="refresh" size={24} color={Colors.shared.refreshIcon} />
        </Animated.View>
      </Animated.View>
      {isLoading && (
        <Progress.Bar
          style={styles.progressBar}
          progress={percentageLoaded}
          height={3}
          borderRadius={0}
          borderWidth={0}
          width={width}
        />
      )}
      {longPressedLink && (
        <View style={styles.menuContainer}>
          <Animated.View style={[styles.menuBackdrop, { opacity: backdropOpacity }]} />
          <Pressable style={styles.menuDismiss} onPress={dismissLinkMenu} />
          <Animated.View
            style={[
              styles.menuCard,
              { backgroundColor: theme.cardBackground, transform: [{ translateY: menuSlide }] },
            ]}>
            <Text numberOfLines={2} style={[styles.menuUrl, { color: theme.secondaryText }]}>
              {longPressedLink}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { backgroundColor: theme.btnPressOverlay },
              ]}
              onPress={copyLink}>
              <Text style={[styles.menuItemText, { color: theme.text }]}>Copy link</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { backgroundColor: theme.btnPressOverlay },
              ]}
              onPress={openLink}>
              <Text style={[styles.menuItemText, { color: theme.text }]}>Open in browser</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                pressed && { backgroundColor: theme.btnPressOverlay },
              ]}
              onPress={shareLink}>
              <Text style={[styles.menuItemText, { color: theme.text }]}>Share</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  progressBar: {
    position: 'absolute',
    top: 10,
    left: 0,
  },
  indicatorCircle: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: CIRCLE_DIAMETER,
    height: CIRCLE_DIAMETER,
    borderRadius: CIRCLE_DIAMETER / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  menuContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  menuDismiss: {
    flex: 1,
  },
  menuCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  menuUrl: {
    fontSize: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  menuItem: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  menuItemText: {
    fontSize: 16,
  },
});
