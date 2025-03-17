import { WebView } from 'react-native-webview';
import Constants from 'expo-constants';
import { Dimensions, StyleSheet } from 'react-native';
import React from 'react';
const height = Dimensions.get('screen').height;
const width = Dimensions.get('screen').width;

export default function App({ uri }) {
  console.log('++++++++ URI', uri);
  return <WebView style={styles.container} source={{ uri: ' https://freedium.cfd/' + uri }} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: Constants.statusBarHeight,
    height,
    width,
    overflow: 'hidden',
  },
});
